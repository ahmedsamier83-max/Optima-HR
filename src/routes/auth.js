const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/init');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const failedAttempts = new Map(); // username -> { count, lockedUntil }

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  const attempt = failedAttempts.get(username);
  if (attempt && attempt.lockedUntil && attempt.lockedUntil > Date.now()) {
    const secs = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
    return res.status(423).json({ error: `الحساب مقفل مؤقتاً، حاول بعد ${secs} ثانية` });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const count = (attempt?.count || 0) + 1;
    const locked = count >= MAX_ATTEMPTS;
    failedAttempts.set(username, {
      count: locked ? 0 : count,
      lockedUntil: locked ? Date.now() + LOCK_MINUTES * 60000 : 0,
    });
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  failedAttempts.delete(username);

  let employee = null;
  if (user.employee_id) {
    employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(user.employee_id);
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    employeeId: user.employee_id || null,
    username: user.username,
  });

  res.json({
    token,
    role: user.role,
    mustChangePassword: !!user.must_change_password,
    employee,
    username: user.username,
  });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user || !bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  let employee = null;
  if (req.user.employeeId) {
    employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.user.employeeId);
  }
  res.json({ role: req.user.role, username: req.user.username, employee });
});

module.exports = router;
