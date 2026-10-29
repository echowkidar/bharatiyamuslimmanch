const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { db, settings, audit } = require('../db');
const cfg = require('../config');
const U = require('../util');
const V = require('../views');
const S = require('../services');
const phonepe = require('../phonepe');

const r = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
const lim = (n, mins = 60) => rateLimit({ windowMs: mins * 60e3, limit: n, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'बहुत ज़्यादा अनुरोध। कृपया कुछ देर बाद प्रयास करें।' } });
const html = (res, s) => res.type('html').send(s);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

r.get('/lang/:l', (req, res) => {
  res.cookie('lang', req.params.l === 'en' ? 'en' : 'hi', { maxAge: 365 * 864e5, sameSite: 'lax', httpOnly: false });
  const next = String(req.query.next || '/');
  res.redirect(/^\/(?!\/)/.test(next) ? next : '/');
});

r.get('/', (req, res) => html(res, V.home(V.ctxOf(req))));
r.get('/about', (req, res) => html(res, V.aboutPage(V.ctxOf(req))));
r.get('/leaders', (req, res) => html(res, V.leadersPage(V.ctxOf(req))));
r.get('/p/:slug', (req, res, next) => {
  const pg = db.prepare('SELECT * FROM pages WHERE slug=?').get(req.params.slug);
  if (!pg) return next();
  html(res, V.cmsPage(V.ctxOf(req), pg));
});

r.get('/press', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1), per = 9;
  const total = db.prepare(`SELECT COUNT(*) n FROM press WHERE status='published'`).get().n;
  const rows = db.prepare(`SELECT * FROM press WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT ? OFFSET ?`).all(per, (page - 1) * per);
  html(res, V.pressList(V.ctxOf(req), page, total, rows));
});
r.get('/press/:id', (req, res, next) => {
  const id = parseInt(req.params.id);
  const p = db.prepare(`SELECT * FROM press WHERE id=? AND status='published'`).get(id);
  if (!p) return next();
  db.prepare('UPDATE press SET views=views+1 WHERE id=?').run(id);
  const more = db.prepare(`SELECT * FROM press WHERE status='published' AND id!=? ORDER BY published_at DESC LIMIT 3`).all(id);
  html(res, V.pressArticle(V.ctxOf(req), p, more));
});

r.get('/gallery', (req, res) => {
  const tab = req.query.tab === 'video' ? 'video' : 'photo';
  const albums = db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM media m WHERE m.album_id=a.id AND m.type='photo') n FROM albums a WHERE a.active=1 ORDER BY a.event_date DESC, a.sort, a.id DESC`).all();
  const photos = db.prepare(`SELECT * FROM media WHERE type='photo' AND album_id IS NULL ORDER BY id DESC LIMIT 60`).all();
  const videos = db.prepare(`SELECT * FROM media WHERE type='video' ORDER BY sort,id DESC LIMIT 60`).all();
  html(res, V.galleryPage(V.ctxOf(req), tab, albums, photos, videos));
});
r.get('/gallery/:id', (req, res, next) => {
  const a = db.prepare('SELECT * FROM albums WHERE id=? AND active=1').get(parseInt(req.params.id));
  if (!a) return next();
  const photos = db.prepare(`SELECT * FROM media WHERE album_id=? AND type='photo' ORDER BY sort,id`).all(a.id);
  html(res, V.albumPage(V.ctxOf(req), a, photos));
});
r.get('/events', (req, res) => html(res, V.eventsPage(V.ctxOf(req), db.prepare(`SELECT * FROM events WHERE status='published' ORDER BY event_date DESC`).all())));
r.get('/units', (req, res) => html(res, V.unitsPage(V.ctxOf(req), db.prepare(`SELECT * FROM units WHERE active=1 ORDER BY state, district`).all())));
r.get('/contact', (req, res) => html(res, V.contactPage(V.ctxOf(req))));

// ------------------------------------------------------------------ forms
const bad = (res, error, code = 400) => res.status(code).json({ ok: false, error });
const honeypot = (req) => !!(req.body && req.body.website);
const clean = (v, n = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

r.post('/api/contact', lim(10), express.urlencoded({ extended: false, limit: '20kb' }), (req, res) => {
  const b = req.body || {};
  if (honeypot(req)) return res.json({ ok: true, message: 'ok' });
  const mobile = U.normMobile(b.mobile);
  if (!clean(b.name) || !U.validMobile(mobile) || !clean(b.message, 2000)) return bad(res, 'कृपया नाम, सही मोबाइल नंबर और संदेश भरें।');
  if (!U.validEmail(clean(b.email))) return bad(res, 'ईमेल सही नहीं है।');
  db.prepare('INSERT INTO messages(name,mobile,email,subject,message) VALUES(?,?,?,?,?)').run(clean(b.name, 80), mobile, clean(b.email, 100), clean(b.subject, 120), clean(b.message, 2000));
  res.json({ ok: true, message: 'आपका संदेश मिल गया। हम जल्द संपर्क करेंगे। धन्यवाद!' });
});

r.post('/api/join', lim(8), upload.single('photo'), wrap(async (req, res) => {
  const b = req.body || {};
  if (honeypot(req)) return res.json({ ok: true, redirect: '/' });
  const mobile = U.normMobile(b.mobile);
  const st = U.stateByCode(b.state_code);
  if (clean(b.name, 80).length < 3) return bad(res, 'कृपया अपना पूरा नाम लिखें।');
  if (!U.validMobile(mobile)) return bad(res, 'कृपया सही 10 अंकों का मोबाइल नंबर लिखें।');
  if (!U.validEmail(clean(b.email))) return bad(res, 'ईमेल सही नहीं है।');
  if (!st) return bad(res, 'कृपया राज्य चुनें।');
  if (!clean(b.district)) return bad(res, 'कृपया ज़िला लिखें।');
  if (!b.consent) return bad(res, 'कृपया घोषणा स्वीकार करें।');
  if (b.dob && !/^\d{4}-\d{2}-\d{2}$/.test(b.dob)) return bad(res, 'जन्म तिथि सही नहीं है।');
  if (b.pincode && !/^\d{6}$/.test(b.pincode)) return bad(res, 'पिन कोड 6 अंकों का होना चाहिए।');
  const dup = db.prepare(`SELECT id,status FROM members WHERE mobile=? AND status IN ('pending','active') LIMIT 1`).get(mobile);
  if (dup) return bad(res, dup.status === 'active' ? 'इस मोबाइल नंबर से सदस्यता पहले से सक्रिय है। कार्ड पाने के लिए "कार्ड पाएँ" पेज देखें।' : 'इस मोबाइल नंबर से आवेदन पहले ही प्राप्त हो चुका है।');
  let photo = null;
  if (req.file) {
    try { photo = await U.saveImage(req.file.buffer, { width: 480, height: 600, fit: 'cover', prefix: 'member' }); }
    catch (e) { return bad(res, 'फ़ोटो पढ़ी नहीं जा सकी। कृपया JPG/PNG फ़ोटो चुनें।'); }
  }
  const id = S.createMember({
    name: clean(b.name, 80), father_name: clean(b.father_name, 80), dob: b.dob, gender: ['M', 'F', 'O'].includes(b.gender) ? b.gender : null, mobile,
    email: clean(b.email, 100), state_code: st.code, district: clean(b.district, 60), city: clean(b.city, 60), address: clean(b.address, 300),
    pincode: b.pincode, occupation: clean(b.occupation, 60), qualification: clean(b.qualification, 60), referral: clean(b.referral, 80), photo,
  });
  const fee = (parseInt(settings().membership_fee) || 0) * 100;
  if (fee > 0) {
    const out = await S.startPayment({ name: clean(b.name, 80), mobile, email: clean(b.email, 100), amountPaise: fee, purpose: 'membership', member_id: id });
    return res.json({ ok: true, redirect: out.redirectUrl });
  }
  if (settings().auto_approve === '1') S.approveMember(id, 'auto');
  res.json({ ok: true, redirect: `/join/done?id=${id}&k=${U.hmac('join' + id)}` });
}));
r.get('/join', (req, res) => html(res, V.joinPage(V.ctxOf(req))));
r.get('/join/done', (req, res, next) => {
  const id = parseInt(req.query.id);
  if (!U.safeEq(U.hmac('join' + id), req.query.k || '')) return next();
  const m = db.prepare('SELECT name FROM members WHERE id=?').get(id);
  if (!m) return next();
  html(res, V.joinDone(V.ctxOf(req), m));
});

// --------------------------------------------------------- member card
r.get('/card', (req, res) => html(res, V.cardLookupPage(V.ctxOf(req))));
r.post('/api/card', lim(20), express.urlencoded({ extended: false, limit: '5kb' }), (req, res) => {
  const no = clean(req.body.member_no, 30).toUpperCase(), mobile = U.normMobile(req.body.mobile);
  const m = db.prepare('SELECT * FROM members WHERE member_no=? AND mobile=?').get(no, mobile);
  if (!m) return bad(res, 'सदस्यता संख्या और मोबाइल नंबर मेल नहीं खाते।');
  if (m.status !== 'active') return bad(res, 'आपकी सदस्यता अभी सक्रिय नहीं है। कृपया स्वीकृति की प्रतीक्षा करें।');
  res.json({ ok: true, redirect: `/card/${encodeURIComponent(no)}?k=${U.hmac('card' + no)}` });
});
r.get('/card/:no', wrap(async (req, res, next) => {
  const no = req.params.no.toUpperCase();
  if (!U.safeEq(U.hmac('card' + no), String(req.query.k || ''))) return next();
  const m = db.prepare(`SELECT * FROM members WHERE member_no=? AND status='active'`).get(no);
  if (!m) return next();
  const qr = await QRCode.toString(`${cfg.SITE_URL}/verify/${encodeURIComponent(no)}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  html(res, V.cardPage(V.ctxOf(req), m, qr));
}));
r.get('/verify/:no', (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE member_no=?').get(req.params.no.toUpperCase());
  html(res, V.verifyPage(V.ctxOf(req), m));
});

// -------------------------------------------------------------- donations
r.get('/donate', (req, res) => {
  const camps = db.prepare('SELECT * FROM campaigns WHERE active=1 ORDER BY id DESC').all();
  html(res, V.donatePage(V.ctxOf(req), camps, parseInt(req.query.amount) || 0));
});
r.post('/api/donate', lim(20), express.urlencoded({ extended: false, limit: '10kb' }), wrap(async (req, res) => {
  const b = req.body || {};
  if (honeypot(req)) return res.json({ ok: true, redirect: '/' });
  const s = settings();
  const amount = Math.round(Number(b.amount));
  const min = parseInt(s.min_donation) || 10, thr = parseInt(s.pan_required_above) || 20000;
  const mobile = U.normMobile(b.mobile), pan = clean(b.pan, 10).toUpperCase();
  if (!Number.isFinite(amount) || amount < min) return bad(res, `न्यूनतम राशि ₹${min} है।`);
  if (amount > 500000) return bad(res, 'ऑनलाइन अधिकतम ₹5,00,000 स्वीकार्य है। बड़ी राशि के लिए कार्यालय से संपर्क करें।');
  if (clean(b.name, 80).length < 2) return bad(res, 'कृपया अपना नाम लिखें।');
  if (!U.validMobile(mobile)) return bad(res, 'कृपया सही मोबाइल नंबर लिखें।');
  if (!U.validEmail(clean(b.email))) return bad(res, 'ईमेल सही नहीं है।');
  if (pan && !U.validPAN(pan)) return bad(res, 'PAN सही नहीं है (जैसे ABCDE1234F)।');
  if (amount > thr && (!pan || clean(b.address, 300).length < 8)) return bad(res, `₹${thr.toLocaleString('en-IN')} से अधिक योगदान के लिए PAN और पता आवश्यक है।`);
  if (!b.declare) return bad(res, 'कृपया भारतीय नागरिक होने की घोषणा स्वीकार करें।');
  const camp = parseInt(b.campaign_id) || null;
  if (camp && !db.prepare('SELECT 1 FROM campaigns WHERE id=? AND active=1').get(camp)) return bad(res, 'अभियान सही नहीं है।');
  const out = await S.startPayment({ name: clean(b.name, 80), mobile, email: clean(b.email, 100), pan, address: clean(b.address, 300), amountPaise: amount * 100, campaign_id: camp });
  res.json({ ok: true, redirect: out.redirectUrl });
}));

const orderGuard = (req, res, next) => {
  const d = db.prepare('SELECT * FROM donations WHERE order_id=?').get(req.params.id);
  if (!d || !U.safeEq(U.hmac(d.order_id), String(req.query.k || req.body?.k || ''))) return next('route');
  req.order = d; next();
};
r.get('/pay/status/:id', orderGuard, wrap(async (req, res) => {
  let d = req.order;
  if (d.status === 'pending' && d.mode === 'phonepe') { try { d = await S.refreshFromGateway(d.order_id); } catch (e) { console.error('[status]', e.message); } }
  html(res, V.payStatusPage(V.ctxOf(req), d));
}));
r.get('/api/pay/state/:id', orderGuard, wrap(async (req, res) => {
  let d = req.order;
  if (d.status === 'pending' && d.mode === 'phonepe') { try { d = await S.refreshFromGateway(d.order_id); } catch (e) { /* keep pending */ } }
  res.json({ status: d.status });
}));
r.get('/pay/upi/:id', orderGuard, wrap(async (req, res) => {
  if (req.order.mode !== 'manual' || req.order.status === 'success') return res.redirect(`/pay/status/${req.order.order_id}?k=${U.hmac(req.order.order_id)}`);
  const link = S.upiLink(req.order);
  html(res, V.upiPage(V.ctxOf(req), req.order, await QRCode.toString(link, { type: 'svg', margin: 1, width: 240 }), link));
}));
r.post('/api/pay/utr', lim(30), express.urlencoded({ extended: false, limit: '5kb' }), (req, res) => {
  const id = clean(req.body.order, 40), d = db.prepare('SELECT * FROM donations WHERE order_id=?').get(id);
  if (!d || !U.safeEq(U.hmac(id), String(req.body.k || '')) || d.mode !== 'manual') return bad(res, 'ऑर्डर नहीं मिला।', 404);
  const utr = clean(req.body.utr, 30);
  if (!/^[A-Za-z0-9]{8,30}$/.test(utr)) return bad(res, 'UTR सही नहीं है।');
  if (db.prepare(`SELECT 1 FROM donations WHERE utr=? AND order_id!=?`).get(utr, id)) return bad(res, 'यह UTR पहले ही दर्ज हो चुका है।');
  db.prepare(`UPDATE donations SET utr=? WHERE order_id=? AND status!='success'`).run(utr, id);
  res.json({ ok: true, redirect: `/pay/status/${id}?k=${U.hmac(id)}` });
});
// mock gateway (local testing only)
r.get('/pay/mock/:id', orderGuard, (req, res) => (cfg.PAYMENT_MODE === 'mock' ? html(res, V.mockPage(V.ctxOf(req), req.order)) : res.sendStatus(404)));
r.post('/pay/mock/:id', express.urlencoded({ extended: false }), orderGuard, (req, res) => {
  if (cfg.PAYMENT_MODE !== 'mock') return res.sendStatus(404);
  S.settle(req.order.order_id, req.body.r === 'ok' ? 'success' : 'failed');
  res.redirect(`/pay/status/${req.order.order_id}?k=${U.hmac(req.order.order_id)}`);
});

// PhonePe server-to-server callback
r.post('/api/phonepe/webhook', express.json({ limit: '100kb' }), wrap(async (req, res) => {
  if (!phonepe.verifyWebhookAuth(req.get('authorization'))) return res.sendStatus(401);
  const p = (req.body && req.body.payload) || {};
  const orderId = p.merchantOrderId;
  if (!orderId) return res.sendStatus(200);
  // Never trust the body alone: confirm with PhonePe's order status API.
  try { await S.refreshFromGateway(orderId); } catch (e) {
    console.error('[webhook]', e.message);
    if (/CHECKOUT_ORDER_COMPLETED|PAYMENT_SUCCESS/i.test(req.body.event || '') === false && String(p.state).toUpperCase() === 'FAILED') S.settle(orderId, 'failed', { raw: p });
  }
  res.sendStatus(200);
}));

r.get('/receipt/:id', orderGuard, (req, res, next) => {
  if (req.order.status !== 'success') return next();
  const camp = req.order.campaign_id ? db.prepare('SELECT title FROM campaigns WHERE id=?').get(req.order.campaign_id) : null;
  html(res, V.receiptPage(V.ctxOf(req), req.order, camp));
});

// ----------------------------------------------------------------- SEO
r.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/about', '/leaders', '/press', '/gallery', '/events', '/units', '/join', '/donate', '/contact', '/card'];
  db.prepare(`SELECT id,published_at FROM press WHERE status='published'`).all().forEach((p) => urls.push('/press/' + p.id));
  db.prepare(`SELECT id FROM albums WHERE active=1`).all().forEach((a) => urls.push('/gallery/' + a.id));
  res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${cfg.SITE_URL}${u}</loc></url>`).join('')}</urlset>`);
});
r.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /pay/\nDisallow: /receipt/\nDisallow: /card/\nSitemap: ${cfg.SITE_URL}/sitemap.xml\n`));

module.exports = r;
