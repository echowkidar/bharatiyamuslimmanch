const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { db, settings, setSetting, audit, DEFAULT_SETTINGS } = require('../db');
const cfg = require('../config');
const U = require('../util');
const S = require('../services');
const V = require('../views');

const r = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 30 } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const COOKIE = 'bmm_admin';
const ROLE_GROUPS = { content: ['super', 'editor'], members: ['super', 'editor'], finance: ['super', 'accounts'], super: ['super'], any: ['super', 'editor', 'accounts'] };

// ------------------------------------------------------------------ auth
const loginLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 12, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'बहुत ज़्यादा प्रयास। 15 मिनट बाद कोशिश करें।' } });
r.post('/login', loginLimiter, express.json({ limit: '5kb' }), (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(username || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
    audit(username, 'login.fail', '', req.ip);
    return res.status(401).json({ ok: false, error: 'यूज़रनेम या पासवर्ड ग़लत है।' });
  }
  const token = jwt.sign({ id: u.id }, cfg.SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 12 * 3600e3, path: '/' });
  audit(u.username, 'login', '', req.ip);
  res.json({ ok: true, user: { id: u.id, username: u.username, name: u.name, role: u.role } });
});
r.post('/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });

function auth(req, res, next) {
  try {
    const t = jwt.verify(req.cookies[COOKIE] || '', cfg.SECRET);
    const u = db.prepare('SELECT id,username,name,role FROM users WHERE id=? AND active=1').get(t.id);
    if (!u) throw new Error('nouser');
    req.user = u;
  } catch (e) { return res.status(401).json({ ok: false, error: 'login required' }); }
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'XMLHttpRequest') return res.status(403).json({ ok: false, error: 'bad request' });
  next();
}
const can = (group) => (req, res, next) => (ROLE_GROUPS[group].includes(req.user.role) ? next() : res.status(403).json({ ok: false, error: 'आपको इसकी अनुमति नहीं है।' }));
const log = (req, action, detail) => audit(req.user.username, action, detail, req.ip);
const ok = (res, extra = {}) => res.json({ ok: true, ...extra });
const fail = (res, error, code = 400) => res.status(code).json({ ok: false, error });

r.get('/me', auth, (req, res) => ok(res, { user: req.user, paymentMode: cfg.PAYMENT_MODE }));
r.post('/password', auth, express.json(), (req, res) => {
  const { old, next } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(old || ''), u.password_hash)) return fail(res, 'पुराना पासवर्ड ग़लत है।');
  if (String(next || '').length < 8) return fail(res, 'नया पासवर्ड कम से कम 8 अक्षर का हो।');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 11), u.id);
  log(req, 'password.change'); ok(res);
});

// Everything below needs a valid session. (CSV/print GETs rely on the cookie too.)
r.use(auth);
r.use(express.json({ limit: '4mb' }));

// ------------------------------------------------------------- dashboard
r.get('/dashboard', can('any'), (req, res) => {
  const one = (q, ...a) => db.prepare(q).get(...a);
  const fy = U.financialYear();
  const fyStart = fy.slice(0, 4) + '-04-01';
  const out = {
    members: { total: one('SELECT COUNT(*) n FROM members').n, active: one(`SELECT COUNT(*) n FROM members WHERE status='active'`).n, pending: one(`SELECT COUNT(*) n FROM members WHERE status='pending'`).n },
    donations: {
      total: one(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM donations WHERE status='success'`),
      fy: one(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM donations WHERE status='success' AND paid_at>=?`, fyStart),
      today: one(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM donations WHERE status='success' AND date(paid_at)=date('now')`),
      toVerify: one(`SELECT COUNT(*) n FROM donations WHERE mode='manual' AND status='pending' AND utr IS NOT NULL`).n,
    },
    expenses: { fy: one(`SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE date>=?`, fyStart).s },
    messages: one(`SELECT COUNT(*) n FROM messages WHERE status='new'`).n,
    press: one(`SELECT COUNT(*) n FROM press WHERE status='published'`).n,
    recentMembers: db.prepare('SELECT id,name,state,district,status,created_at,photo FROM members ORDER BY id DESC LIMIT 6').all(),
    recentDonations: db.prepare(`SELECT id,name,amount,paid_at,mode,purpose FROM donations WHERE status='success' ORDER BY paid_at DESC LIMIT 6`).all(),
    series: db.prepare(`SELECT substr(paid_at,1,10) d, SUM(amount) s FROM donations WHERE status='success' AND paid_at>=date('now','-29 day') GROUP BY d ORDER BY d`).all(),
    fy,
  };
  ok(res, out);
});

r.get('/system', can('super'), (req, res) => ok(res, {
  paymentMode: cfg.PAYMENT_MODE, phonepeEnv: cfg.PHONEPE.env, phonepeConfigured: !!(cfg.PHONEPE.clientId && cfg.PHONEPE.clientSecret),
  webhookConfigured: !!(cfg.PHONEPE.webhookUser && cfg.PHONEPE.webhookPass), webhookUrl: cfg.SITE_URL + '/api/phonepe/webhook', siteUrl: cfg.SITE_URL, upiId: cfg.UPI_ID,
}));

// ---------------------------------------------------------------- uploads
r.post('/upload', can('any'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return fail(res, 'फ़ाइल नहीं मिली।');
  const kind = req.body.kind || 'image';
  try {
    if (kind === 'pdf') return ok(res, { url: U.savePdf(req.file.buffer) });
    if (kind === 'member') return ok(res, { url: await U.saveImage(req.file.buffer, { width: 480, height: 600, fit: 'cover', prefix: 'member' }) });
    if (kind === 'portrait') return ok(res, { url: await U.saveImage(req.file.buffer, { width: 700, height: 840, fit: 'cover', prefix: 'leader' }) });
    return ok(res, { url: await U.saveImage(req.file.buffer, { width: 1800, prefix: kind, thumb: true }) });
  } catch (e) { return fail(res, 'फ़ाइल मान्य नहीं है: ' + e.message); }
}));

// ------------------------------------------------------- generic resources
const money = (v) => Math.round(Number(v || 0) * 100);
const RES = {
  press: {
    group: 'content', cols: ['title', 'summary', 'body', 'cover', 'attachment', 'status', 'published_at'], search: ['title', 'summary'], order: 'COALESCE(published_at,created_at) DESC,id DESC',
    pre: (d, req, old) => {
      d.body = U.cleanHtml(d.body);
      if (d.status === 'published' && !d.published_at && !(old && old.published_at)) d.published_at = U.nowSql();
      if (d.published_at && /^\d{4}-\d{2}-\d{2}$/.test(d.published_at)) d.published_at += ' 06:30:00';
      if (!old) d.created_by = req.user.username;
    }, extra: ['created_by'],
  },
  leaders: { group: 'content', cols: ['name', 'name_en', 'title', 'title_en', 'bio', 'photo', 'grp', 'sort', 'facebook', 'x', 'youtube', 'phone', 'active'], search: ['name', 'title'], order: `CASE grp WHEN 'patron' THEN 0 WHEN 'convenor' THEN 1 WHEN 'national' THEN 2 ELSE 3 END, sort, id` },
  albums: { group: 'content', cols: ['title', 'description', 'cover', 'sort', 'event_date', 'active'], search: ['title'], order: 'event_date DESC, id DESC', counts: `(SELECT COUNT(*) FROM media m WHERE m.album_id=albums.id) AS n` },
  media: { group: 'content', cols: ['caption', 'sort', 'album_id'], search: ['caption'], order: 'id DESC', filter: ['album_id', 'type'], onDelete: (row) => unlink(row.file) },
  events: { group: 'content', cols: ['title', 'description', 'venue', 'event_date', 'image', 'status'], search: ['title', 'venue'], order: 'event_date DESC' },
  units: {
    group: 'content', cols: ['state_code', 'district', 'head_name', 'head_title', 'phone', 'email', 'address', 'active'], search: ['state', 'district', 'head_name'], order: 'state, district', extra: ['state'],
    pre: (d) => { const s = U.stateByCode(d.state_code); if (!s) throw new Error('राज्य चुनें'); d.state = s.hi; },
  },
  notices: { group: 'content', cols: ['text', 'link', 'sort', 'active'], search: ['text'], order: 'sort, id DESC' },
  pages: { group: 'content', cols: ['title', 'body'], search: ['title', 'slug'], order: 'slug', noCreate: true, noDelete: true, pre: (d) => { d.body = U.cleanHtml(d.body); d.updated_at = U.nowSql(); } },
  campaigns: { group: 'finance', cols: ['title', 'description', 'target', 'active'], search: ['title'], order: 'id DESC', money: ['target'] },
  expenses: {
    group: 'finance', cols: ['date', 'category', 'amount', 'payee', 'note', 'voucher'], search: ['category', 'payee', 'note'], order: 'date DESC,id DESC', money: ['amount'], extra: ['created_by'],
    pre: (d, req, old) => { if (!d.date) throw new Error('तारीख आवश्यक है'); if (!(d.amount > 0)) throw new Error('राशि आवश्यक है'); if (!old) d.created_by = req.user.username; },
  },
  messages: { group: 'content', cols: ['status'], search: ['name', 'mobile', 'message', 'subject'], order: 'id DESC', noCreate: true },
  users: {
    group: 'super', cols: ['username', 'name', 'role', 'active', 'password'], search: ['username', 'name'], order: 'id', hide: ['password_hash'], extra: ['password_hash'],
    pre: (d, req, old) => {
      d.username = String(d.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(d.username)) throw new Error('यूज़रनेम 3-30 अक्षर (a-z, 0-9, . _ -) का हो');
      if (!['super', 'editor', 'accounts'].includes(d.role)) throw new Error('भूमिका सही नहीं');
      if (d.password) { if (String(d.password).length < 8) throw new Error('पासवर्ड कम से कम 8 अक्षर'); d.password_hash = bcrypt.hashSync(d.password, 11); }
      else if (!old) throw new Error('पासवर्ड आवश्यक है');
      delete d.password;
    },
  },
};
function unlink(f) { try { if (f && f.startsWith('/uploads/')) { fs.unlinkSync(path.join(cfg.UPLOAD_DIR, path.basename(f))); const t = path.join(cfg.UPLOAD_DIR, path.basename(U.thumbOf(f))); if (fs.existsSync(t)) fs.unlinkSync(t); } } catch (e) { /* ignore */ } }
const outRow = (cfgR, row) => {
  if (!row) return row;
  const o = { ...row };
  (cfgR.money || []).forEach((k) => { o[k] = (o[k] || 0) / 100; });
  (cfgR.hide || []).forEach((k) => delete o[k]);
  return o;
};
function pickData(cfgR, body) {
  const d = {};
  for (const k of cfgR.cols) if (k in body) d[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
  (cfgR.money || []).forEach((k) => { if (k in d) d[k] = money(d[k]); });
  return d;
}
const resOf = (req, res, next) => {
  const c = RES[req.params.res];
  if (!c) return fail(res, 'unknown resource', 404);
  if (!ROLE_GROUPS[c.group].includes(req.user.role) && !(req.method === 'GET' && c.group === 'finance' && req.params.res === 'campaigns')) return fail(res, 'आपको इसकी अनुमति नहीं है।', 403);
  req.rc = c; req.rn = req.params.res; next();
};
const colsOf = (c, n) => [...c.cols, ...(c.extra || [])];

r.get('/r/:res', resOf, (req, res) => {
  const c = req.rc, n = req.rn;
  const page = Math.max(1, parseInt(req.query.page) || 1), per = Math.min(200, parseInt(req.query.limit) || 50);
  const where = [], args = [];
  if (req.query.q && c.search) { where.push('(' + c.search.map((k) => `${k} LIKE ?`).join(' OR ') + ')'); c.search.forEach(() => args.push('%' + req.query.q + '%')); }
  (c.filter || []).forEach((k) => { if (req.query[k] !== undefined && req.query[k] !== '') { where.push(`${k}=?`); args.push(req.query[k]); } });
  if (req.query.status && c.cols.includes('status')) { where.push('status=?'); args.push(req.query.status); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM ${n} ${W}`).get(...args).n;
  const rows = db.prepare(`SELECT ${n}.*${c.counts ? ', ' + c.counts : ''} FROM ${n} ${W} ORDER BY ${c.order} LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  ok(res, { rows: rows.map((x) => outRow(c, x)), total, page, per });
});
r.get('/r/:res/:id', resOf, (req, res) => {
  const row = db.prepare(`SELECT * FROM ${req.rn} WHERE id=?`).get(req.params.id);
  row ? ok(res, { row: outRow(req.rc, row) }) : fail(res, 'not found', 404);
});
r.post('/r/:res', resOf, (req, res) => {
  const c = req.rc, n = req.rn;
  if (c.noCreate) return fail(res, 'not allowed', 405);
  let d = pickData(c, req.body || {});
  try { c.pre && c.pre(d, req, null); } catch (e) { return fail(res, e.message); }
  const keys = Object.keys(d).filter((k) => colsOf(c, n).includes(k));
  try {
    const info = db.prepare(`INSERT INTO ${n}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => d[k]));
    log(req, n + '.create', info.lastInsertRowid); ok(res, { id: info.lastInsertRowid });
  } catch (e) { fail(res, /UNIQUE/.test(e.message) ? 'यह प्रविष्टि पहले से मौजूद है।' : /NOT NULL/.test(e.message) ? 'ज़रूरी जानकारी भरें।' : e.message); }
});
r.put('/r/:res/:id', resOf, (req, res) => {
  const c = req.rc, n = req.rn;
  const old = db.prepare(`SELECT * FROM ${n} WHERE id=?`).get(req.params.id);
  if (!old) return fail(res, 'not found', 404);
  let d = pickData(c, req.body || {});
  try { c.pre && c.pre(d, req, old); } catch (e) { return fail(res, e.message); }
  const keys = Object.keys(d).filter((k) => colsOf(c, n).includes(k));
  if (!keys.length) return ok(res);
  try {
    db.prepare(`UPDATE ${n} SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).run(...keys.map((k) => d[k]), req.params.id);
    log(req, n + '.update', req.params.id); ok(res);
  } catch (e) { fail(res, e.message); }
});
r.delete('/r/:res/:id', resOf, (req, res) => {
  const c = req.rc, n = req.rn;
  if (c.noDelete) return fail(res, 'not allowed', 405);
  const old = db.prepare(`SELECT * FROM ${n} WHERE id=?`).get(req.params.id);
  if (!old) return fail(res, 'not found', 404);
  if (n === 'users' && old.id === req.user.id) return fail(res, 'आप स्वयं को हटा नहीं सकते।');
  if (n === 'albums') db.prepare('SELECT file FROM media WHERE album_id=?').all(old.id).forEach((m) => unlink(m.file));
  db.prepare(`DELETE FROM ${n} WHERE id=?`).run(req.params.id);
  c.onDelete && c.onDelete(old);
  if (n === 'press') { unlink(old.cover); unlink(old.attachment); }
  log(req, n + '.delete', req.params.id); ok(res);
});

// ------------------------------------------------------------------ media
r.post('/media/photos', can('content'), upload.array('files', 30), wrap(async (req, res) => {
  const album = parseInt(req.body.album_id) || null;
  const ids = [];
  for (const f of req.files || []) {
    try {
      const url = await U.saveImage(f.buffer, { width: 1800, prefix: 'gal', thumb: true });
      ids.push(db.prepare(`INSERT INTO media(album_id,type,file,caption) VALUES(?,?,?,?)`).run(album, 'photo', url, (req.body.caption || '').slice(0, 200)).lastInsertRowid);
    } catch (e) { /* skip invalid file */ }
  }
  if (album && ids.length) {
    const a = db.prepare('SELECT cover FROM albums WHERE id=?').get(album);
    if (a && !a.cover) db.prepare('UPDATE albums SET cover=(SELECT file FROM media WHERE id=?) WHERE id=?').run(ids[0], album);
  }
  log(req, 'media.upload', `${ids.length} photos`);
  ok(res, { added: ids.length });
}));
r.post('/media/video', can('content'), (req, res) => {
  const id = U.ytId(req.body.url);
  if (!id) return fail(res, 'YouTube लिंक सही नहीं है।');
  db.prepare(`INSERT INTO media(type,youtube_id,caption) VALUES('video',?,?)`).run(id, String(req.body.caption || '').slice(0, 200));
  ok(res);
});

// ---------------------------------------------------------------- members
const MEMBER_COLS = ['name', 'father_name', 'dob', 'gender', 'mobile', 'email', 'state_code', 'district', 'city', 'address', 'pincode', 'occupation', 'qualification', 'photo', 'designation', 'referral', 'notes', 'valid_till'];
function memberQuery(q) {
  const where = [], args = [];
  if (q.q) { where.push('(name LIKE ? OR mobile LIKE ? OR member_no LIKE ? OR district LIKE ? OR email LIKE ?)'); const s = '%' + q.q + '%'; args.push(s, s, s, s, s); }
  if (q.status) { where.push('status=?'); args.push(q.status); }
  if (q.state_code) { where.push('state_code=?'); args.push(q.state_code); }
  if (q.district) { where.push('district LIKE ?'); args.push('%' + q.district + '%'); }
  if (q.designation) { where.push('designation=?'); args.push(q.designation); }
  if (q.expired === '1') { where.push(`status='active' AND valid_till < date('now')`); }
  return { W: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}
r.get('/members', can('members'), (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1), per = Math.min(200, parseInt(req.query.limit) || 25);
  const { W, args } = memberQuery(req.query);
  const total = db.prepare(`SELECT COUNT(*) n FROM members ${W}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM members ${W} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  const byState = db.prepare(`SELECT state_code, state, COUNT(*) n FROM members WHERE status='active' GROUP BY state_code ORDER BY n DESC`).all();
  ok(res, { rows, total, page, per, byState });
});
r.get('/members/export.csv', can('members'), (req, res) => {
  const { W, args } = memberQuery(req.query);
  const rows = db.prepare(`SELECT * FROM members ${W} ORDER BY id`).all(...args);
  const cols = [['member_no', 'Member No'], ['name', 'Name'], ['father_name', 'Father/Husband'], ['dob', 'DOB'], ['gender', 'Gender'], ['mobile', 'Mobile'], ['email', 'Email'], ['state', 'State'], ['district', 'District'], ['city', 'City'], ['address', 'Address'], ['pincode', 'PIN'], ['occupation', 'Occupation'], ['qualification', 'Qualification'], ['designation', 'Designation'], ['status', 'Status'], ['joined_at', 'Joined'], ['valid_till', 'Valid till'], ['referral', 'Referral']];
  res.type('text/csv').attachment(`members-${U.todayISO()}.csv`).send(U.csv(rows, cols.map(([key, label]) => ({ key, label }))));
  log(req, 'members.export', rows.length);
});
r.get('/members/cards', can('members'), wrap(async (req, res) => {
  let rows;
  if (req.query.ids) { const ids = String(req.query.ids).split(',').map((x) => parseInt(x)).filter(Boolean).slice(0, 500); rows = db.prepare(`SELECT * FROM members WHERE status='active' AND id IN (${ids.map(() => '?').join(',')})`).all(...ids); }
  else { const { W, args } = memberQuery({ ...req.query, status: 'active' }); rows = db.prepare(`SELECT * FROM members ${W} ORDER BY id LIMIT 500`).all(...args); }
  const cards = [];
  for (const m of rows) cards.push(V.idCardHtml(m, await QRCode.toString(`${cfg.SITE_URL}/verify/${encodeURIComponent(m.member_no)}`, { type: 'svg', margin: 0 }), settings()));
  log(req, 'cards.print', rows.length);
  res.type('html').send(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><title>Member cards</title><link rel="stylesheet" href="/css/site.css"><style>body{background:#fff!important;color:#000}.sheet{display:flex;flex-wrap:wrap;gap:6mm;padding:8mm}.pair{display:flex;gap:2mm;break-inside:avoid}.bar{padding:12px;background:#0b1b4d;color:#fff;font:600 14px sans-serif}.bar button{margin-left:12px;padding:6px 14px}@media print{.bar{display:none}.sheet{padding:0}}</style></head><body><div class="bar">${rows.length} cards (front + back) <button onclick="print()">Print</button></div><div class="sheet">${cards.map((c) => `<div class="pair">${c}</div>`).join('')}</div></body></html>`);
}));
r.get('/members/:id', can('members'), (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return fail(res, 'not found', 404);
  const pays = db.prepare(`SELECT id,order_id,amount,status,paid_at,receipt_no FROM donations WHERE member_id=? ORDER BY id DESC`).all(m.id);
  ok(res, { row: m, payments: pays, cardUrl: m.member_no && m.status === 'active' ? `/card/${encodeURIComponent(m.member_no)}?k=${U.hmac('card' + m.member_no)}` : null });
});
function memberData(b) {
  const d = {};
  for (const k of MEMBER_COLS) if (k in b) d[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
  if ('mobile' in d) d.mobile = U.normMobile(d.mobile);
  return d;
}
function checkMember(d, partial) {
  if (!partial || 'name' in d) if (!d.name || d.name.length < 2) return 'नाम आवश्यक है';
  if (!partial || 'mobile' in d) if (!U.validMobile(d.mobile)) return 'सही मोबाइल नंबर लिखें';
  if (d.state_code && !U.stateByCode(d.state_code)) return 'राज्य सही नहीं है';
  if (!U.validEmail(d.email)) return 'ईमेल सही नहीं है';
  return null;
}
r.post('/members', can('members'), (req, res) => {
  const d = memberData(req.body);
  const e = checkMember(d, false);
  if (e) return fail(res, e);
  if (db.prepare(`SELECT 1 FROM members WHERE mobile=? AND status IN ('pending','active')`).get(d.mobile)) return fail(res, 'इस मोबाइल से सदस्य पहले से मौजूद है।');
  const id = S.createMember(d, { source: 'admin' });
  let no = null;
  if (req.body.approve) no = S.approveMember(id, req.user.username);
  log(req, 'member.create', id); ok(res, { id, member_no: no });
});
r.put('/members/:id', can('members'), (req, res) => {
  const d = memberData(req.body);
  const e = checkMember(d, true);
  if (e) return fail(res, e);
  if (d.state_code) d.state = U.stateByCode(d.state_code).hi;
  const keys = Object.keys(d);
  if (keys.length) db.prepare(`UPDATE members SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).run(...keys.map((k) => (d[k] === '' ? null : d[k])), req.params.id);
  log(req, 'member.update', req.params.id); ok(res);
});
r.post('/members/:id/status', can('members'), (req, res) => {
  const st = req.body.status, id = req.params.id;
  if (!['active', 'pending', 'rejected', 'suspended', 'expired'].includes(st)) return fail(res, 'status?');
  let no = null;
  if (st === 'active') no = S.approveMember(id, req.user.username);
  else db.prepare('UPDATE members SET status=? WHERE id=?').run(st, id);
  log(req, 'member.' + st, id); ok(res, { member_no: no });
});
r.post('/members/bulk-status', can('members'), (req, res) => {
  const ids = (req.body.ids || []).map((x) => parseInt(x)).filter(Boolean).slice(0, 1000), st = req.body.status;
  if (!['active', 'rejected', 'suspended'].includes(st)) return fail(res, 'status?');
  db.transaction(() => ids.forEach((id) => (st === 'active' ? S.approveMember(id, req.user.username) : db.prepare('UPDATE members SET status=? WHERE id=?').run(st, id))))();
  log(req, 'member.bulk.' + st, ids.length); ok(res, { n: ids.length });
});
r.post('/members/:id/renew', can('members'), (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return fail(res, 'not found', 404);
  const years = Math.min(10, Math.max(1, parseInt(req.body.years) || 1));
  const base = m.valid_till && m.valid_till > U.todayISO() ? new Date(m.valid_till + 'T00:00:00Z') : new Date(U.todayISO() + 'T00:00:00Z');
  base.setUTCFullYear(base.getUTCFullYear() + years);
  db.prepare(`UPDATE members SET valid_till=?, status='active' WHERE id=?`).run(base.toISOString().slice(0, 10), m.id);
  log(req, 'member.renew', m.id); ok(res, { valid_till: base.toISOString().slice(0, 10) });
});
r.delete('/members/:id', can('super'), (req, res) => {
  const m = db.prepare('SELECT photo FROM members WHERE id=?').get(req.params.id);
  if (!m) return fail(res, 'not found', 404);
  db.prepare('UPDATE donations SET member_id=NULL WHERE member_id=?').run(req.params.id);
  db.prepare('DELETE FROM members WHERE id=?').run(req.params.id);
  unlink(m.photo); log(req, 'member.delete', req.params.id); ok(res);
});
/** Bulk import: rows = [{name,mobile,state_code|state,district,...}] already parsed by the browser from CSV. */
r.post('/members/import', can('members'), (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
  const approve = !!req.body.approve;
  const stByName = (v) => { v = String(v || '').trim(); return U.STATES.find((s) => s.code === v.toUpperCase() || s.hi === v || s.en.toLowerCase() === v.toLowerCase()); };
  const result = { added: 0, skipped: 0, errors: [] };
  db.transaction(() => {
    rows.forEach((raw, i) => {
      const d = memberData(raw);
      const st = stByName(raw.state_code || raw.state);
      if (st) d.state_code = st.code;
      const e = checkMember(d, false);
      if (e) { result.errors.push(`पंक्ति ${i + 2}: ${e}`); return; }
      if (db.prepare(`SELECT 1 FROM members WHERE mobile=? AND status IN ('pending','active')`).get(d.mobile)) { result.skipped++; return; }
      const id = S.createMember(d, { source: 'import' });
      if (approve) S.approveMember(id, req.user.username);
      result.added++;
    });
  })();
  log(req, 'members.import', JSON.stringify({ a: result.added, s: result.skipped })); ok(res, result);
});

// --------------------------------------------------------------- donations
function donationQuery(q) {
  const where = [], args = [];
  if (q.q) { where.push('(name LIKE ? OR mobile LIKE ? OR order_id LIKE ? OR receipt_no LIKE ? OR utr LIKE ? OR pan LIKE ?)'); const s = '%' + q.q + '%'; args.push(s, s, s, s, s, s); }
  if (q.status) { where.push('status=?'); args.push(q.status); }
  if (q.purpose) { where.push('purpose=?'); args.push(q.purpose); }
  if (q.mode) { where.push('mode=?'); args.push(q.mode); }
  if (q.campaign_id) { where.push('campaign_id=?'); args.push(q.campaign_id); }
  if (q.from) { where.push('date(COALESCE(paid_at,created_at))>=?'); args.push(q.from); }
  if (q.to) { where.push('date(COALESCE(paid_at,created_at))<=?'); args.push(q.to); }
  if (q.verify === '1') where.push(`mode='manual' AND status='pending' AND utr IS NOT NULL`);
  // hide abandoned checkouts unless asked
  if (!q.status && !q.q) where.push(`(status!='created')`);
  return { W: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}
r.get('/donations', can('finance'), (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1), per = Math.min(200, parseInt(req.query.limit) || 25);
  const { W, args } = donationQuery(req.query);
  const total = db.prepare(`SELECT COUNT(*) n FROM donations ${W}`).get(...args).n;
  const sum = db.prepare(`SELECT COALESCE(SUM(CASE WHEN status='success' THEN amount END),0) s FROM donations ${W}`).get(...args).s;
  const rows = db.prepare(`SELECT d.*, c.title campaign FROM donations d LEFT JOIN campaigns c ON c.id=d.campaign_id ${W.replace(/\b(name|mobile|order_id|receipt_no|utr|pan|status|purpose|mode|campaign_id|paid_at|created_at)\b/g, 'd.$1')} ORDER BY d.id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  ok(res, { rows: rows.map((d) => ({ ...d, amount: d.amount / 100, raw: undefined, receiptUrl: d.status === 'success' ? `/receipt/${d.order_id}?k=${U.hmac(d.order_id)}` : null })), total, sum: sum / 100, page, per });
});
r.get('/donations/export.csv', can('finance'), (req, res) => {
  const { W, args } = donationQuery({ ...req.query, status: req.query.status || 'success' });
  const rows = db.prepare(`SELECT * FROM donations ${W} ORDER BY paid_at, id`).all(...args);
  const cols = [['receipt_no', 'Receipt'], ['paid_at', 'Date'], ['name', 'Name'], ['mobile', 'Mobile'], ['email', 'Email'], ['pan', 'PAN'], ['address', 'Address'], ['amount', 'Amount (INR)', (r) => r.amount / 100], ['purpose', 'Purpose'], ['mode', 'Mode'], ['utr', 'UTR'], ['order_id', 'Order ID'], ['gateway_ref', 'Gateway ref'], ['notes', 'Notes']];
  res.type('text/csv').attachment(`donations-${U.todayISO()}.csv`).send(U.csv(rows, cols.map(([key, label, get]) => ({ key, label, get }))));
  log(req, 'donations.export', rows.length);
});
r.post('/donations/offline', can('finance'), (req, res) => {
  const b = req.body, amount = money(b.amount), mobile = U.normMobile(b.mobile);
  if (!(amount > 0) || !String(b.name || '').trim()) return fail(res, 'नाम और राशि आवश्यक हैं।');
  if (b.mobile && !U.validMobile(mobile)) return fail(res, 'मोबाइल सही नहीं है।');
  if (b.pan && !U.validPAN(String(b.pan).toUpperCase())) return fail(res, 'PAN सही नहीं है।');
  const oid = S.newOrderId();
  db.prepare(`INSERT INTO donations(order_id,name,mobile,email,pan,address,amount,campaign_id,purpose,mode,status,utr,notes) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,?)`)
    .run(oid, String(b.name).trim(), mobile || null, b.email || null, b.pan ? String(b.pan).toUpperCase() : null, b.address || null, amount, parseInt(b.campaign_id) || null, 'donation', 'offline', b.reference || null, `${b.method || 'Bank/Cheque'}; ${b.notes || ''}`.slice(0, 300));
  const d = S.settle(oid, 'success');
  if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) db.prepare('UPDATE donations SET paid_at=? WHERE order_id=?').run(b.date + ' 06:30:00', oid);
  log(req, 'donation.offline', oid); ok(res, { order_id: oid, receipt_no: d.receipt_no });
});
r.post('/donations/:id/verify', can('finance'), (req, res) => {
  const d = db.prepare('SELECT * FROM donations WHERE id=?').get(req.params.id);
  if (!d) return fail(res, 'not found', 404);
  S.settle(d.order_id, 'success', { utr: req.body.utr });
  log(req, 'donation.verify', d.order_id); ok(res);
});
r.post('/donations/:id/fail', can('finance'), (req, res) => {
  const d = db.prepare('SELECT * FROM donations WHERE id=?').get(req.params.id);
  if (!d) return fail(res, 'not found', 404);
  if (d.status === 'success') return fail(res, 'सफल भुगतान को असफल नहीं किया जा सकता।');
  S.settle(d.order_id, 'failed');
  log(req, 'donation.fail', d.order_id); ok(res);
});
r.post('/donations/:id/refresh', can('finance'), wrap(async (req, res) => {
  const d = db.prepare('SELECT * FROM donations WHERE id=?').get(req.params.id);
  if (!d) return fail(res, 'not found', 404);
  if (d.mode !== 'phonepe') return fail(res, 'यह भुगतान PhonePe से नहीं है।');
  try { const x = await S.refreshFromGateway(d.order_id); ok(res, { status: x.status }); } catch (e) { fail(res, e.message); }
}));

// ----------------------------------------------------------------- finance
r.get('/finance/summary', can('finance'), (req, res) => {
  const fy = req.query.fy || U.financialYear();
  const y = parseInt(fy.slice(0, 4)), from = `${y}-04-01 00:00:00`, to = `${y + 1}-03-31 23:59:59`, fromD = from.slice(0, 10), toD = to.slice(0, 10);
  const inc = db.prepare(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM donations WHERE status='success' AND paid_at BETWEEN ? AND ?`).get(from, to);
  const exp = db.prepare(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM expenses WHERE date BETWEEN ? AND ?`).get(fromD, toD);
  const all = db.prepare(`SELECT (SELECT COALESCE(SUM(amount),0) FROM donations WHERE status='success') - (SELECT COALESCE(SUM(amount),0) FROM expenses) b`).get().b;
  const byMonth = db.prepare(`SELECT substr(paid_at,1,7) m, SUM(amount) inc FROM donations WHERE status='success' AND paid_at BETWEEN ? AND ? GROUP BY m`).all(from, to);
  const expMonth = db.prepare(`SELECT substr(date,1,7) m, SUM(amount) exp FROM expenses WHERE date BETWEEN ? AND ? GROUP BY m`).all(fromD, toD);
  const months = []; for (let i = 0; i < 12; i++) { const dt = new Date(Date.UTC(y, 3 + i, 1)); months.push(dt.toISOString().slice(0, 7)); }
  ok(res, {
    fy, income: inc.s / 100, incomeCount: inc.n, expense: exp.s / 100, expenseCount: exp.n, net: (inc.s - exp.s) / 100, balance: all / 100,
    months: months.map((m) => ({ m, income: (byMonth.find((x) => x.m === m)?.inc || 0) / 100, expense: (expMonth.find((x) => x.m === m)?.exp || 0) / 100 })),
    byCampaign: db.prepare(`SELECT COALESCE(c.title,'सामान्य कोष') k, SUM(d.amount)/100.0 v, COUNT(*) n FROM donations d LEFT JOIN campaigns c ON c.id=d.campaign_id WHERE d.status='success' AND d.paid_at BETWEEN ? AND ? GROUP BY k ORDER BY v DESC`).all(from, to),
    byMode: db.prepare(`SELECT mode k, SUM(amount)/100.0 v, COUNT(*) n FROM donations WHERE status='success' AND paid_at BETWEEN ? AND ? GROUP BY mode ORDER BY v DESC`).all(from, to),
    byCategory: db.prepare(`SELECT COALESCE(NULLIF(category,''),'अन्य') k, SUM(amount)/100.0 v, COUNT(*) n FROM expenses WHERE date BETWEEN ? AND ? GROUP BY k ORDER BY v DESC`).all(fromD, toD),
  });
});
r.get('/finance/report24a.csv', can('finance'), (req, res) => {
  const fy = req.query.fy || U.financialYear(), y = parseInt(fy.slice(0, 4));
  const thr = (parseInt(settings().pan_required_above) || 20000) * 100;
  const rows = db.prepare(`SELECT * FROM donations WHERE status='success' AND amount>? AND paid_at BETWEEN ? AND ? ORDER BY paid_at`).all(thr, `${y}-04-01 00:00:00`, `${y + 1}-03-31 23:59:59`).map((r, i) => ({ ...r, sl: i + 1 }));
  const cols = [{ label: 'Sl', key: 'sl' }, { label: 'Name', key: 'name' }, { label: 'Address', key: 'address' }, { label: 'PAN', key: 'pan' }, { label: 'Amount (INR)', get: (r) => r.amount / 100 }, { label: 'Mode', key: 'mode' }, { label: 'Date', get: (r) => (r.paid_at || '').slice(0, 10) }, { label: 'Receipt', key: 'receipt_no' }, { label: 'Reference/UTR', get: (r) => r.utr || r.gateway_ref || r.order_id }];
  res.type('text/csv').attachment(`contributions-above-threshold-${fy}.csv`).send(U.csv(rows, cols));
});

// ---------------------------------------------------------------- settings
r.get('/settings', can('super'), (req, res) => ok(res, { settings: settings(), keys: Object.keys(DEFAULT_SETTINGS) }));
r.put('/settings', can('super'), (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in b) setSetting(k, String(b[k]).slice(0, 2000));
  log(req, 'settings.update'); ok(res);
});
r.get('/audit', can('super'), (req, res) => ok(res, { rows: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all() }));
r.get('/lookups', can('any'), (req, res) => ok(res, {
  states: U.STATES, campaigns: db.prepare('SELECT id,title FROM campaigns ORDER BY id DESC').all(), albums: db.prepare('SELECT id,title FROM albums ORDER BY id DESC').all(),
  designations: db.prepare(`SELECT DISTINCT designation d FROM members WHERE designation IS NOT NULL`).all().map((x) => x.d),
}));

r.use((err, req, res, next) => { console.error('[admin]', err); res.status(500).json({ ok: false, error: err.message || 'server error' }); });
module.exports = r;
