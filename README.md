# Optima HR

A self-contained HR system: employee attendance with live GPS location, leave
management, and fully automatic monthly payroll. Employees log in with a
username and password issued by the admin.

## Features

- **Username/password login** for every employee (JWT sessions, bcrypt password
  hashing, account lockout after failed attempts). Admin account is separate.
- **Attendance & live location** — employees clock in/out from their phone or
  browser; while clocked in, their browser sends a GPS ping every couple of
  minutes so the admin's "Live Map" tab shows where each employee is right now
  and their movement trail for the day.
- **Leave management** — employees request annual/sick/unpaid leave, the admin
  approves or rejects, and remaining balance is tracked automatically.
- **Automatic monthly payroll** — a scheduled job runs on the 1st of every
  month and generates a payslip for every active employee for the previous
  month: base salary minus a per-day deduction for any working day that has
  no check-in and no approved paid leave. The admin can also trigger a payroll
  run manually for any month.

The old single-file prototype (`legacy/attendance-prototype.html`) is kept for
reference — it only worked in one browser's local storage and could not sync
data between an employee's device and the admin's. This app replaces it with a
real server + database, which is what's actually needed for multi-user access.

## Tech stack

- Node.js + Express (API + static file server)
- SQLite via `better-sqlite3` (single file database — no separate DB server
  to install; swap for Postgres later if you outgrow it)
- JWT auth + bcrypt password hashing
- `node-cron` for the automatic monthly payroll job
- Plain HTML/CSS/JS frontend (Arabic, RTL), Leaflet + OpenStreetMap for the
  live map (no API key required)

## Running it locally

```bash
npm install
cp .env.example .env
# edit .env: set JWT_SECRET to a long random string, and ADMIN_PASSWORD
npm start
```

Open http://localhost:3000 — it redirects to the login page. On first run,
an admin account is created automatically from `ADMIN_USERNAME`/
`ADMIN_PASSWORD` in `.env`.

Log in as admin, add employees from the "الموظفون" tab — each new employee
gets an auto-generated username and a temporary password shown once on
screen (hand these to the employee; they're forced to set their own password
on first login).

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `JWT_SECRET` | Secret used to sign login sessions — set a long random value |
| `DB_PATH` | Path to the SQLite database file |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Created once, on first run, if no admin exists yet |
| `PAYROLL_CRON` | Cron schedule for automatic payroll (default: `0 3 1 * *` = 03:00 on the 1st of every month, server time) |
| `LOCATION_PING_MINUTES` | How often an employee's browser sends a live GPS ping while clocked in |

## Deploying so payroll actually runs "automatically"

The monthly payroll cron only fires while the Node process is running, so it
needs to run on a server that stays up — not just on your laptop. Any of
these work with zero code changes:

- **Render / Railway / Fly.io** — push this repo, set the env vars above,
  point the start command at `npm start`. Attach a persistent volume for
  `data/` (the SQLite file) so it isn't wiped on redeploy.
- **A VPS** (DigitalOcean, Hetzner, etc.) — `git clone`, `npm install --omit=dev`,
  run with `pm2` or a systemd service so it restarts on crash/reboot.

If you'd rather not run a background process, disable `PAYROLL_CRON` and call
`POST /api/payroll/generate` yourself once a month (e.g. from your own
machine's cron, or the admin dashboard's "تشغيل الرواتب" button).

## Notes on live location tracking

Continuous tracking depends on the employee's browser tab staying open and
location permission being granted — mobile browsers can suspend GPS updates
when the tab is backgrounded or the screen locks. This is a real limitation
of browser-based tracking (as opposed to a native mobile app with a
background service) — expect gaps in the trail if an employee locks their
phone during the day, not a bug in the app.

## API overview

All endpoints are under `/api`. Auth: `POST /api/auth/login` returns a JWT,
sent as `Authorization: Bearer <token>` on every other request.

- `auth`: login, change-password, me
- `employees` (admin only): list/create/update/deactivate, reset-password
- `attendance`: checkin/checkout/status/me/ping (employee); list/live/live/:id (admin)
- `leaves`: create/me/balance/cancel (employee); list/decide (admin)
- `payroll`: generate/runs (admin); me (employee)
