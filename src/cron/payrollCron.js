const cron = require('node-cron');
const { generatePayrollRun, previousPeriod } = require('../services/payrollService');

function scheduleMonthlyPayroll() {
  const schedule = process.env.PAYROLL_CRON || '0 3 1 * *'; // 03:00 on the 1st of every month

  cron.schedule(schedule, () => {
    const { year, month } = previousPeriod();
    try {
      const slips = generatePayrollRun(year, month, 'system:cron');
      console.log(`[payroll] Auto-generated ${slips.length} payslips for ${year}-${String(month).padStart(2, '0')}`);
    } catch (err) {
      console.error('[payroll] Automatic monthly payroll run failed:', err);
    }
  });

  console.log(`[payroll] Monthly payroll cron scheduled: "${schedule}"`);
}

module.exports = { scheduleMonthlyPayroll };
