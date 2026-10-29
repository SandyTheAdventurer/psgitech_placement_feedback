const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cfg = require('./config');

const db = new Database(path.join(cfg.DATA_DIR, 'placement.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','student')),
  department TEXT DEFAULT '',
  batch TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT '',
  color TEXT DEFAULT '#1f5c99',
  logo_file TEXT,
  departments TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS guides (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  batch_label TEXT DEFAULT '',
  seniors_from TEXT DEFAULT '',
  questions INTEGER NOT NULL DEFAULT 0,
  seniors INTEGER NOT NULL DEFAULT 0,
  stages INTEGER NOT NULL DEFAULT 0,
  process TEXT DEFAULT '',
  pdf_file TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, year)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guide_id INTEGER REFERENCES guides(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS highlights (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, guide_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_guide ON activity(guide_id);
CREATE INDEX IF NOT EXISTS idx_guides_company ON guides(company_id);
`);

if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'picture')) {
  db.exec("ALTER TABLE users ADD COLUMN picture TEXT DEFAULT ''");
}

function ensureAdmin() {
  const exists = db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get();
  if (exists) return;
  let password = cfg.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }
  db.prepare(
    "INSERT INTO users (login, name, role, password_hash, must_change) VALUES (?, 'CDC Admin', 'admin', ?, ?)"
  ).run(cfg.ADMIN_LOGIN, bcrypt.hashSync(password, 11), generated ? 1 : 0);
  if (generated) {
    console.log('\n==============================================================');
    console.log(' First run: an admin account was created.');
    console.log(`   login:    ${cfg.ADMIN_LOGIN}`);
    console.log(`   password: ${password}`);
    console.log(' You will be asked to change it at first sign-in.');
    console.log(' (Set ADMIN_PASSWORD in the environment to choose your own.)');
    console.log('==============================================================\n');
  } else {
    console.log(`Admin account "${cfg.ADMIN_LOGIN}" created from ADMIN_PASSWORD.`);
  }
}
ensureAdmin();

module.exports = db;
