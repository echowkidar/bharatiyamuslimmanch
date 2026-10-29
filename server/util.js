const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const sanitizeHtml = require('sanitize-html');
const cfg = require('./config');

const STATES = [
  ['AN', 'अंडमान और निकोबार', 'Andaman & Nicobar'], ['AP', 'आंध्र प्रदेश', 'Andhra Pradesh'], ['AR', 'अरुणाचल प्रदेश', 'Arunachal Pradesh'],
  ['AS', 'असम', 'Assam'], ['BR', 'बिहार', 'Bihar'], ['CH', 'चंडीगढ़', 'Chandigarh'], ['CG', 'छत्तीसगढ़', 'Chhattisgarh'],
  ['DN', 'दादरा नगर हवेली और दमन दीव', 'Dadra & Nagar Haveli and Daman & Diu'], ['DL', 'दिल्ली', 'Delhi'], ['GA', 'गोवा', 'Goa'],
  ['GJ', 'गुजरात', 'Gujarat'], ['HR', 'हरियाणा', 'Haryana'], ['HP', 'हिमाचल प्रदेश', 'Himachal Pradesh'], ['JK', 'जम्मू और कश्मीर', 'Jammu & Kashmir'],
  ['JH', 'झारखंड', 'Jharkhand'], ['KA', 'कर्नाटक', 'Karnataka'], ['KL', 'केरल', 'Kerala'], ['LA', 'लद्दाख', 'Ladakh'], ['LD', 'लक्षद्वीप', 'Lakshadweep'],
  ['MP', 'मध्य प्रदेश', 'Madhya Pradesh'], ['MH', 'महाराष्ट्र', 'Maharashtra'], ['MN', 'मणिपुर', 'Manipur'], ['ML', 'मेघालय', 'Meghalaya'],
  ['MZ', 'मिज़ोरम', 'Mizoram'], ['NL', 'नागालैंड', 'Nagaland'], ['OD', 'ओडिशा', 'Odisha'], ['PY', 'पुडुचेरी', 'Puducherry'], ['PB', 'पंजाब', 'Punjab'],
  ['RJ', 'राजस्थान', 'Rajasthan'], ['SK', 'सिक्किम', 'Sikkim'], ['TN', 'तमिलनाडु', 'Tamil Nadu'], ['TS', 'तेलंगाना', 'Telangana'],
  ['TR', 'त्रिपुरा', 'Tripura'], ['UP', 'उत्तर प्रदेश', 'Uttar Pradesh'], ['UK', 'उत्तराखंड', 'Uttarakhand'], ['WB', 'पश्चिम बंगाल', 'West Bengal'],
].map(([code, hi, en]) => ({ code, hi, en }));
const stateByCode = (c) => STATES.find((s) => s.code === c);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cleanHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote', 'img', 'figure', 'figcaption', 'hr', 'div', 'span'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'], div: ['style'], p: ['style'], span: ['style'] },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer', target: '_blank' } }),
    },
    exclusiveFilter: (f) => f.tag === 'img' && !/^(\/uploads\/|https:\/\/)/.test(f.attribs.src || ''),
  });
}
const plain = (s, max = 200) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const hmac = (s) => crypto.createHmac('sha256', cfg.SECRET).update(String(s)).digest('hex').slice(0, 24);
const rand = (n = 8) => crypto.randomBytes(n).toString('hex');
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- images ----------
async function saveImage(buffer, { width = 1800, height = null, fit = 'inside', prefix = 'img', thumb = false } = {}) {
  const base = `${prefix}-${Date.now().toString(36)}-${rand(4)}`;
  const pipeline = () => sharp(buffer, { failOn: 'error', limitInputPixels: 80e6 }).rotate();
  const out = path.join(cfg.UPLOAD_DIR, base + '.webp');
  await pipeline().resize({ width, height: height || undefined, fit, withoutEnlargement: !height }).webp({ quality: 82 }).toFile(out);
  if (thumb) await pipeline().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(cfg.UPLOAD_DIR, base + '-t.webp'));
  return '/uploads/' + base + '.webp';
}
const thumbOf = (f) => (f && f.endsWith('.webp') ? f.replace(/\.webp$/, '-t.webp') : f);
function savePdf(buffer) {
  if (buffer.slice(0, 5).toString() !== '%PDF-') throw new Error('Only PDF documents are allowed');
  const name = `doc-${Date.now().toString(36)}-${rand(4)}.pdf`;
  fs.writeFileSync(path.join(cfg.UPLOAD_DIR, name), buffer);
  return '/uploads/' + name;
}

// ---------- formatting ----------
const inr = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const rupeesToPaise = (r) => Math.round(Number(r) * 100);
function fmtDate(d, lang = 'hi') {
  if (!d) return '';
  const dt = new Date(String(d).includes('T') || String(d).includes(' ') ? String(d).replace(' ', 'T') + (String(d).includes('Z') || /\+\d\d:?\d\d$/.test(d) ? '' : 'Z') : d + 'T00:00:00');
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
function financialYear(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 3600e3);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const todayISO = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const validMobile = (m) => /^[6-9]\d{9}$/.test(String(m || ''));
const normMobile = (m) => String(m || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
const validEmail = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validPAN = (p) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(p || '').toUpperCase());
const ytId = (s) => {
  const m = String(s || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || String(s || '').match(/^([\w-]{11})$/);
  return m ? m[1] : null;
};

function csv(rows, cols) {
  const q = (v) => {
    v = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(v)) v = "'" + v; // neutralise spreadsheet formulas
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return '﻿' + [cols.map((c) => q(c.label)).join(','), ...rows.map((r) => cols.map((c) => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\r\n');
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', inq = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
    else if (c === '"') inq = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

module.exports = {
  STATES, stateByCode, esc, cleanHtml, plain, hmac, rand, safeEq, saveImage, thumbOf, savePdf, inr, rupeesToPaise, fmtDate,
  financialYear, todayISO, nowSql, validMobile, normMobile, validEmail, validPAN, ytId, csv, parseCSV,
};
