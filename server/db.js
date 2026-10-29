const path = require('path');
const Database = require('better-sqlite3');
const cfg = require('./config');

const db = new Database(path.join(cfg.DATA_DIR, 'bmm.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY, val INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS leaders(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, title TEXT, title_en TEXT, bio TEXT, photo TEXT,
  grp TEXT DEFAULT 'national', sort INTEGER DEFAULT 100, facebook TEXT, x TEXT, youtube TEXT, phone TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS press(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT, body TEXT, cover TEXT, attachment TEXT,
  status TEXT DEFAULT 'draft', published_at TEXT, created_by TEXT, views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS albums(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, cover TEXT, sort INTEGER DEFAULT 100,
  event_date TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS media(
  id INTEGER PRIMARY KEY, album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE, type TEXT DEFAULT 'photo',
  file TEXT, youtube_id TEXT, caption TEXT, sort INTEGER DEFAULT 100, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, venue TEXT, event_date TEXT, image TEXT,
  status TEXT DEFAULT 'published', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS units(
  id INTEGER PRIMARY KEY, state_code TEXT, state TEXT NOT NULL, district TEXT, head_name TEXT, head_title TEXT,
  phone TEXT, email TEXT, address TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS notices(
  id INTEGER PRIMARY KEY, text TEXT NOT NULL, link TEXT, sort INTEGER DEFAULT 100, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS pages(
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, body TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaigns(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, target INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS members(
  id INTEGER PRIMARY KEY, member_no TEXT UNIQUE, name TEXT NOT NULL, father_name TEXT, dob TEXT, gender TEXT,
  mobile TEXT NOT NULL, email TEXT, state_code TEXT, state TEXT, district TEXT, city TEXT, address TEXT, pincode TEXT,
  occupation TEXT, qualification TEXT, photo TEXT, designation TEXT DEFAULT 'सदस्य', referral TEXT,
  status TEXT DEFAULT 'pending', fee_paid INTEGER DEFAULT 0, joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  valid_till TEXT, approved_by TEXT, approved_at TEXT, notes TEXT, source TEXT DEFAULT 'web',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_members_mobile ON members(mobile);
CREATE INDEX IF NOT EXISTS idx_members_state ON members(state_code, status);
CREATE TABLE IF NOT EXISTS donations(
  id INTEGER PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, name TEXT, mobile TEXT, email TEXT, pan TEXT, address TEXT,
  amount INTEGER NOT NULL, campaign_id INTEGER, purpose TEXT DEFAULT 'donation', member_id INTEGER,
  mode TEXT DEFAULT 'phonepe', status TEXT DEFAULT 'created', gateway_ref TEXT, utr TEXT, receipt_no TEXT,
  anonymous INTEGER DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, paid_at TEXT, raw TEXT
);
CREATE INDEX IF NOT EXISTS idx_don_status ON donations(status, paid_at);
CREATE TABLE IF NOT EXISTS expenses(
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, category TEXT, amount INTEGER NOT NULL, payee TEXT, note TEXT,
  voucher TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY, name TEXT, mobile TEXT, email TEXT, subject TEXT, message TEXT,
  status TEXT DEFAULT 'new', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, user TEXT, action TEXT, detail TEXT, ip TEXT
);
`);

const DEFAULT_SETTINGS = {
  site_name: 'भारतीय मुस्लिम मंच',
  site_name_en: 'Bharatiya Muslim Manch',
  tagline: 'संविधान • भाईचारा • इंसाफ',
  tagline_en: 'Constitution • Brotherhood • Justice',
  hero_title: 'हिंदुस्तान को मज़बूत बनाने की साझा आवाज़',
  hero_title_en: "A shared voice to make India stronger",
  hero_sub: 'संविधान के दायरे में रहकर शिक्षा, इंसाफ़, रोज़गार और अमन के लिए संघर्षरत राष्ट्रीय मंच।',
  hero_sub_en: 'A national platform working within the Constitution for education, justice, livelihood and peace.',
  office_address: 'नई दिल्ली, भारत',
  phone: '',
  email: 'info@bharatiyamuslimmanch.org',
  whatsapp: '',
  facebook: 'https://www.facebook.com/mumtaz.alam.1650',
  x: '',
  instagram: '',
  youtube: 'https://www.youtube.com/@MMCNEWSINDIA',
  membership_fee: '0',
  auto_approve: '0',
  membership_valid_years: '1',
  min_donation: '10',
  donation_presets: '101,501,1001,2100,5100,11000',
  pan_required_above: '20000',
  receipt_footer: 'यह एक स्वैच्छिक योगदान की रसीद है।',
  stat_members_extra: '0',
  stat_states_extra: '0',
  maps_embed: '',
  pending_banner: '',
};
const getS = db.prepare('SELECT value FROM settings WHERE key=?');
const putS = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const insS = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insS.run(k, v);

let cache = null;
function settings() {
  if (!cache) {
    cache = {};
    for (const r of db.prepare('SELECT key,value FROM settings').all()) cache[r.key] = r.value;
  }
  return cache;
}
function setSetting(k, v) { putS.run(k, String(v ?? '')); cache = null; }
function nextCounter(name) {
  return db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO counters(name,val) VALUES(?,0)').run(name);
    db.prepare('UPDATE counters SET val=val+1 WHERE name=?').run(name);
    return db.prepare('SELECT val FROM counters WHERE name=?').get(name).val;
  })();
}
function audit(user, action, detail, ip) {
  try { db.prepare('INSERT INTO audit(user,action,detail,ip) VALUES(?,?,?,?)').run(user || '-', action, detail ? String(detail).slice(0, 500) : '', ip || ''); } catch (e) { /* ignore */ }
}

module.exports = { db, settings, setSetting, nextCounter, audit, DEFAULT_SETTINGS };
