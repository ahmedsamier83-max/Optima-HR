const express = require('express');
const db = require('../db/init');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function daysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.round((e - s) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function annualUsed(employeeId, year) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(days), 0) AS used FROM leaves
       WHERE employee_id = ? AND leave_type = 'annual' AND status = 'approved'
         AND strftime('%Y', start_date) = ?`
    )
    .get(employeeId, String(year));
  return row.used;
}

function balanceFor(employee) {
  const year = new Date().getFullYear();
  const used = annualUsed(employee.id, year);
  return { total: employee.annual_leave_days, used, remaining: employee.annual_leave_days - used };
}

// ── employee-facing ──

router.post('/', requireAuth, requireRole('employee'), (req, res) => {
  const { leave_type, start_date, end_date, reason } = req.body || {};
  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'تاريخ البداية والنهاية مطلوبان' });
  }
  const days = daysBetween(start_date, end_date);
  if (days <= 0) return res.status(400).json({ error: 'نطاق التاريخ غير صالح' });

  const type = ['annual', 'sick', 'unpaid', 'other'].includes(leave_type) ? leave_type : 'annual';

  if (type === 'annual') {
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.user.employeeId);
    const { remaining } = balanceFor(employee);
    if (days > remaining) {
      return res.status(400).json({ error: `رصيد الإجازات المتاح ${remaining} يوم فقط` });
    }
  }

  const info = db
    .prepare(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.employeeId, type, start_date, end_date, days, reason || null);

  res.status(201).json(db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/me', requireAuth, requireRole('employee'), (req, res) => {
  const rows = db
    .prepare('SELECT * FROM leaves WHERE employee_id = ? ORDER BY requested_at DESC')
    .all(req.user.employeeId);
  res.json(rows);
});

router.get('/balance', requireAuth, requireRole('employee'), (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.user.employeeId);
  res.json(balanceFor(employee));
});

router.delete('/:id', requireAuth, requireRole('employee'), (req, res) => {
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!leave || leave.employee_id !== req.user.employeeId) {
    return res.status(404).json({ error: 'الطلب غير موجود' });
  }
  if (leave.status !== 'pending') {
    return res.status(409).json({ error: 'لا يمكن إلغاء طلب تم البت فيه' });
  }
  db.prepare("UPDATE leaves SET status = 'cancelled' WHERE id = ?").run(leave.id);
  res.json({ ok: true });
});

// ── admin-facing ──

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const { status, employeeId } = req.query;
  let sql = `SELECT l.*, e.full_name FROM leaves l JOIN employees e ON e.id = l.employee_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (employeeId) { sql += ' AND l.employee_id = ?'; params.push(employeeId); }
  sql += ' ORDER BY l.requested_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/balance/:employeeId', requireAuth, requireRole('admin'), (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.employeeId);
  if (!employee) return res.status(404).json({ error: 'الموظف غير موجود' });
  res.json(balanceFor(employee));
});

router.post('/:id/decide', requireAuth, requireRole('admin'), (req, res) => {
  const { decision } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'القرار يجب أن يكون approved أو rejected' });
  }
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!leave) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (leave.status !== 'pending') return res.status(409).json({ error: 'تم البت في هذا الطلب بالفعل' });

  db.prepare('UPDATE leaves SET status = ?, decided_at = datetime(\'now\'), decided_by = ? WHERE id = ?').run(
    decision,
    req.user.sub,
    leave.id
  );
  res.json(db.prepare('SELECT * FROM leaves WHERE id = ?').get(leave.id));
});

module.exports = router;
