const db = require('../db/init');

const WEEKEND_DAYS = new Set([5, 6]); // Friday, Saturday (Egypt work week)

function pad(n) { return String(n).padStart(2, '0'); }
function toISODate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function workingDaysInMonth(year, month) {
  const total = daysInMonth(year, month);
  const days = [];
  for (let d = 1; d <= total; d++) {
    const date = new Date(year, month - 1, d);
    if (!WEEKEND_DAYS.has(date.getDay())) days.push(toISODate(year, month, d));
  }
  return days;
}

function computeEmployeeMonth(employee, year, month) {
  const monthStart = toISODate(year, month, 1);
  const monthEnd = toISODate(year, month, daysInMonth(year, month));
  const workDays = workingDaysInMonth(year, month);

  const presentDates = new Set(
    db
      .prepare(
        `SELECT DISTINCT date(ts) AS d FROM attendance
         WHERE employee_id = ? AND type = 'checkin' AND date(ts) BETWEEN ? AND ?`
      )
      .all(employee.id, monthStart, monthEnd)
      .map((r) => r.d)
  );

  const approvedLeaves = db
    .prepare(
      `SELECT leave_type, start_date, end_date FROM leaves
       WHERE employee_id = ? AND status = 'approved'
         AND start_date <= ? AND end_date >= ?`
    )
    .all(employee.id, monthEnd, monthStart);

  const paidLeaveDates = new Set();
  const unpaidLeaveDates = new Set();
  for (const lv of approvedLeaves) {
    for (const day of workDays) {
      if (day >= lv.start_date && day <= lv.end_date) {
        (lv.leave_type === 'unpaid' ? unpaidLeaveDates : paidLeaveDates).add(day);
      }
    }
  }

  let presentCount = 0;
  let unpaidCount = 0;
  for (const day of workDays) {
    if (presentDates.has(day) || paidLeaveDates.has(day)) {
      presentCount++;
    } else {
      // covers explicit unpaid leave AND unexplained absence
      unpaidCount++;
    }
  }

  const perDayRate = workDays.length ? employee.base_salary / workDays.length : 0;
  const deductions = Math.round(unpaidCount * perDayRate * 100) / 100;
  const netPay = Math.round((employee.base_salary - deductions) * 100) / 100;

  return {
    employeeId: employee.id,
    baseSalary: employee.base_salary,
    workingDays: workDays.length,
    presentDays: presentCount,
    unpaidLeaveDays: unpaidCount,
    deductions,
    netPay,
    details: {
      unpaidLeaveDates: [...unpaidLeaveDates],
      perDayRate: Math.round(perDayRate * 100) / 100,
    },
  };
}

function generatePayrollRun(year, month, generatedBy = 'system') {
  const employees = db
    .prepare(`SELECT * FROM employees WHERE active = 1 AND hire_date <= ?`)
    .all(toISODate(year, month, daysInMonth(year, month)));

  const upsertRun = db.prepare(
    `INSERT INTO payroll_runs (period_year, period_month, generated_by)
     VALUES (?, ?, ?)
     ON CONFLICT(period_year, period_month) DO UPDATE SET generated_at = datetime('now'), generated_by = excluded.generated_by`
  );
  upsertRun.run(year, month, generatedBy);
  const run = db.prepare('SELECT * FROM payroll_runs WHERE period_year = ? AND period_month = ?').get(year, month);

  const upsertSlip = db.prepare(
    `INSERT INTO payslips (payroll_run_id, employee_id, base_salary, working_days, present_days, unpaid_leave_days, deductions, net_pay, details_json)
     VALUES (@payroll_run_id, @employee_id, @base_salary, @working_days, @present_days, @unpaid_leave_days, @deductions, @net_pay, @details_json)
     ON CONFLICT(payroll_run_id, employee_id) DO UPDATE SET
       base_salary=excluded.base_salary, working_days=excluded.working_days, present_days=excluded.present_days,
       unpaid_leave_days=excluded.unpaid_leave_days, deductions=excluded.deductions, net_pay=excluded.net_pay,
       details_json=excluded.details_json`
  );

  const results = employees.map((e) => computeEmployeeMonth(e, year, month));
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      upsertSlip.run({
        payroll_run_id: run.id,
        employee_id: r.employeeId,
        base_salary: r.baseSalary,
        working_days: r.workingDays,
        present_days: r.presentDays,
        unpaid_leave_days: r.unpaidLeaveDays,
        deductions: r.deductions,
        net_pay: r.netPay,
        details_json: JSON.stringify(r.details),
      });
    }
  });
  tx(results);

  return db.prepare('SELECT * FROM payslips WHERE payroll_run_id = ?').all(run.id);
}

function previousPeriod(date = new Date()) {
  const year = date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear();
  const month = date.getMonth() === 0 ? 12 : date.getMonth(); // getMonth() is 0-indexed -> previous calendar month
  return { year, month };
}

module.exports = { computeEmployeeMonth, generatePayrollRun, previousPeriod, workingDaysInMonth };
