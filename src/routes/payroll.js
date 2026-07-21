const express = require('express');
const db = require('../db/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generatePayrollRun, previousPeriod } = require('../services/payrollService');

const router = express.Router();

// ── admin-facing ──

router.post('/generate', requireAuth, requireRole('admin'), (req, res) => {
  const body = req.body || {};
  const { year, month } = body.year && body.month ? { year: Number(body.year), month: Number(body.month) } : previousPeriod();
  if (month < 1 || month > 12) return res.status(400).json({ error: 'شهر غير صالح' });

  const slips = generatePayrollRun(year, month, `admin:${req.user.username}`);
  res.json({ year, month, count: slips.length, slips });
});

router.get('/runs', requireAuth, requireRole('admin'), (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT r.*, (SELECT COUNT(*) FROM payslips p WHERE p.payroll_run_id = r.id) AS employee_count
         FROM payroll_runs r ORDER BY r.period_year DESC, r.period_month DESC`
      )
      .all()
  );
});

router.get('/runs/:id', requireAuth, requireRole('admin'), (req, res) => {
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'غير موجود' });
  const slips = db
    .prepare(
      `SELECT p.*, e.full_name FROM payslips p JOIN employees e ON e.id = p.employee_id
       WHERE p.payroll_run_id = ? ORDER BY e.full_name`
    )
    .all(run.id);
  res.json({ run, slips });
});

// ── employee-facing ──

router.get('/me', requireAuth, requireRole('employee'), (req, res) => {
  const slips = db
    .prepare(
      `SELECT p.*, r.period_year, r.period_month FROM payslips p
       JOIN payroll_runs r ON r.id = p.payroll_run_id
       WHERE p.employee_id = ? ORDER BY r.period_year DESC, r.period_month DESC`
    )
    .all(req.user.employeeId);
  res.json(slips);
});

module.exports = router;
