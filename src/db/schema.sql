-- Optima HR schema

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  email TEXT,
  color TEXT DEFAULT '#1a3c5e',
  base_salary REAL NOT NULL DEFAULT 0,
  hire_date TEXT NOT NULL DEFAULT (date('now')),
  annual_leave_days REAL NOT NULL DEFAULT 21,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','employee')),
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_employee ON users(employee_id);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('checkin','checkout')),
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  lat REAL,
  lng REAL,
  address TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_ts ON attendance(employee_id, ts);

-- continuous GPS pings sent by the employee's browser while clocked in
CREATE TABLE IF NOT EXISTS location_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL
);

CREATE INDEX IF NOT EXISTS idx_pings_emp_ts ON location_pings(employee_id, ts);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'annual' CHECK(leave_type IN ('annual','sick','unpaid','other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(employee_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  generated_by TEXT NOT NULL DEFAULT 'system',
  UNIQUE(period_year, period_month)
);

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary REAL NOT NULL,
  working_days INTEGER NOT NULL,
  present_days REAL NOT NULL,
  unpaid_leave_days REAL NOT NULL,
  deductions REAL NOT NULL,
  net_pay REAL NOT NULL,
  details_json TEXT,
  UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_emp ON payslips(employee_id);
