const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// App secret: from env, otherwise generated once and persisted in the data volume.
let SECRET = process.env.APP_SECRET;
if (!SECRET) {
  const f = path.join(DATA_DIR, '.secret');
  if (fs.existsSync(f)) SECRET = fs.readFileSync(f, 'utf8').trim();
  else {
    SECRET = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(f, SECRET, { mode: 0o600 });
  }
}

const env = process.env;
const phonepeConfigured = !!(env.PHONEPE_CLIENT_ID && env.PHONEPE_CLIENT_SECRET);

// PAYMENT_MODE: phonepe | manual | mock
//  phonepe -> PhonePe Payment Gateway (Standard Checkout v2)
//  manual  -> UPI QR/intent + donor enters UTR, admin verifies (use until the PhonePe API is approved)
//  mock    -> fake gateway page for local testing only
let PAYMENT_MODE = (env.PAYMENT_MODE || '').toLowerCase();
if (!['phonepe', 'manual', 'mock'].includes(PAYMENT_MODE)) {
  PAYMENT_MODE = phonepeConfigured ? 'phonepe' : env.UPI_ID ? 'manual' : env.NODE_ENV === 'production' ? 'manual' : 'mock';
}

module.exports = {
  ROOT, DATA_DIR, UPLOAD_DIR, SECRET,
  VERSION: Date.now().toString(36),
  PORT: +env.PORT || 3000,
  PROD: env.NODE_ENV === 'production',
  SITE_URL: (env.SITE_URL || 'http://localhost:' + (+env.PORT || 3000)).replace(/\/$/, ''),
  ADMIN_USER: env.ADMIN_USER || 'admin',
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  PAYMENT_MODE,
  PHONEPE: {
    env: (env.PHONEPE_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox',
    clientId: env.PHONEPE_CLIENT_ID || '',
    clientSecret: env.PHONEPE_CLIENT_SECRET || '',
    clientVersion: env.PHONEPE_CLIENT_VERSION || '1',
    webhookUser: env.PHONEPE_WEBHOOK_USER || '',
    webhookPass: env.PHONEPE_WEBHOOK_PASS || '',
  },
  UPI_ID: env.UPI_ID || '',
  UPI_NAME: env.UPI_NAME || 'Bharatiya Muslim Manch',
};
