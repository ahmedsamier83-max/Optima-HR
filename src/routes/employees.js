const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateUsername, generateTempPassword } = require('../utils/credentials');

const router = express.Router();

const usernameTaken = (u) => !!db.prepare('SELECT 1 FROM users WHERE username = ?').get(u);

router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, u.username, u.must_change_password
       FROM employees e LEFT JOIN users u ON u.employee_id = e.id
       ORDER BY e.active DESC, e.full_name`
    )
    .all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const user = db.prepare('SELECT username, must_change_password FROM users WHERE employee_id = ?').get(emp.id);
  res.json({ ...emp, username: user?.username || null });
});

router.post('/', (req, res) => {
  const { full_name, title, phone, email, base_salary, annual_leave_days, color, hire_date } = req.body || {};
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'اسم الموظف مطلوب' });
  }

  const insertEmp = db.prepare(
    `INSERT INTO employees (full_name, title, phone, email, base_salary, annual_leave_days, color, hire_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')))`
  );
  const info = insertEmp.run(
    full_name.trim(),
    title || null,
    phone || null,
    email || null,
    Number(base_salary) || 0,
    annual_leave_days != null ? Number(annual_leave_days) : 21,
    color || '#1a3c5e',
    hire_date || null
  );

  const employeeId = info.lastInsertRowid;
  const username = generateUsername(full_name, usernameTaken);
  const tempPassword = generateTempPassword();
  const hash = bcrypt.hashSync(tempPassword, 10);

  db.prepare(
    `INSERT INTO users (username, password_hash, role, employee_id, must_change_password) VALUES (?, ?, 'employee', ?, 1)`
  ).run(username, hash, employeeId);

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
  res.status(201).json({ employee, credentials: { username, tempPassword } });
});

router.put('/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });

  const fields = ['full_name', 'title', 'phone', 'email', 'base_salary', 'annual_leave_days', 'color', 'active'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];

  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  if (setClause) {
    db.prepare(`UPDATE employees SET ${setClause} WHERE id = @id`).run({ ...updates, id: emp.id });
  }
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(emp.id));
});

router.delete('/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  // soft delete: deactivate employee + login, keep history for payroll/leave records
  db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(emp.id);
  db.prepare('UPDATE users SET active = 0 WHERE employee_id = ?').run(emp.id);
  res.json({ ok: true });
});

router.post('/:id/reset-password', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const user = db.prepare('SELECT * FROM users WHERE employee_id = ?').get(emp.id);
  if (!user) return res.status(404).json({ error: 'لا يوجد حساب دخول لهذا الموظف' });

  const tempPassword = generateTempPassword();
  const hash = bcrypt.hashSync(tempPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, user.id);
  res.json({ username: user.username, tempPassword });
});

module.exports = router;
