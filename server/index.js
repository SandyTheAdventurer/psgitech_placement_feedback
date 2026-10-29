const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { OAuth2Client } = require('google-auth-library');

const cfg = require('./config');
const db = require('./db');

const app = express();
if (cfg.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(cfg.TRUST_PROXY) ? Number(cfg.TRUST_PROXY) : cfg.TRUST_PROXY);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://accounts.google.com/gsi/client'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
        'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", 'https://accounts.google.com/gsi/'],
        'worker-src': ["'self'", 'blob:'],
        'object-src': ["'self'"],
        'frame-src': ["'self'", 'https://accounts.google.com/gsi/'],
        'frame-ancestors': ["'self'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Google sign-in popup
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/* ------------------------------------------------------------------ helpers */
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
};
const list = (v, maxItems, maxLen) => {
  let arr = v;
  if (typeof v === 'string') {
    try { arr = JSON.parse(v); } catch { arr = v.split(','); }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const s = str(String(x), maxLen);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
  }
  return out.slice(0, maxItems);
};
const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'company';
const colorOk = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#1f5c99');
const safeUnlink = (dir, file) => {
  if (!file) return;
  fs.unlink(path.join(cfg.UPLOAD_DIR, dir, path.basename(file)), () => {});
};

/* --------------------------------------------------------------------- auth */
const COOKIE = 'cdc_session';
function issue(res, user) {
  const token = jwt.sign({ uid: user.id, v: user.token_version }, cfg.SECRET, { expiresIn: `${cfg.SESSION_HOURS}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.IS_PROD && (cfg.TRUST_PROXY ? true : false),
    maxAge: cfg.SESSION_HOURS * 3600 * 1000,
    path: '/',
  });
}
const publicUser = (u) => ({
  id: u.id, login: u.login, name: u.name, role: u.role, picture: u.picture || '',
  department: u.department, batch: u.batch, mustChange: !!u.must_change,
});

function auth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  try {
    const p = jwt.verify(token, cfg.SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(p.uid);
    if (!u || !u.active || u.token_version !== p.v) throw new Error('stale');
    req.user = u;
    next();
  } catch {
    res.clearCookie(COOKIE);
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required.' });

// State-changing requests must carry a custom header (blocks cross-site form posts).
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'Blocked request.' });
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 11);

// Students sign in with Google (college accounts only); the password form is for admins.
const googleClient = cfg.GOOGLE_CLIENT_ID ? new OAuth2Client(cfg.GOOGLE_CLIENT_ID) : null;
app.locals.verifyGoogle = async (credential) => {
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: cfg.GOOGLE_CLIENT_ID });
  return ticket.getPayload();
};

app.post('/api/auth/google', loginLimiter, wrap(async (req, res) => {
  if (!cfg.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Google sign-in has not been configured yet. Please contact CDC.');
  const credential = typeof req.body.credential === 'string' ? req.body.credential : '';
  let p;
  try { p = await app.locals.verifyGoogle(credential); } catch { throw new HttpError(401, 'Google could not verify your sign-in. Please try again.'); }
  const email = String(p.email || '').toLowerCase();
  const domain = cfg.ALLOWED_DOMAIN;
  if (!p.email_verified || !email.endsWith('@' + domain) || (p.hd || '').toLowerCase() !== domain) {
    throw new HttpError(403, `Please sign in with your @${domain} college account.`);
  }
  let u = db.prepare('SELECT * FROM users WHERE login = ?').get(email);
  if (u && u.role !== 'student') throw new HttpError(403, 'Admins sign in from the Admin tab.');
  const name = str(p.name || email.split('@')[0], 80);
  const picture = /^https:\/\/[\w.-]*googleusercontent\.com\//.test(p.picture || '') ? p.picture : '';
  if (!u) {
    // first sign-in: the account is created automatically
    db.prepare("INSERT INTO users (login, name, role, picture, password_hash) VALUES (?,?, 'student', ?, ?)")
      .run(email, name, picture, bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 4));
    u = db.prepare('SELECT * FROM users WHERE login = ?').get(email);
  } else if (!u.active) {
    throw new HttpError(403, 'Your access has been disabled. Please contact CDC.');
  } else {
    db.prepare('UPDATE users SET name = ?, picture = ? WHERE id = ?').run(name, picture, u.id);
  }
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), u.id);
  u = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  issue(res, u);
  res.json({ user: publicUser(u) });
}));

app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const login = str(req.body.login, 80).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const u = db.prepare("SELECT * FROM users WHERE login = ? AND role = 'admin'").get(login);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok || !u.active) throw new HttpError(401, 'Invalid admin credentials.');
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), u.id);
  issue(res, u);
  res.json({ user: publicUser(u) });
}));

app.get('/api/config', (req, res) => res.json({ college: cfg.COLLEGE_NAME, googleClientId: cfg.GOOGLE_CLIENT_ID, domain: cfg.ALLOWED_DOMAIN }));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user), college: cfg.COLLEGE_NAME }));

app.post('/api/auth/change-password', auth, wrap(async (req, res) => {
  const current = typeof req.body.current === 'string' ? req.body.current : '';
  const next = typeof req.body.next === 'string' ? req.body.next : '';
  if (!(await bcrypt.compare(current, req.user.password_hash))) throw bad('Current password is incorrect.');
  if (next.length < 8) throw bad('New password must be at least 8 characters.');
  if (next === current) throw bad('New password must be different from the current one.');
  db.prepare('UPDATE users SET password_hash = ?, must_change = 0, token_version = token_version + 1 WHERE id = ?')
    .run(await bcrypt.hash(next, 11), req.user.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  issue(res, u);
  res.json({ user: publicUser(u) });
}));

/* ---------------------------------------------------------------- companies */
const guideOut = (g) => ({
  id: g.id, year: g.year, batchLabel: g.batch_label, seniorsFrom: g.seniors_from,
  questions: g.questions, seniors: g.seniors, stages: g.stages, process: g.process,
  size: g.size, originalName: g.original_name, updatedAt: g.updated_at,
});
const companyOut = (c, guides) => ({
  id: c.id, name: c.name, slug: c.slug, role: c.role, color: c.color,
  logo: c.logo_file ? `/api/companies/${c.id}/logo?v=${encodeURIComponent(c.logo_file)}` : null,
  departments: JSON.parse(c.departments), topics: JSON.parse(c.topics),
  createdAt: c.created_at,
  guides: guides.map(guideOut),
});
function allCompanies() {
  const cs = db.prepare('SELECT * FROM companies ORDER BY name COLLATE NOCASE').all();
  const gs = db.prepare('SELECT * FROM guides ORDER BY year DESC').all();
  const by = new Map();
  for (const g of gs) { if (!by.has(g.company_id)) by.set(g.company_id, []); by.get(g.company_id).push(g); }
  return cs.map((c) => companyOut(c, by.get(c.id) || []));
}
const oneCompany = (id) => {
  const c = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  if (!c) throw new HttpError(404, 'Company not found.');
  return companyOut(c, db.prepare('SELECT * FROM guides WHERE company_id = ? ORDER BY year DESC').all(id));
};

app.get('/api/companies', auth, (req, res) => {
  const companies = allCompanies();
  // students only see companies that have at least one guide published
  res.json({ companies: req.user.role === 'admin' ? companies : companies.filter((c) => c.guides.length) });
});

app.get('/api/companies/:id/logo', auth, (req, res) => {
  const c = db.prepare('SELECT logo_file FROM companies WHERE id = ?').get(req.params.id);
  if (!c || !c.logo_file) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(cfg.UPLOAD_DIR, 'logos', path.basename(c.logo_file)));
});

app.get('/api/guides/:id/file', auth, (req, res) => {
  const g = db.prepare(`SELECT g.*, c.name AS company FROM guides g JOIN companies c ON c.id = g.company_id WHERE g.id = ?`).get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Guide not found.' });
  const file = path.join(cfg.UPLOAD_DIR, 'guides', path.basename(g.pdf_file));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File is missing on the server.' });
  const pretty = `${g.company}-${g.year}-Interview-Guide.pdf`.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-');
  if (req.user.role === 'student' && !req.get('range')) {
    db.prepare('INSERT INTO activity (user_id, guide_id, kind) VALUES (?, ?, ?)').run(req.user.id, g.id, 'view');
  }
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${pretty}"`,
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(file);
});

/* ---------------------------------------------------- private highlights (per user) */
const HL_COLORS = new Set(['yellow', 'green', 'pink', 'blue']);
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
function cleanMarks(input) {
  const out = {};
  let total = 0;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [page, arr] of Object.entries(input)) {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1 || n > 1000 || !Array.isArray(arr)) continue;
    const list = [];
    for (const m of arr.slice(0, 400)) {
      if (!m || typeof m !== 'object' || !HL_COLORS.has(m.c)) continue;
      const x = clamp01(m.x), y = clamp01(m.y), w = Math.min(clamp01(m.w), 1 - x), h = Math.min(clamp01(m.h), 1 - y);
      if (w < 0.005 || h < 0.002) continue;
      list.push({ x: +x.toFixed(5), y: +y.toFixed(5), w: +w.toFixed(5), h: +h.toFixed(5), c: m.c });
    }
    total += list.length;
    if (list.length) out[n] = list;
    if (total > 4000) break;
  }
  return out;
}
// Admins only preview the student view: their highlights are never stored or returned.
app.get('/api/guides/:id/highlights', auth, (req, res) => {
  if (req.user.role === 'admin') return res.json({ marks: {} });
  const row = db.prepare('SELECT data FROM highlights WHERE user_id = ? AND guide_id = ?').get(req.user.id, Number(req.params.id));
  res.set('Cache-Control', 'private, no-store');
  res.json({ marks: row ? JSON.parse(row.data) : {} });
});
app.put('/api/guides/:id/highlights', auth, (req, res) => {
  if (req.user.role === 'admin') return res.json({ ok: true, marks: {}, saved: false });
  const g = db.prepare('SELECT id FROM guides WHERE id = ?').get(req.params.id);
  if (!g) throw new HttpError(404, 'Guide not found.');
  const marks = cleanMarks(req.body.marks);
  if (Object.keys(marks).length) {
    db.prepare(`INSERT INTO highlights (user_id, guide_id, data, updated_at) VALUES (?,?,?,datetime('now'))
      ON CONFLICT(user_id, guide_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(req.user.id, g.id, JSON.stringify(marks));
  } else {
    db.prepare('DELETE FROM highlights WHERE user_id = ? AND guide_id = ?').run(req.user.id, g.id);
  }
  res.json({ ok: true, marks });
});

/* ------------------------------------------------------------------ uploads */
const maxBytes = cfg.MAX_PDF_MB * 1024 * 1024;
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(cfg.UPLOAD_DIR, file.fieldname === 'logo' ? 'logos' : 'guides')),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (file.fieldname === 'logo' ? '.img' : '.pdf')),
  }),
  limits: { fileSize: maxBytes, files: 2, fields: 30 },
});
const uploadFields = upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'logo', maxCount: 1 }]);

function sniff(file, kind) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  if (kind === 'pdf') return buf.slice(0, 5).toString('latin1') === '%PDF-';
  const png = buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG';
  const jpg = buf[0] === 0xff && buf[1] === 0xd8;
  const webp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  return png || jpg || webp;
}
function takeUploads(req) {
  const out = {};
  const files = req.files || {};
  for (const kind of ['pdf', 'logo']) {
    const f = (files[kind] || [])[0];
    if (!f) continue;
    if (!sniff(f.path, kind)) {
      Object.values(files).flat().forEach((x) => fs.unlink(x.path, () => {}));
      throw bad(kind === 'pdf' ? 'That file is not a valid PDF.' : 'Logo must be a PNG, JPG or WebP image.');
    }
    out[kind] = f;
  }
  return out;
}
const discard = (up) => Object.values(up).forEach((f) => fs.unlink(f.path, () => {}));
const withUpload = (handler) => (req, res, next) =>
  uploadFields(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `File is too large (limit ${cfg.MAX_PDF_MB} MB).`));
      return next(bad('Upload failed: ' + err.message));
    }
    Promise.resolve().then(() => handler(req, res)).catch(next);
  });

const admin = express.Router();
admin.use(auth, adminOnly);
app.use('/api/admin', admin);

/* ----------------------------------------------------------- admin: company */
function companyFields(body) {
  const name = str(body.name, 80);
  if (!name) throw bad('Company name is required.');
  return {
    name,
    role: str(body.role, 120),
    color: colorOk(body.color),
    departments: JSON.stringify(list(body.departments, 10, 40)),
    topics: JSON.stringify(list(body.topics, 12, 30)),
  };
}
function uniqueSlug(name, exceptId = 0) {
  const base = slugify(name);
  let slug = base, i = 2;
  while (db.prepare('SELECT 1 FROM companies WHERE slug = ? AND id != ?').get(slug, exceptId)) slug = `${base}-${i++}`;
  return slug;
}

admin.post('/companies', withUpload((req, res) => {
  const up = takeUploads(req);
  try {
    const f = companyFields(req.body);
    if (db.prepare('SELECT 1 FROM companies WHERE name = ? COLLATE NOCASE').get(f.name)) throw new HttpError(409, 'A company with this name already exists.');
    const r = db.prepare('INSERT INTO companies (name, slug, role, color, logo_file, departments, topics) VALUES (?,?,?,?,?,?,?)')
      .run(f.name, uniqueSlug(f.name), f.role, f.color, up.logo ? up.logo.filename : null, f.departments, f.topics);
    res.status(201).json({ company: oneCompany(r.lastInsertRowid) });
  } catch (e) { discard(up); throw e; }
}));

admin.put('/companies/:id', withUpload((req, res) => {
  const up = takeUploads(req);
  try {
    const c = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!c) throw new HttpError(404, 'Company not found.');
    const f = companyFields(req.body);
    if (db.prepare('SELECT 1 FROM companies WHERE name = ? COLLATE NOCASE AND id != ?').get(f.name, c.id)) throw new HttpError(409, 'A company with this name already exists.');
    let logo = c.logo_file;
    if (up.logo) logo = up.logo.filename;
    else if (req.body.removeLogo === '1') logo = null;
    db.prepare('UPDATE companies SET name=?, slug=?, role=?, color=?, logo_file=?, departments=?, topics=? WHERE id=?')
      .run(f.name, uniqueSlug(f.name, c.id), f.role, f.color, logo, f.departments, f.topics, c.id);
    if (logo !== c.logo_file) safeUnlink('logos', c.logo_file);
    res.json({ company: oneCompany(c.id) });
  } catch (e) { discard(up); throw e; }
}));

admin.delete('/companies/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!c) throw new HttpError(404, 'Company not found.');
  const files = db.prepare('SELECT pdf_file FROM guides WHERE company_id = ?').all(c.id);
  db.prepare('DELETE FROM companies WHERE id = ?').run(c.id);
  files.forEach((g) => safeUnlink('guides', g.pdf_file));
  safeUnlink('logos', c.logo_file);
  res.json({ ok: true });
});

/* ------------------------------------------------------------ admin: guides */
function guideFields(body) {
  return {
    year: int(body.year, 2000, 2100, 'Year'),
    batch_label: str(body.batchLabel, 80),
    seniors_from: str(body.seniorsFrom, 80),
    questions: int(body.questions || 0, 0, 5000, 'Questions'),
    seniors: int(body.seniors || 0, 0, 500, 'Seniors'),
    stages: int(body.stages || 0, 0, 30, 'Stages'),
    process: str(body.process, 200),
  };
}

admin.post('/companies/:id/guides', withUpload((req, res) => {
  const up = takeUploads(req);
  try {
    const c = db.prepare('SELECT id FROM companies WHERE id = ?').get(req.params.id);
    if (!c) throw new HttpError(404, 'Company not found.');
    if (!up.pdf) throw bad('Please attach the PDF for this year.');
    const f = guideFields(req.body);
    const existing = db.prepare('SELECT * FROM guides WHERE company_id = ? AND year = ?').get(c.id, f.year);
    if (existing && req.body.replace !== '1') throw new HttpError(409, `A ${f.year} guide already exists for this company.`);
    const vals = [f.batch_label, f.seniors_from, f.questions, f.seniors, f.stages, f.process, up.pdf.filename, str(up.pdf.originalname, 200), up.pdf.size, now()];
    if (existing) {
      db.prepare('UPDATE guides SET batch_label=?, seniors_from=?, questions=?, seniors=?, stages=?, process=?, pdf_file=?, original_name=?, size=?, updated_at=? WHERE id=?').run(...vals, existing.id);
      safeUnlink('guides', existing.pdf_file);
    } else {
      db.prepare('INSERT INTO guides (company_id, year, batch_label, seniors_from, questions, seniors, stages, process, pdf_file, original_name, size, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(c.id, f.year, ...vals);
    }
    res.status(201).json({ company: oneCompany(c.id) });
  } catch (e) { discard(up); throw e; }
}));

admin.put('/guides/:id', withUpload((req, res) => {
  const up = takeUploads(req);
  try {
    const g = db.prepare('SELECT * FROM guides WHERE id = ?').get(req.params.id);
    if (!g) throw new HttpError(404, 'Guide not found.');
    const f = guideFields(req.body);
    if (f.year !== g.year && db.prepare('SELECT 1 FROM guides WHERE company_id = ? AND year = ?').get(g.company_id, f.year)) {
      throw new HttpError(409, `A ${f.year} guide already exists for this company.`);
    }
    const file = up.pdf ? up.pdf.filename : g.pdf_file;
    db.prepare('UPDATE guides SET year=?, batch_label=?, seniors_from=?, questions=?, seniors=?, stages=?, process=?, pdf_file=?, original_name=?, size=?, updated_at=? WHERE id=?')
      .run(f.year, f.batch_label, f.seniors_from, f.questions, f.seniors, f.stages, f.process, file,
        up.pdf ? str(up.pdf.originalname, 200) : g.original_name, up.pdf ? up.pdf.size : g.size, now(), g.id);
    if (up.pdf) safeUnlink('guides', g.pdf_file);
    res.json({ company: oneCompany(g.company_id) });
  } catch (e) { discard(up); throw e; }
}));

admin.delete('/guides/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM guides WHERE id = ?').get(req.params.id);
  if (!g) throw new HttpError(404, 'Guide not found.');
  db.prepare('DELETE FROM guides WHERE id = ?').run(g.id);
  safeUnlink('guides', g.pdf_file);
  res.json({ company: oneCompany(g.company_id) });
});

/* ----------------------------------------------------------- admin: students */
// Student accounts are created automatically at first Google sign-in; admins can disable or remove them.
const studentOut = (u) => ({
  id: u.id, login: u.login, name: u.name, picture: u.picture || '',
  active: !!u.active, lastLogin: u.last_login, createdAt: u.created_at,
});

admin.get('/students', (req, res) => {
  res.json({ students: db.prepare("SELECT * FROM users WHERE role='student' ORDER BY COALESCE(last_login, created_at) DESC, id DESC").all().map(studentOut) });
});

admin.put('/students/:id', (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role='student'").get(req.params.id);
  if (!u) throw new HttpError(404, 'Student not found.');
  const active = req.body.active === false ? 0 : 1;
  // bumping token_version signs a disabled student out immediately
  db.prepare('UPDATE users SET active = ?, token_version = token_version + ? WHERE id = ?').run(active, !active && u.active ? 1 : 0, u.id);
  res.json({ student: studentOut(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});

admin.delete('/students/:id', (req, res) => {
  const r = db.prepare("DELETE FROM users WHERE id = ? AND role='student'").run(req.params.id);
  if (!r.changes) throw new HttpError(404, 'Student not found.');
  res.json({ ok: true });
});


/* -------------------------------------------------------------- admin: stats */
admin.get('/stats', (req, res) => {
  const one = (sql) => db.prepare(sql).get();
  const totals = {
    companies: one('SELECT COUNT(*) n FROM companies').n,
    guides: one('SELECT COUNT(*) n FROM guides').n,
    questions: one('SELECT COALESCE(SUM(questions),0) n FROM guides').n,
    students: one("SELECT COUNT(*) n FROM users WHERE role='student'").n,
    activeStudents: one("SELECT COUNT(*) n FROM users WHERE role='student' AND last_login >= datetime('now','-30 days')").n,
    views: one("SELECT COUNT(*) n FROM activity WHERE kind='view'").n,
    downloads: one("SELECT COUNT(*) n FROM activity WHERE kind='download'").n,
    storage: one('SELECT COALESCE(SUM(size),0) n FROM guides').n,
  };
  const top = db.prepare(`
    SELECT c.name AS company, g.year, COUNT(a.id) AS hits
    FROM guides g JOIN companies c ON c.id = g.company_id LEFT JOIN activity a ON a.guide_id = g.id
    GROUP BY g.id ORDER BY hits DESC, c.name LIMIT 6`).all();
  const recent = db.prepare(`
    SELECT a.kind, a.at, u.name AS student, c.name AS company, g.year
    FROM activity a JOIN guides g ON g.id = a.guide_id JOIN companies c ON c.id = g.company_id
    LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 8`).all();
  const daily = db.prepare(`
    SELECT date(at) AS day, COUNT(*) AS n FROM activity WHERE at >= datetime('now','-13 days')
    GROUP BY date(at) ORDER BY day`).all();
  res.json({ totals, top, recent, daily });
});

/* ------------------------------------------------------------- static + errs */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: cfg.IS_PROD ? '1h' : 0,
  setHeaders: (res, p) => { if (p.endsWith('.woff2')) res.set('Cache-Control', 'public, max-age=31536000, immutable'); },
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

if (require.main === module) {
  app.listen(cfg.PORT, () => console.log(`Placement guides running on http://localhost:${cfg.PORT}`));
}
module.exports = app;
