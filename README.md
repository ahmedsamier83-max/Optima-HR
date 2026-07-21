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
| `PAYROLL_CRON` | Cron schedule for the in-process automatic payroll job (default: `0 3 1 * *` = 03:00 on the 1st of every month, server time). Only reliable on hosts that stay running — see the Render section below for hosts that sleep the app. |
| `CRON_SECRET` | Shared secret for `POST /api/payroll/cron-trigger`, used by an external scheduler (e.g. GitHub Actions) to run payroll on hosts where the process can be asleep. Leave unset to disable that endpoint. |
| `LOCATION_PING_MINUTES` | How often an employee's browser sends a live GPS ping while clocked in |

## Deploying to Render (free tier)

`render.yaml` in this repo is a Render "Blueprint" — Render reads it
automatically and sets up the service for you:

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the Render dashboard: **New > Blueprint**, pick this repo. Render finds
   `render.yaml` and shows the `optima-hr` web service.
3. It'll prompt you for the env vars marked `sync: false` — set:
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — your admin login for the deployed app
   - `CRON_SECRET` — any long random string (see step 5)
4. Deploy. Render builds with `npm install` and starts with `npm start`. Once
   live, your app is at `https://<service-name>.onrender.com`.
5. **Free tier has no persistent disk**, so the SQLite file can be wiped on
   redeploy, and the app can be put to sleep after ~15 minutes idle — which
   also means the in-process monthly payroll cron isn't guaranteed to fire if
   the app happens to be asleep at 3am on the 1st. To cover that for free,
   this repo includes `.github/workflows/monthly-payroll.yml`, a GitHub
   Actions workflow that pings the app once a month to wake it and run
   payroll. Set these two repo secrets (GitHub repo → Settings → Secrets and
   variables → Actions):
   - `APP_URL` — your Render URL, e.g. `https://optima-hr.onrender.com`
   - `CRON_SECRET` — the same value you set in Render's env vars in step 3

   You can test it immediately without waiting for the schedule: go to the
   workflow's Actions tab and click "Run workflow".

If you outgrow the free tier's data-loss risk, upgrade to a paid Render plan
and attach a Render Disk mounted over the `data/` directory (uncomment the
`disk:` block you'd add to `render.yaml`) — the SQLite file then survives
redeploys and the built-in `node-cron` schedule becomes reliable on its own
(you can drop the GitHub Actions workflow at that point, or just leave it as
a harmless backup).

## Deploying elsewhere

- **Railway / Fly.io** — same idea as Render: push this repo, set the env
  vars from the table above, start command `npm start`. Attach a persistent
  volume for `data/` if the platform's free tier doesn't wipe disk on deploy.
- **A VPS** (DigitalOcean, Hetzner, etc.) — `git clone`, `npm install --omit=dev`,
  run with `pm2` or a systemd service so it restarts on crash/reboot. A VPS
  stays running continuously, so the built-in `node-cron` schedule alone is
  reliable — no external trigger needed.

If you'd rather not run any background process at all, leave `CRON_SECRET`
unset and call `POST /api/payroll/generate` yourself once a month instead
(e.g. from your own machine's cron, or the admin dashboard's "تشغيل الرواتب"
button).

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
- `payroll`: generate/runs (admin); me (employee); cron-trigger (external scheduler, `X-Cron-Secret` header)
