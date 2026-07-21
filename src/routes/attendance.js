const express = require('express');
const db = require('../db/init');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function lastEvent(employeeId) {
  return db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? ORDER BY ts DESC, id DESC LIMIT 1')
    .get(employeeId);
}

function isClockedIn(employeeId) {
  const last = lastEvent(employeeId);
  return !!last && last.type === 'checkin';
}

// ── employee-facing ──

router.post('/checkin', requireAuth, requireRole('employee'), (req, res) => {
  const employeeId = req.user.employeeId;
  if (isClockedIn(employeeId)) {
    return res.status(409).json({ error: 'تم تسجيل الحضور بالفعل' });
  }
  const { lat, lng, address } = req.body || {};
  const info = db
    .prepare('INSERT INTO attendance (employee_id, type, lat, lng, address) VALUES (?, ?, ?, ?, ?)')
    .run(employeeId, 'checkin', lat ?? null, lng ?? null, address ?? null);
  res.status(201).json(db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/checkout', requireAuth, requireRole('employee'), (req, res) => {
  const employeeId = req.user.employeeId;
  if (!isClockedIn(employeeId)) {
    return res.status(409).json({ error: 'لم يتم تسجيل حضور بعد' });
  }
  const { lat, lng, address } = req.body || {};
  const info = db
    .prepare('INSERT INTO attendance (employee_id, type, lat, lng, address) VALUES (?, ?, ?, ?, ?)')
    .run(employeeId, 'checkout', lat ?? null, lng ?? null, address ?? null);
  res.status(201).json(db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/status', requireAuth, requireRole('employee'), (req, res) => {
  const last = lastEvent(req.user.employeeId);
  res.json({ clockedIn: !!last && last.type === 'checkin', last: last || null });
});

router.get('/me', requireAuth, requireRole('employee'), (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM attendance WHERE employee_id = ?';
  const params = [req.user.employeeId];
  if (from) { sql += ' AND date(ts) >= date(?)'; params.push(from); }
  if (to) { sql += ' AND date(ts) <= date(?)'; params.push(to); }
  sql += ' ORDER BY ts DESC';
  res.json(db.prepare(sql).all(...params));
});

// continuous GPS ping while clocked in — the core of "live location"
router.post('/ping', requireAuth, requireRole('employee'), (req, res) => {
  const employeeId = req.user.employeeId;
  if (!isClockedIn(employeeId)) {
    return res.status(409).json({ error: 'أرسل الموقع فقط أثناء الحضور' });
  }
  const { lat, lng, accuracy } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'إحداثيات غير صالحة' });
  }
  db.prepare('INSERT INTO location_pings (employee_id, lat, lng, accuracy) VALUES (?, ?, ?, ?)').run(
    employeeId,
    lat,
    lng,
    accuracy ?? null
  );
  res.status(201).json({ ok: true });
});

// ── admin-facing ──

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const { from, to, employeeId } = req.query;
  let sql = `SELECT a.*, e.full_name FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND date(a.ts) >= date(?)'; params.push(from); }
  if (to) { sql += ' AND date(a.ts) <= date(?)'; params.push(to); }
  if (employeeId) { sql += ' AND a.employee_id = ?'; params.push(employeeId); }
  sql += ' ORDER BY a.ts DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

// live status + last known location per active employee
router.get('/live', requireAuth, requireRole('admin'), (req, res) => {
  const employees = db.prepare('SELECT * FROM employees WHERE active = 1').all();
  const result = employees.map((e) => {
    const last = lastEvent(e.id);
    const clockedIn = !!last && last.type === 'checkin';
    const lastPing = db
      .prepare('SELECT * FROM location_pings WHERE employee_id = ? ORDER BY ts DESC LIMIT 1')
      .get(e.id);
    return {
      employee: e,
      clockedIn,
      since: clockedIn ? last.ts : null,
      lastLocation: lastPing || (clockedIn ? { lat: last.lat, lng: last.lng, ts: last.ts } : null),
    };
  });
  res.json(result);
});

// today's GPS trail for one employee, for the admin live map
router.get('/live/:employeeId', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT lat, lng, accuracy, ts FROM location_pings
       WHERE employee_id = ? AND date(ts) = date('now')
       ORDER BY ts ASC`
    )
    .all(req.params.employeeId);
  res.json(rows);
});

module.exports = router;
