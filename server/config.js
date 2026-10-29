const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load .env (no dependency) — real environment variables always win.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
for (const d of [DATA_DIR, path.join(UPLOAD_DIR, 'guides'), path.join(UPLOAD_DIR, 'logos')]) {
  fs.mkdirSync(d, { recursive: true });
}

// A signing secret is generated once and persisted so sessions survive restarts
// even when JWT_SECRET is not provided.
function resolveSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) return process.env.JWT_SECRET;
  const f = path.join(DATA_DIR, '.session-secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  IS_PROD: process.env.NODE_ENV === 'production',
  DATA_DIR,
  UPLOAD_DIR,
  SECRET: resolveSecret(),
  SESSION_HOURS: Number(process.env.SESSION_HOURS) || 12,
  MAX_PDF_MB: Number(process.env.MAX_PDF_MB) || 30,
  TRUST_PROXY: process.env.TRUST_PROXY,
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  ALLOWED_DOMAIN: (process.env.ALLOWED_DOMAIN || 'psgitech.ac.in').trim().toLowerCase(),
  COLLEGE_NAME: process.env.COLLEGE_NAME || 'PSG iTech',
  ADMIN_LOGIN: (process.env.ADMIN_LOGIN || 'admin').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
};
