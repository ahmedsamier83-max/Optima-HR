require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./init');

function ensureAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (existing) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const hash = bcrypt.hashSync(password, 10);

  db.prepare(
    `INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'admin', 0)`
  ).run(username, hash);

  console.log(`Admin account created: username="${username}". Set ADMIN_PASSWORD in .env before first run in production.`);
}

ensureAdmin();
