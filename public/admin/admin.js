(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const dt = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '');
const app = $('#app');
let ME = null, LOOK = null;

async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' };
  if (opts.body instanceof FormData) o.body = opts.body;
  else if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const r = await fetch('/api/admin' + path, o);
  if (r.status === 401 && path !== '/login') { ME = null; renderLogin(); throw new Error('login'); }
  const j = await r.json().catch(() => ({ ok: false, error: 'server error' }));
  if (!j.ok) throw new Error(j.error || 'त्रुटि');
  return j;
}
const toast = (m, bad) => { const t = document.createElement('div'); t.className = 'toast'; t.style.background = bad ? '#a32121' : ''; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); };
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { if (e.message !== 'login') toast(e.message, true); } };
const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// ---------------------------------------------------------------- modal
function modal(html, { wide } = {}) {
  const m = document.createElement('div'); m.className = 'modal' + (wide ? ' wide' : ''); m.innerHTML = `<div>${html}</div>`;
  m.addEventListener('mousedown', (e) => { if (e.target === m) m.dataset.down = 1; else delete m.dataset.down; });
  m.addEventListener('click', (e) => { if (e.target === m && m.dataset.down) m.remove(); });
  document.body.appendChild(m); return m;
}

// ---------------------------------------------------------------- fields
function fieldHtml(f, v) {
  const val = v ?? f.def ?? '';
  const id = 'f_' + f.k, a = `name="${f.k}" id="${id}" ${f.req ? 'required' : ''}`;
  let inp;
  switch (f.t) {
    case 'textarea': inp = `<textarea ${a} rows="${f.rows || 3}">${esc(val)}</textarea>`; break;
    case 'rich': inp = `<div class="rte" data-rte="${f.k}"><div class="tb"><button type="button" data-c="bold"><b>B</b></button><button type="button" data-c="italic"><i>I</i></button><button type="button" data-c="h2">H2</button><button type="button" data-c="h3">H3</button><button type="button" data-c="ul">• सूची</button><button type="button" data-c="ol">1. सूची</button><button type="button" data-c="quote">❝</button><button type="button" data-c="link">🔗</button><button type="button" data-c="img">🖼️ फ़ोटो</button><button type="button" data-c="clear">✕ फ़ॉर्मेट हटाएँ</button></div><div class="ed" contenteditable="true">${val}</div></div>`; break;
    case 'select': inp = `<select ${a}>${(typeof f.opts === 'function' ? f.opts() : f.opts).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`; break;
    case 'check': return `<label class="ck ${f.full ? 'full' : ''}"><input type="checkbox" ${a} ${+val ? 'checked' : ''}> ${f.label}</label>`;
    case 'image': case 'pdf': inp = `<div class="imgup" data-up="${f.k}" data-kind="${f.kind || (f.t === 'pdf' ? 'pdf' : 'image')}">${f.t === 'image' ? `<img src="${esc(val)}" ${val ? '' : 'hidden'}>` : `<span class="sm">${esc(val)}</span>`}<input type="hidden" name="${f.k}" value="${esc(val)}"><input type="file" accept="${f.t === 'pdf' ? 'application/pdf' : 'image/*'}"><button type="button" class="btn sm" data-clear>हटाएँ</button></div>`; break;
    case 'number': inp = `<input type="number" step="${f.step || 1}" ${a} value="${esc(val)}">`; break;
    case 'date': inp = `<input type="date" ${a} value="${esc(String(val).slice(0, 10))}">`; break;
    case 'password': inp = `<input type="password" ${a} autocomplete="new-password" placeholder="${f.ph || ''}">`; break;
    default: inp = `<input type="${f.t || 'text'}" ${a} value="${esc(val)}" ${f.max ? `maxlength="${f.max}"` : ''}>`;
  }
  return `<label class="${f.full ? 'full' : ''}">${f.label}${f.req ? ' *' : ''}${inp}${f.hint ? `<small class="mut">${f.hint}</small>` : ''}</label>`;
}
function wireForm(root) {
  $$('[data-up]', root).forEach((box) => {
    const file = $('input[type=file]', box), hid = $('input[type=hidden]', box), img = $('img', box);
    file.addEventListener('change', guard(async () => {
      if (!file.files[0]) return;
      const fd = new FormData(); fd.append('file', file.files[0]); fd.append('kind', box.dataset.kind);
      const j = await api('/upload', { method: 'POST', body: fd }); hid.value = j.url;
      if (img) { img.src = j.url; img.hidden = false; } else $('span', box).textContent = j.url; toast('अपलोड हो गया');
    }));
    $('[data-clear]', box).addEventListener('click', () => { hid.value = ''; if (img) img.hidden = true; else $('span', box).textContent = ''; });
  });
  $$('[data-rte]', root).forEach((box) => {
    const ed = $('.ed', box);
    $('.tb', box).addEventListener('click', guard(async (e) => {
      const b = e.target.closest('button'); if (!b) return; ed.focus();
      const c = b.dataset.c;
      if (c === 'bold' || c === 'italic') document.execCommand(c);
      else if (c === 'h2' || c === 'h3') document.execCommand('formatBlock', false, c);
      else if (c === 'ul') document.execCommand('insertUnorderedList'); else if (c === 'ol') document.execCommand('insertOrderedList');
      else if (c === 'quote') document.execCommand('formatBlock', false, 'blockquote');
      else if (c === 'clear') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); }
      else if (c === 'link') { const u = prompt('लिंक (https://...)'); if (u) document.execCommand('createLink', false, u); }
      else if (c === 'img') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = guard(async () => { const fd = new FormData(); fd.append('file', inp.files[0]); const j = await api('/upload', { method: 'POST', body: fd }); ed.focus(); document.execCommand('insertImage', false, j.url); });
        inp.click();
      }
    }));
    ed.addEventListener('paste', (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
  });
}
function readForm(root, fields) {
  const d = {};
  for (const f of fields) {
    if (f.t === 'rich') { d[f.k] = $(`[data-rte="${f.k}"] .ed`, root).innerHTML; continue; }
    const el = root.elements ? root.elements[f.k] : $(`[name="${f.k}"]`, root);
    if (!el) continue;
    d[f.k] = f.t === 'check' ? (el.checked ? 1 : 0) : el.value;
  }
  return d;
}

// ---------------------------------------------------------------- login
function renderLogin() {
  app.innerHTML = `<div class="login"><form id="lf"><img src="/img/logo.webp" alt=""><h1>एडमिन पैनल — भारतीय मुस्लिम मंच</h1>
  <div class="fg" style="grid-template-columns:1fr"><label>यूज़रनेम<input name="username" autocomplete="username" required autofocus></label><label>पासवर्ड<input type="password" name="password" autocomplete="current-password" required></label></div>
  <p class="err" id="le"></p><button class="btn pri" style="width:100%;padding:.7rem">लॉगिन</button></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { const j = await api('/login', { method: 'POST', body: { username: f.username.value, password: f.password.value } }); ME = j.user; boot(); }
    catch (er) { $('#le').textContent = er.message; }
  };
}

// ---------------------------------------------------------------- shell
const STATUS_HI = { pending: 'लंबित', active: 'सक्रिय', rejected: 'अस्वीकृत', suspended: 'निलंबित', expired: 'समाप्त', success: 'सफल', failed: 'असफल', created: 'अधूरा', published: 'प्रकाशित', draft: 'ड्राफ़्ट', new: 'नया', read: 'पढ़ा', done: 'पूर्ण' };
const pill = (s) => `<span class="pill ${esc(s)}">${esc(STATUS_HI[s] || s)}</span>`;
const MENU = [
  ['', null, [['dashboard', '📊 डैशबोर्ड', 'any']]],
  ['सदस्य एवं संगठन', null, [['members', '👥 सदस्य', 'members'], ['units', '🗺️ राज्य/ज़िला इकाइयाँ', 'content'], ['leaders', '🧑‍💼 नेतृत्व', 'content']]],
  ['धन एवं लेखा', null, [['donations', '💰 दान / भुगतान', 'finance'], ['finance', '📈 वित्त रिपोर्ट', 'finance'], ['expenses', '🧾 खर्च', 'finance'], ['campaigns', '🎯 अभियान', 'finance']]],
  ['वेबसाइट सामग्री', null, [['press', '📰 प्रेस विज्ञप्ति', 'content'], ['gallery', '📸 गैलरी', 'content'], ['events', '📅 कार्यक्रम', 'content'], ['notices', '📢 सूचना पट्टी', 'content'], ['pages', '📄 पेज', 'content'], ['messages', '✉️ संदेश', 'content']]],
  ['प्रशासन', null, [['users', '🔐 उपयोगकर्ता', 'super'], ['settings', '⚙️ सेटिंग्स', 'super'], ['audit', '🕵️ गतिविधि लॉग', 'super']]],
];
const GROUPS = { any: ['super', 'editor', 'accounts'], members: ['super', 'editor'], content: ['super', 'editor'], finance: ['super', 'accounts'], super: ['super'] };
async function boot() {
  try { if (!ME) { const j = await api('/me'); ME = j.user; ME.paymentMode = j.paymentMode; } LOOK = await api('/lookups'); } catch (e) { return renderLogin(); }
  app.innerHTML = `<div class="shell"><aside class="side"><div class="br"><img src="/img/logo.webp" alt=""><span>BMM एडमिन</span></div>
  ${MENU.map(([t, , items]) => { const vis = items.filter((i) => GROUPS[i[2]].includes(ME.role)); return vis.length ? `${t ? `<h6>${t}</h6>` : ''}${vis.map(([k, l]) => `<a href="#/${k}" data-k="${k}">${l}</a>`).join('')}` : ''; }).join('')}
  <h6>खाता</h6><a href="/" target="_blank">🌐 वेबसाइट देखें</a><a href="#" id="chpw">🔑 पासवर्ड बदलें</a><a href="#" id="lo">🚪 लॉगआउट (${esc(ME.username)})</a></aside><main class="main" id="main"></main></div>`;
  $('#lo').onclick = async (e) => { e.preventDefault(); await api('/logout', { method: 'POST' }).catch(() => {}); ME = null; renderLogin(); };
  $('#chpw').onclick = (e) => { e.preventDefault(); pwModal(); };
  route();
}
function pwModal() {
  const m = modal(`<h3>पासवर्ड बदलें</h3><form class="fg"><label class="full">पुराना पासवर्ड<input type="password" name="old" required></label><label class="full">नया पासवर्ड (कम से कम 8 अक्षर)<input type="password" name="next" required minlength="8"></label><p class="err full"></p><div class="full row"><button class="btn pri">बदलें</button></div></form>`);
  $('form', m).onsubmit = async (e) => { e.preventDefault(); try { await api('/password', { method: 'POST', body: { old: e.target.old.value, next: e.target.next.value } }); m.remove(); toast('पासवर्ड बदल गया'); } catch (er) { $('.err', m).textContent = er.message; } };
}
window.addEventListener('hashchange', () => ME && route());
const VIEWS = {};
async function route() {
  const k = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  const item = MENU.flatMap((m) => m[2]).find((i) => i[0] === k);
  if (!item || !GROUPS[item[2]].includes(ME.role)) { location.hash = '#/dashboard'; return; }
  $$('.side a[data-k]').forEach((a) => a.classList.toggle('on', a.dataset.k === k));
  const main = $('#main'); main.innerHTML = '<p class="mut">लोड हो रहा है…</p>';
  try { await VIEWS[k](main); } catch (e) { if (e.message !== 'login') main.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
const head = (t, right = '') => `<div class="top"><h2>${t}</h2><div class="row">${right}</div></div>`;

// ---------------------------------------------------------------- dashboard
VIEWS.dashboard = async (main) => {
  const d = await api('/dashboard'); const sys = ME.role === 'super' ? await api('/system') : null;
  const max = Math.max(1, ...d.series.map((x) => x.s));
  main.innerHTML = head('डैशबोर्ड') +
    (ME.paymentMode === 'mock' ? '<div class="warnbox">⚠️ भुगतान <b>TEST (mock)</b> मोड में है। असली भुगतान के लिए सर्वर पर <code>PAYMENT_MODE</code> और PhonePe/UPI सेटिंग्स डालें (README देखें)।</div>' : '') +
    (ME.paymentMode === 'manual' ? '<div class="warnbox">ℹ️ अभी <b>UPI मैनुअल</b> मोड चालू है — दाता UTR डालते हैं और आप "दान / भुगतान" में सत्यापित करते हैं। PhonePe API स्वीकृत होने पर <code>PHONEPE_*</code> सेटिंग्स डालें।</div>' : '') +
    `<div class="grid">
    <div class="card kpi"><span>कुल सदस्य</span><b>${d.members.total}</b><span>सक्रिय ${d.members.active}</span></div>
    <div class="card kpi ${d.members.pending ? 'warn' : ''}"><span>स्वीकृति हेतु लंबित सदस्य</span><b>${d.members.pending}</b><a href="#/members?status=pending">देखें →</a></div>
    <div class="card kpi"><span>आज का दान</span><b>${inr(d.donations.today.s / 100)}</b><span>${d.donations.today.n} भुगतान</span></div>
    <div class="card kpi"><span>वित्त वर्ष ${d.fy} का दान</span><b>${inr(d.donations.fy.s / 100)}</b><span>${d.donations.fy.n} भुगतान • खर्च ${inr(d.expenses.fy / 100)}</span></div>
    <div class="card kpi ${d.donations.toVerify ? 'warn' : ''}"><span>UTR सत्यापन लंबित</span><b>${d.donations.toVerify}</b><a href="#/donations?verify=1">देखें →</a></div>
    <div class="card kpi ${d.messages ? 'warn' : ''}"><span>नए संदेश</span><b>${d.messages}</b><a href="#/messages">देखें →</a></div></div>
    <div class="card"><b>पिछले 30 दिन का दान</b><div class="bars" style="margin-top:.8rem">${d.series.length ? d.series.map((x) => `<div title="${x.d}: ${inr(x.s / 100)}"><i class="i" style="height:${Math.max(2, (x.s / max) * 100)}%"></i></div>`).join('') : '<span class="mut">अभी कोई डेटा नहीं</span>'}</div></div>
    <div class="grid g2"><div class="card"><b>हाल के सदस्य आवेदन</b><table>${d.recentMembers.map((m) => `<tr><td>${m.photo ? `<img class="thumb r" src="${esc(m.photo)}">` : ''}</td><td>${esc(m.name)}<br><small class="mut">${esc(m.district || '')}, ${esc(m.state || '')}</small></td><td>${pill(m.status)}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</table></div>
    <div class="card"><b>हाल के दान</b><table>${d.recentDonations.map((m) => `<tr><td>${esc(m.name)}</td><td>${inr(m.amount / 100)}</td><td class="mut">${dt(m.paid_at)}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</table></div></div>`;
};

// ---------------------------------------------------------------- generic CRUD views
const STATE_OPTS = () => [['', '— चुनें —'], ...LOOK.states.map((s) => [s.code, s.hi])];
const CRUD = {
  press: { title: 'प्रेस विज्ञप्ति', cols: [['cover', 'फ़ोटो', (r) => r.cover ? `<img class="thumb" src="${esc(r.cover)}">` : ''], ['title', 'शीर्षक'], ['status', 'स्थिति', (r) => pill(r.status)], ['published_at', 'प्रकाशन', (r) => dt(r.published_at)], ['views', 'व्यू']], statuses: ['published', 'draft'],
    fields: [{ k: 'title', label: 'शीर्षक', req: 1, full: 1, max: 250 }, { k: 'summary', label: 'सारांश (कार्ड/शेयर में दिखेगा)', t: 'textarea', full: 1 }, { k: 'body', label: 'विज्ञप्ति का पूरा पाठ', t: 'rich', full: 1 }, { k: 'cover', label: 'कवर फ़ोटो', t: 'image' }, { k: 'attachment', label: 'PDF संलग्न करें', t: 'pdf' }, { k: 'status', label: 'स्थिति', t: 'select', opts: [['published', 'प्रकाशित'], ['draft', 'ड्राफ़्ट']] }, { k: 'published_at', label: 'प्रकाशन तिथि (खाली = अभी)', t: 'date' }], wide: 1 },
  events: { title: 'कार्यक्रम', cols: [['title', 'कार्यक्रम'], ['event_date', 'तिथि'], ['venue', 'स्थान'], ['status', 'स्थिति', (r) => pill(r.status)]],
    fields: [{ k: 'title', label: 'शीर्षक', req: 1, full: 1 }, { k: 'event_date', label: 'तिथि', t: 'date' }, { k: 'venue', label: 'स्थान' }, { k: 'description', label: 'विवरण', t: 'textarea', full: 1, rows: 4 }, { k: 'image', label: 'फ़ोटो', t: 'image' }, { k: 'status', label: 'स्थिति', t: 'select', opts: [['published', 'प्रकाशित'], ['draft', 'ड्राफ़्ट']] }] },
  leaders: { title: 'नेतृत्व', cols: [['photo', '', (r) => r.photo ? `<img class="thumb r" src="${esc(r.photo)}">` : ''], ['name', 'नाम'], ['title', 'पद'], ['grp', 'समूह', (r) => ({ patron: 'संरक्षक', convenor: 'राष्ट्रीय संयोजक', national: 'राष्ट्रीय पदाधिकारी', state: 'राज्य' }[r.grp])], ['sort', 'क्रम']],
    fields: [{ k: 'name', label: 'नाम (हिंदी)', req: 1 }, { k: 'name_en', label: 'Name (English)' }, { k: 'title', label: 'पद (हिंदी)' }, { k: 'title_en', label: 'Title (English)' }, { k: 'grp', label: 'समूह', t: 'select', opts: [['patron', 'संरक्षक'], ['convenor', 'राष्ट्रीय संयोजक'], ['national', 'राष्ट्रीय पदाधिकारी'], ['state', 'राज्य नेतृत्व']] }, { k: 'sort', label: 'क्रम (छोटा पहले)', t: 'number', def: 100 }, { k: 'photo', label: 'फ़ोटो (पोर्ट्रेट)', t: 'image', kind: 'portrait' }, { k: 'phone', label: 'फ़ोन' }, { k: 'bio', label: 'परिचय', t: 'textarea', full: 1, rows: 4 }, { k: 'facebook', label: 'Facebook लिंक' }, { k: 'x', label: 'X (Twitter) लिंक' }, { k: 'youtube', label: 'YouTube लिंक' }, { k: 'active', label: 'वेबसाइट पर दिखाएँ', t: 'check', def: 1 }] },
  units: { title: 'राज्य/ज़िला इकाइयाँ', cols: [['state', 'राज्य'], ['district', 'ज़िला'], ['head_name', 'अध्यक्ष/प्रभारी'], ['phone', 'फ़ोन'], ['active', 'दिखे', (r) => (+r.active ? '✓' : '—')]],
    fields: [{ k: 'state_code', label: 'राज्य', t: 'select', opts: STATE_OPTS, req: 1 }, { k: 'district', label: 'ज़िला (खाली = राज्य इकाई)' }, { k: 'head_name', label: 'अध्यक्ष / प्रभारी का नाम' }, { k: 'head_title', label: 'पद' }, { k: 'phone', label: 'फ़ोन' }, { k: 'email', label: 'Email' }, { k: 'address', label: 'पता', t: 'textarea', full: 1 }, { k: 'active', label: 'वेबसाइट पर दिखाएँ', t: 'check', def: 1 }] },
  notices: { title: 'सूचना पट्टी (टिकर)', cols: [['text', 'सूचना'], ['link', 'लिंक'], ['sort', 'क्रम'], ['active', 'चालू', (r) => (+r.active ? '✓' : '—')]],
    fields: [{ k: 'text', label: 'सूचना का पाठ', req: 1, full: 1, max: 300 }, { k: 'link', label: 'लिंक (वैकल्पिक, /press/1 या https://…)' }, { k: 'sort', label: 'क्रम', t: 'number', def: 100 }, { k: 'active', label: 'चालू', t: 'check', def: 1 }] },
  pages: { title: 'पेज (मंच परिचय, उद्देश्य, नीतियाँ)', noAdd: 1, noDel: 1, cols: [['slug', 'स्लग'], ['title', 'शीर्षक'], ['updated_at', 'अपडेट', (r) => dt(r.updated_at)]], fields: [{ k: 'title', label: 'शीर्षक', req: 1, full: 1 }, { k: 'body', label: 'सामग्री', t: 'rich', full: 1 }], wide: 1,
    hint: 'स्लग: about = मंच परिचय, constitution = उद्देश्य, privacy, terms, refund' },
  campaigns: { title: 'दान अभियान', cols: [['title', 'अभियान'], ['target', 'लक्ष्य (₹)', (r) => (r.target ? inr(r.target) : '—')], ['active', 'चालू', (r) => (+r.active ? '✓' : '—')]],
    fields: [{ k: 'title', label: 'शीर्षक', req: 1, full: 1 }, { k: 'description', label: 'विवरण', t: 'textarea', full: 1 }, { k: 'target', label: 'लक्ष्य राशि (₹)', t: 'number', def: 0 }, { k: 'active', label: 'चालू', t: 'check', def: 1 }] },
  expenses: { title: 'खर्च का हिसाब', cols: [['date', 'तारीख'], ['category', 'श्रेणी'], ['payee', 'भुगतान किसे'], ['amount', 'राशि', (r) => inr(r.amount)], ['note', 'विवरण']],
    fields: [{ k: 'date', label: 'तारीख', t: 'date', req: 1, def: new Date().toISOString().slice(0, 10) }, { k: 'amount', label: 'राशि (₹)', t: 'number', step: '0.01', req: 1 }, { k: 'category', label: 'श्रेणी (जैसे: प्रचार, कार्यक्रम, कार्यालय, यात्रा)' }, { k: 'payee', label: 'भुगतान किसे' }, { k: 'note', label: 'विवरण', t: 'textarea', full: 1 }, { k: 'voucher', label: 'बिल/वाउचर (PDF)', t: 'pdf' }] },
  messages: { title: 'संपर्क संदेश', noAdd: 1, cols: [['created_at', 'समय', (r) => dt(r.created_at)], ['name', 'नाम'], ['mobile', 'मोबाइल', (r) => `<a href="tel:${esc(r.mobile)}">${esc(r.mobile)}</a>`], ['subject', 'विषय'], ['message', 'संदेश', (r) => esc(String(r.message).slice(0, 120))], ['status', 'स्थिति', (r) => pill(r.status)]],
    fields: [{ k: 'status', label: 'स्थिति', t: 'select', opts: [['new', 'नया'], ['read', 'पढ़ा'], ['done', 'पूर्ण']] }], view: (r) => `<p><b>${esc(r.name)}</b> • ${esc(r.mobile)} • ${esc(r.email || '')}</p><p><b>${esc(r.subject || '')}</b></p><p style="white-space:pre-wrap">${esc(r.message)}</p>` },
  users: { title: 'उपयोगकर्ता', cols: [['username', 'यूज़रनेम'], ['name', 'नाम'], ['role', 'भूमिका', (r) => ({ super: 'सुपर एडमिन', editor: 'संपादक (सामग्री/सदस्य)', accounts: 'लेखा (दान/वित्त)' }[r.role])], ['active', 'चालू', (r) => (+r.active ? '✓' : '—')]],
    fields: [{ k: 'username', label: 'यूज़रनेम', req: 1 }, { k: 'name', label: 'नाम' }, { k: 'role', label: 'भूमिका', t: 'select', opts: [['editor', 'संपादक (सामग्री/सदस्य)'], ['accounts', 'लेखा (दान/वित्त)'], ['super', 'सुपर एडमिन']] }, { k: 'password', label: 'पासवर्ड (बदलने हेतु ही भरें)', t: 'password' }, { k: 'active', label: 'चालू', t: 'check', def: 1 }] },
};
function crudView(key) {
  const C = CRUD[key];
  return async (main) => {
    let q = '', st = '';
    const load = guard(async () => {
      const j = await api(`/r/${key}?${qs({ q, status: st, limit: 100 })}`);
      $('#tb', main).innerHTML = `<tr>${C.cols.map((c) => `<th>${c[1]}</th>`).join('')}<th></th></tr>` + j.rows.map((r) => `<tr>${C.cols.map((c) => `<td>${c[2] ? c[2](r) : esc(r[c[0]])}</td>`).join('')}<td style="white-space:nowrap"><button class="btn sm" data-e="${r.id}">${C.view ? 'खोलें' : 'संपादित'}</button>${C.noDel ? '' : ` <button class="btn sm bad" data-d="${r.id}">हटाएँ</button>`}</td></tr>`).join('') || `<tr><td colspan="9" class="mut">कुछ नहीं मिला</td></tr>`;
      main._rows = Object.fromEntries(j.rows.map((r) => [r.id, r]));
    });
    main.innerHTML = head(C.title, `<input id="q" placeholder="खोजें…">${C.statuses ? `<select id="st"><option value="">सभी</option>${C.statuses.map((s) => `<option value="${s}">${STATUS_HI[s]}</option>`).join('')}</select>` : ''}${C.noAdd ? '' : '<button class="btn pri" id="add">+ जोड़ें</button>'}`) + (C.hint ? `<p class="mut">${C.hint}</p>` : '') + '<div class="tw"><table id="tb"></table></div>';
    $('#q', main).oninput = (e) => { q = e.target.value; clearTimeout(main._t); main._t = setTimeout(load, 250); };
    if ($('#st', main)) $('#st', main).onchange = (e) => { st = e.target.value; load(); };
    const edit = (row) => {
      const isNew = !row;
      const m = modal(`<h3>${C.title} — ${isNew ? 'नया' : 'संपादित'}</h3>${C.view && row ? C.view(row) : ''}<form><div class="fg">${C.fields.map((f) => fieldHtml(f, row ? row[f.k] : undefined)).join('')}</div><p class="err"></p><div class="row"><button class="btn pri">सहेजें</button><button type="button" class="btn" data-x>बंद करें</button></div></form>`, { wide: C.wide });
      wireForm(m); $('[data-x]', m).onclick = () => m.remove();
      $('form', m).onsubmit = async (e) => { e.preventDefault(); try { const body = readForm(e.target, C.fields); await api(isNew ? `/r/${key}` : `/r/${key}/${row.id}`, { method: isNew ? 'POST' : 'PUT', body }); m.remove(); toast('सहेज लिया'); load(); } catch (er) { $('.err', m).textContent = er.message; } };
    };
    main.onclick = guard(async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'add') edit(null);
      else if (b.dataset.e) edit(main._rows[b.dataset.e]);
      else if (b.dataset.d && confirm('क्या आप सच में हटाना चाहते हैं?')) { await api(`/r/${key}/${b.dataset.d}`, { method: 'DELETE' }); toast('हटाया गया'); load(); }
    });
    load();
  };
}
['press', 'events', 'leaders', 'units', 'notices', 'pages', 'campaigns', 'expenses', 'messages', 'users'].forEach((k) => (VIEWS[k] = crudView(k)));

// ---------------------------------------------------------------- gallery
VIEWS.gallery = async (main) => {
  let tab = 'albums', album = null;
  const render = guard(async () => {
    if (tab === 'albums' && !album) {
      const j = await api('/r/albums?limit=200');
      main.innerHTML = head('गैलरी', `<button class="btn pri" id="newA">+ नया एल्बम</button>`) + tabs() + `<div class="tw"><table><tr><th></th><th>एल्बम</th><th>तारीख</th><th>फ़ोटो</th><th></th></tr>${j.rows.map((a) => `<tr><td>${a.cover ? `<img class="thumb" src="${esc(a.cover)}">` : ''}</td><td>${esc(a.title)}</td><td>${esc(a.event_date || '')}</td><td>${a.n}</td><td><button class="btn sm" data-open="${a.id}">फ़ोटो जोड़ें/देखें</button> <button class="btn sm" data-edit='${a.id}'>संपादित</button> <button class="btn sm bad" data-del="${a.id}">हटाएँ</button></td></tr>`).join('') || '<tr><td class="mut">कोई एल्बम नहीं — "नया एल्बम" बनाएँ</td></tr>'}</table></div>`;
      main._albums = Object.fromEntries(j.rows.map((a) => [a.id, a]));
    } else if (album) {
      const j = await api(`/r/media?album_id=${album.id}&limit=200`);
      main.innerHTML = head(`एल्बम: ${esc(album.title)}`, `<button class="btn" id="back">← वापस</button>`) + `<div class="card"><b>फ़ोटो अपलोड करें</b> <span class="mut sm">(एक साथ कई चुन सकते हैं)</span><div class="row" style="margin-top:.5rem"><input type="file" id="files" accept="image/*" multiple><button class="btn pri" id="up">अपलोड</button></div></div><div class="gal">${j.rows.map((m) => `<figure><img src="${esc(m.file.replace('.webp', '-t.webp'))}" title="${esc(m.caption || '')}"><button class="btn sm bad" data-delm="${m.id}">×</button></figure>`).join('') || '<p class="mut">इस एल्बम में अभी फ़ोटो नहीं</p>'}</div>`;
    } else if (tab === 'loose') {
      const j = await api('/r/media?type=photo&limit=200'); const loose = j.rows.filter((m) => !m.album_id);
      main.innerHTML = head('गैलरी') + tabs() + `<div class="card"><b>बिना एल्बम की फ़ोटो अपलोड</b><div class="row" style="margin-top:.5rem"><input type="file" id="files" accept="image/*" multiple><input id="cap" placeholder="कैप्शन (वैकल्पिक)"><button class="btn pri" id="up">अपलोड</button></div></div><div class="gal">${loose.map((m) => `<figure><img src="${esc(m.file.replace('.webp', '-t.webp'))}"><button class="btn sm bad" data-delm="${m.id}">×</button></figure>`).join('')}</div>`;
    } else {
      const j = await api('/r/media?type=video&limit=200');
      main.innerHTML = head('गैलरी') + tabs() + `<div class="card"><b>YouTube वीडियो जोड़ें</b><div class="row" style="margin-top:.5rem"><input id="vu" placeholder="YouTube लिंक" style="min-width:300px"><input id="vc" placeholder="शीर्षक" style="min-width:240px"><button class="btn pri" id="addv">जोड़ें</button></div></div><div class="tw"><table>${j.rows.map((v) => `<tr><td><img class="thumb" src="https://i.ytimg.com/vi/${esc(v.youtube_id)}/default.jpg"></td><td>${esc(v.caption)}</td><td><a href="https://youtu.be/${esc(v.youtube_id)}" target="_blank">खोलें</a></td><td><button class="btn sm bad" data-delm="${v.id}">हटाएँ</button></td></tr>`).join('') || '<tr><td class="mut">कोई वीडियो नहीं</td></tr>'}</table></div>`;
    }
  });
  const tabs = () => `<div class="tabs"><button data-tab="albums" class="${tab === 'albums' ? 'on' : ''}">📁 एल्बम</button><button data-tab="loose" class="${tab === 'loose' ? 'on' : ''}">🖼️ अन्य फ़ोटो</button><button data-tab="video" class="${tab === 'video' ? 'on' : ''}">🎬 वीडियो</button></div>`;
  main.onclick = guard(async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; album = null; render(); }
    else if (b.id === 'newA' || b.dataset.edit) {
      const a = b.dataset.edit ? main._albums[b.dataset.edit] : null;
      const F = [{ k: 'title', label: 'एल्बम का नाम', req: 1, full: 1 }, { k: 'event_date', label: 'तारीख', t: 'date' }, { k: 'sort', label: 'क्रम', t: 'number', def: 100 }, { k: 'description', label: 'विवरण', t: 'textarea', full: 1 }, { k: 'cover', label: 'कवर (खाली = पहली फ़ोटो)', t: 'image' }, { k: 'active', label: 'दिखाएँ', t: 'check', def: 1 }];
      const m = modal(`<h3>एल्बम</h3><form><div class="fg">${F.map((f) => fieldHtml(f, a ? a[f.k] : undefined)).join('')}</div><p class="err"></p><button class="btn pri">सहेजें</button></form>`); wireForm(m);
      $('form', m).onsubmit = async (ev) => { ev.preventDefault(); try { await api(a ? `/r/albums/${a.id}` : '/r/albums', { method: a ? 'PUT' : 'POST', body: readForm(ev.target, F) }); m.remove(); render(); } catch (er) { $('.err', m).textContent = er.message; } };
    }
    else if (b.dataset.open) { album = main._albums[b.dataset.open]; render(); }
    else if (b.id === 'back') { album = null; render(); }
    else if (b.dataset.del && confirm('एल्बम और उसकी सारी फ़ोटो हटाएँ?')) { await api(`/r/albums/${b.dataset.del}`, { method: 'DELETE' }); render(); }
    else if (b.dataset.delm && confirm('हटाएँ?')) { await api(`/r/media/${b.dataset.delm}`, { method: 'DELETE' }); render(); }
    else if (b.id === 'up') {
      const fl = $('#files').files; if (!fl.length) return toast('फ़ोटो चुनें', true);
      b.disabled = true; b.textContent = 'अपलोड हो रही है…';
      const fd = new FormData(); if (album) fd.append('album_id', album.id); if ($('#cap')) fd.append('caption', $('#cap').value); [...fl].forEach((f) => fd.append('files', f));
      try { const j = await api('/media/photos', { method: 'POST', body: fd }); toast(`${j.added} फ़ोटो जुड़ीं`); } finally { render(); }
    }
    else if (b.id === 'addv') { await api('/media/video', { method: 'POST', body: { url: $('#vu').value, caption: $('#vc').value } }); render(); }
  });
  render();
};

// ---------------------------------------------------------------- members
const MFIELDS = () => [
  { k: 'name', label: 'पूरा नाम', req: 1 }, { k: 'father_name', label: 'पिता/पति का नाम' }, { k: 'mobile', label: 'मोबाइल', req: 1 }, { k: 'email', label: 'Email' },
  { k: 'dob', label: 'जन्म तिथि', t: 'date' }, { k: 'gender', label: 'लिंग', t: 'select', opts: [['', '—'], ['M', 'पुरुष'], ['F', 'महिला'], ['O', 'अन्य']] },
  { k: 'state_code', label: 'राज्य', t: 'select', opts: STATE_OPTS }, { k: 'district', label: 'ज़िला' }, { k: 'city', label: 'शहर/गाँव' }, { k: 'pincode', label: 'पिन कोड' },
  { k: 'address', label: 'पता', t: 'textarea', full: 1, rows: 2 }, { k: 'occupation', label: 'पेशा' }, { k: 'qualification', label: 'शिक्षा' },
  { k: 'designation', label: 'पद (कार्ड पर छपेगा)', def: 'सदस्य', hint: 'जैसे: सदस्य, ज़िला अध्यक्ष, प्रदेश महासचिव' }, { k: 'valid_till', label: 'वैधता तक', t: 'date' },
  { k: 'photo', label: 'फ़ोटो', t: 'image', kind: 'member' }, { k: 'referral', label: 'रेफरेंस' }, { k: 'notes', label: 'आंतरिक नोट', t: 'textarea', full: 1, rows: 2 },
];
VIEWS.members = async (main) => {
  const pre = Object.fromEntries(new URLSearchParams((location.hash.split('?')[1] || '')));
  const F = { q: '', status: pre.status || '', state_code: '', district: '', expired: '', page: 1 }; let rows = {}, sel = new Set(), total = 0;
  main.innerHTML = head('सदस्य प्रबंधन', `<button class="btn pri" id="add">+ सदस्य जोड़ें</button><button class="btn" id="imp">⬆ CSV आयात</button><a class="btn" id="exp">⬇ CSV निर्यात</a><button class="btn" id="cards">🪪 कार्ड प्रिंट</button>`) +
    `<div class="card row"><input id="q" placeholder="नाम / मोबाइल / सदस्यता सं. / ज़िला" style="min-width:260px"><select id="fs"><option value="">सभी स्थिति</option>${['pending', 'active', 'rejected', 'suspended'].map((s) => `<option value="${s}" ${F.status === s ? 'selected' : ''}>${STATUS_HI[s]}</option>`).join('')}</select><select id="fst">${STATE_OPTS().map(([v, l]) => `<option value="${v}">${v ? l : 'सभी राज्य'}</option>`).join('')}</select><input id="fd" placeholder="ज़िला"><label class="row sm"><input type="checkbox" id="fe"> वैधता समाप्त</label>
    <span style="flex:1"></span><button class="btn ok sm" id="bulkA">चुने हुए स्वीकृत करें</button><button class="btn bad sm" id="bulkR">अस्वीकृत</button></div><div id="sum" class="mut sm"></div><div class="tw"><table id="tb"></table></div><div class="row" id="pg" style="margin-top:.6rem"></div>`;
  const load = guard(async () => {
    const j = await api('/members?' + qs({ ...F, limit: 25 })); rows = Object.fromEntries(j.rows.map((r) => [r.id, r])); total = j.total;
    $('#sum').textContent = `कुल ${j.total} • ` + j.byState.slice(0, 6).map((s) => `${s.state}: ${s.n}`).join(' • ');
    $('#tb').innerHTML = `<tr><th><input type="checkbox" id="all"></th><th></th><th>सदस्यता सं.</th><th>नाम</th><th>मोबाइल</th><th>क्षेत्र</th><th>पद</th><th>स्थिति</th><th></th></tr>` + j.rows.map((r) => `<tr><td><input type="checkbox" data-s="${r.id}" ${sel.has(r.id) ? 'checked' : ''}></td><td>${r.photo ? `<img class="thumb r" src="${esc(r.photo)}">` : ''}</td><td>${esc(r.member_no || '—')}${r.fee_paid ? ' 💳' : ''}</td><td>${esc(r.name)}<br><small class="mut">${esc(r.father_name || '')}</small></td><td>${esc(r.mobile)}</td><td>${esc(r.district || '')}<br><small class="mut">${esc(r.state || '')}</small></td><td>${esc(r.designation || '')}</td><td>${pill(r.status)}${r.status === 'active' && r.valid_till && r.valid_till < new Date().toISOString().slice(0, 10) ? ' <small class="bad" style="color:#c22">समाप्त</small>' : ''}</td><td style="white-space:nowrap">${r.status === 'pending' ? `<button class="btn ok sm" data-ap="${r.id}">स्वीकृत</button> ` : ''}<button class="btn sm" data-ed="${r.id}">खोलें</button></td></tr>`).join('') || '<tr><td colspan="9" class="mut">कोई सदस्य नहीं मिला</td></tr>';
    const pages = Math.ceil(j.total / 25);
    $('#pg').innerHTML = pages > 1 ? `<button class="btn sm" data-p="${F.page - 1}" ${F.page <= 1 ? 'disabled' : ''}>← पिछला</button><span>${F.page} / ${pages}</span><button class="btn sm" data-p="${F.page + 1}" ${F.page >= pages ? 'disabled' : ''}>अगला →</button>` : '';
    $('#exp').href = '/api/admin/members/export.csv?' + qs({ ...F, page: '' });
  });
  const bind = (id, k, ev = 'input') => $(id).addEventListener(ev, (e) => { F[k] = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value; F.page = 1; clearTimeout(main._t); main._t = setTimeout(load, 250); });
  bind('#q', 'q'); bind('#fs', 'status', 'change'); bind('#fst', 'state_code', 'change'); bind('#fd', 'district'); bind('#fe', 'expired', 'change');
  main.addEventListener('change', (e) => { if (e.target.id === 'all') { $$('[data-s]').forEach((c) => { c.checked = e.target.checked; e.target.checked ? sel.add(+c.dataset.s) : sel.delete(+c.dataset.s); }); } else if (e.target.dataset.s) e.target.checked ? sel.add(+e.target.dataset.s) : sel.delete(+e.target.dataset.s); });
  const bulk = (st) => guard(async () => { if (!sel.size) return toast('पहले सदस्य चुनें', true); if (!confirm(`${sel.size} सदस्य — ${STATUS_HI[st]} करें?`)) return; await api('/members/bulk-status', { method: 'POST', body: { ids: [...sel], status: st } }); sel.clear(); toast('हो गया'); load(); });
  $('#bulkA').onclick = bulk('active'); $('#bulkR').onclick = bulk('rejected');
  $('#cards').onclick = () => { if (sel.size) window.open('/api/admin/members/cards?ids=' + [...sel].join(','), '_blank'); else if (confirm('चुने हुए नहीं हैं — वर्तमान फ़िल्टर के सभी सक्रिय सदस्यों के कार्ड (अधिकतम 500) बनाएँ?')) window.open('/api/admin/members/cards?' + qs({ ...F, status: '', page: '' }), '_blank'); };
  $('#add').onclick = () => memberModal(null, load);
  $('#imp').onclick = () => importModal(load);
  main.onclick = guard(async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ap) { const j = await api(`/members/${b.dataset.ap}/status`, { method: 'POST', body: { status: 'active' } }); toast('स्वीकृत: ' + j.member_no); load(); }
    else if (b.dataset.ed) memberModal(rows[b.dataset.ed], load);
    else if (b.dataset.p) { F.page = +b.dataset.p; load(); }
  });
  load();
};
async function memberModal(m, done) {
  const isNew = !m; let extra = '';
  if (m) { const d = await api('/members/' + m.id); extra = `<div class="card sm"><b>${esc(m.member_no || 'सदस्यता संख्या स्वीकृति पर बनेगी')}</b> ${pill(m.status)} • जुड़ा: ${dt(m.joined_at)} • स्रोत: ${esc(m.source)}${d.cardUrl ? ` • <a href="${d.cardUrl}" target="_blank">🪪 कार्ड देखें</a>` : ''}${d.payments.length ? '<br>भुगतान: ' + d.payments.map((p) => `${inr(p.amount / 100)} (${STATUS_HI[p.status] || p.status})`).join(', ') : ''}</div>`; m = d.row; }
  const F = MFIELDS();
  const mo = modal(`<h3>${isNew ? 'नया सदस्य' : esc(m.name)}</h3>${extra}<form><div class="fg">${F.map((f) => fieldHtml(f, m ? m[f.k] : undefined)).join('')}${isNew ? '<label class="ck full"><input type="checkbox" name="approve" checked> तुरंत स्वीकृत करें और सदस्यता संख्या दें</label>' : ''}</div><p class="err"></p>
  <div class="row"><button class="btn pri">सहेजें</button>${!isNew ? `${m.status !== 'active' ? '<button type="button" class="btn ok" data-st="active">✓ स्वीकृत करें</button>' : ''}${m.status !== 'rejected' ? '<button type="button" class="btn bad" data-st="rejected">अस्वीकृत</button>' : ''}${m.status === 'active' ? '<button type="button" class="btn" data-st="suspended">निलंबित</button><button type="button" class="btn" data-renew>वैधता +1 वर्ष</button>' : ''}${ME.role === 'super' ? '<button type="button" class="btn bad" data-del>हटाएँ</button>' : ''}` : ''}<button type="button" class="btn" data-x>बंद करें</button></div></form>`, { wide: true });
  wireForm(mo); $('[data-x]', mo).onclick = () => mo.remove();
  $('form', mo).onsubmit = async (e) => { e.preventDefault(); try { const body = readForm(e.target, F); if (isNew) body.approve = e.target.approve.checked; await api(isNew ? '/members' : '/members/' + m.id, { method: isNew ? 'POST' : 'PUT', body }); mo.remove(); toast('सहेज लिया'); done(); } catch (er) { $('.err', mo).textContent = er.message; } };
  mo.addEventListener('click', guard(async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.st) { const j = await api(`/members/${m.id}/status`, { method: 'POST', body: { status: b.dataset.st } }); mo.remove(); toast(j.member_no ? 'स्वीकृत: ' + j.member_no : 'अपडेट हुआ'); done(); }
    else if (b.dataset.renew !== undefined && 'renew' in b.dataset) { const j = await api(`/members/${m.id}/renew`, { method: 'POST', body: { years: 1 } }); toast('नई वैधता: ' + j.valid_till); mo.remove(); done(); }
    else if ('del' in b.dataset && confirm('यह सदस्य स्थायी रूप से हटाया जाएगा। जारी रखें?')) { await api('/members/' + m.id, { method: 'DELETE' }); mo.remove(); done(); }
  }));
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false; text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); } return rows.filter((r) => r.some((x) => x.trim()));
}
function importModal(done) {
  const sample = 'name,father_name,mobile,email,state,district,city,pincode,address,designation\nमोहम्मद आसिफ़,अब्दुल रहीम,9876543210,,उत्तर प्रदेश,लखनऊ,लखनऊ,226001,,सदस्य\n';
  const m = modal(`<h3>सदस्य CSV आयात</h3><p class="sm mut">पहली पंक्ति में कॉलम नाम हों: <code>name, mobile</code> ज़रूरी; वैकल्पिक: father_name, email, state (नाम या कोड), district, city, pincode, address, occupation, qualification, designation, dob (YYYY-MM-DD), gender (M/F/O)। Excel से "CSV UTF-8" में सेव करें। मोबाइल डुप्लिकेट छोड़ दिए जाते हैं।</p>
  <p><a href="data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + sample)}" download="members-sample.csv">नमूना CSV डाउनलोड करें</a></p>
  <input type="file" accept=".csv,text/csv" id="cf"><label class="row sm" style="margin-top:.6rem"><input type="checkbox" id="ca"> आयात के बाद सभी को सीधे स्वीकृत करें</label><div id="pv" class="sm mut"></div><p class="err" id="ce"></p><div class="row"><button class="btn pri" id="go" disabled>आयात करें</button><button class="btn" data-x>बंद</button></div>`);
  let data = [];
  $('[data-x]', m).onclick = () => m.remove();
  $('#cf', m).onchange = async (e) => { const t = await e.target.files[0].text(); const r = parseCSV(t); const h = r[0].map((x) => x.trim().toLowerCase()); data = r.slice(1).map((c) => Object.fromEntries(h.map((k, i) => [k, (c[i] || '').trim()]))); $('#pv', m).textContent = `${data.length} पंक्तियाँ मिलीं।`; $('#go', m).disabled = !data.length; };
  $('#go', m).onclick = guard(async () => { const j = await api('/members/import', { method: 'POST', body: { rows: data, approve: $('#ca', m).checked } }); $('#ce', m).innerHTML = `<span style="color:#0a6b49">जोड़े: ${j.added} • छोड़े (डुप्लिकेट): ${j.skipped}</span>` + (j.errors.length ? '<br>' + j.errors.slice(0, 15).map(esc).join('<br>') : ''); done(); });
}

// ---------------------------------------------------------------- donations
VIEWS.donations = async (main) => {
  const pre = Object.fromEntries(new URLSearchParams((location.hash.split('?')[1] || '')));
  const F = { q: '', status: '', purpose: '', mode: '', from: '', to: '', verify: pre.verify || '', page: 1 }; let rows = {};
  main.innerHTML = head('दान / भुगतान', `<button class="btn pri" id="off">+ ऑफ़लाइन दान दर्ज करें</button><a class="btn" id="exp">⬇ CSV</a>`) +
    `<div class="card row"><input id="q" placeholder="नाम / मोबाइल / रसीद / UTR / PAN"><select id="fs"><option value="">सभी स्थिति</option>${['success', 'pending', 'failed', 'created'].map((s) => `<option value="${s}">${STATUS_HI[s]}</option>`).join('')}</select><select id="fp"><option value="">दान+सदस्यता</option><option value="donation">दान</option><option value="membership">सदस्यता शुल्क</option></select><select id="fm"><option value="">सभी माध्यम</option><option value="phonepe">PhonePe</option><option value="manual">UPI मैनुअल</option><option value="offline">ऑफ़लाइन</option><option value="mock">टेस्ट</option></select>तक<input type="date" id="ff"> से <input type="date" id="ft"><label class="row sm"><input type="checkbox" id="fv" ${F.verify ? 'checked' : ''}> केवल UTR सत्यापन लंबित</label></div><div id="sum" class="card sm"></div><div class="tw"><table id="tb"></table></div><div class="row" id="pg" style="margin-top:.6rem"></div>`;
  const load = guard(async () => {
    const j = await api('/donations?' + qs({ ...F, limit: 25 })); rows = Object.fromEntries(j.rows.map((r) => [r.id, r]));
    $('#sum').innerHTML = `फ़िल्टर में सफल कुल: <b>${inr(j.sum)}</b> • ${j.total} प्रविष्टियाँ`;
    $('#tb').innerHTML = '<tr><th>तारीख</th><th>दाता</th><th>राशि</th><th>उद्देश्य</th><th>माध्यम</th><th>स्थिति</th><th>रसीद / UTR</th><th></th></tr>' + j.rows.map((r) => `<tr><td>${dt(r.paid_at || r.created_at)}</td><td>${esc(r.name)}<br><small class="mut">${esc(r.mobile || '')} ${r.pan ? '• ' + esc(r.pan) : ''}</small></td><td><b>${inr(r.amount)}</b></td><td>${r.purpose === 'membership' ? 'सदस्यता' : 'दान'}${r.campaign ? '<br><small class="mut">' + esc(r.campaign) + '</small>' : ''}</td><td>${esc(r.mode)}</td><td>${pill(r.status)}</td><td>${esc(r.receipt_no || '')}<br><small class="mut">${esc(r.utr || '')}</small></td><td style="white-space:nowrap">${r.status === 'pending' && r.mode === 'manual' ? `<button class="btn ok sm" data-v="${r.id}">✓ सत्यापित</button> <button class="btn bad sm" data-f="${r.id}">✗</button>` : ''}${r.status === 'pending' && r.mode === 'phonepe' ? `<button class="btn sm" data-r="${r.id}">⟳ स्थिति जाँचें</button>` : ''}${r.receiptUrl ? ` <a class="btn sm" href="${r.receiptUrl}" target="_blank">रसीद</a>` : ''}</td></tr>`).join('') || '<tr><td class="mut" colspan="8">कोई प्रविष्टि नहीं</td></tr>';
    const pages = Math.ceil(j.total / 25);
    $('#pg').innerHTML = pages > 1 ? `<button class="btn sm" data-p="${F.page - 1}" ${F.page <= 1 ? 'disabled' : ''}>← पिछला</button><span>${F.page} / ${pages}</span><button class="btn sm" data-p="${F.page + 1}" ${F.page >= pages ? 'disabled' : ''}>अगला →</button>` : '';
    $('#exp').href = '/api/admin/donations/export.csv?' + qs({ ...F, page: '' });
  });
  const bind = (id, k, ev = 'input') => $(id).addEventListener(ev, (e) => { F[k] = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value; F.page = 1; clearTimeout(main._t); main._t = setTimeout(load, 250); });
  bind('#q', 'q'); bind('#fs', 'status', 'change'); bind('#fp', 'purpose', 'change'); bind('#fm', 'mode', 'change'); bind('#ff', 'from', 'change'); bind('#ft', 'to', 'change'); bind('#fv', 'verify', 'change');
  $('#off').onclick = () => {
    const FF = [{ k: 'name', label: 'दाता का नाम', req: 1 }, { k: 'mobile', label: 'मोबाइल' }, { k: 'amount', label: 'राशि (₹)', t: 'number', step: '0.01', req: 1 }, { k: 'date', label: 'प्राप्ति तिथि', t: 'date', def: new Date().toISOString().slice(0, 10) }, { k: 'method', label: 'माध्यम', t: 'select', opts: ['Bank transfer', 'Cheque', 'DD', 'NEFT/RTGS', 'UPI (QR)', 'अन्य'] }, { k: 'reference', label: 'संदर्भ संख्या / चेक नं. / UTR' }, { k: 'pan', label: 'PAN' }, { k: 'email', label: 'Email' }, { k: 'address', label: 'पता', t: 'textarea', full: 1, rows: 2 }, { k: 'campaign_id', label: 'अभियान', t: 'select', opts: [['', 'सामान्य कोष'], ...LOOK.campaigns.map((c) => [c.id, c.title])] }, { k: 'notes', label: 'नोट', t: 'textarea', full: 1, rows: 2 }];
    const m = modal(`<h3>ऑफ़लाइन / बैंक दान दर्ज करें</h3><p class="sm mut">नक़द दान के नियम (₹2,000 सीमा आदि) के लिए अपने सलाहकार से पुष्टि करें। रसीद संख्या स्वतः बनेगी।</p><form><div class="fg">${FF.map((f) => fieldHtml(f)).join('')}</div><p class="err"></p><button class="btn pri">दर्ज करें</button></form>`);
    $('form', m).onsubmit = async (e) => { e.preventDefault(); try { const j = await api('/donations/offline', { method: 'POST', body: readForm(e.target, FF) }); m.remove(); toast('रसीद: ' + j.receipt_no); load(); } catch (er) { $('.err', m).textContent = er.message; } };
  };
  main.onclick = guard(async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v) { const u = rows[b.dataset.v]; if (confirm(`${inr(u.amount)} — UTR ${u.utr || '—'} बैंक/ऐप में देखकर सत्यापित करें?`)) { await api(`/donations/${b.dataset.v}/verify`, { method: 'POST', body: {} }); toast('सत्यापित, रसीद बन गई'); load(); } }
    else if (b.dataset.f && confirm('असफल/अमान्य चिह्नित करें?')) { await api(`/donations/${b.dataset.f}/fail`, { method: 'POST', body: {} }); load(); }
    else if (b.dataset.r) { const j = await api(`/donations/${b.dataset.r}/refresh`, { method: 'POST', body: {} }); toast('स्थिति: ' + (STATUS_HI[j.status] || j.status)); load(); }
    else if (b.dataset.p) { F.page = +b.dataset.p; load(); }
  });
  load();
};

// ---------------------------------------------------------------- finance
VIEWS.finance = async (main) => {
  const fyNow = (() => { const d = new Date(Date.now() + 5.5 * 36e5), y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return y; })();
  let fy = `${fyNow}-${String((fyNow + 1) % 100).padStart(2, '0')}`;
  const render = guard(async () => {
    const s = await api('/finance/summary?fy=' + fy); const max = Math.max(1, ...s.months.flatMap((m) => [m.income, m.expense]));
    const tbl = (rows, t) => `<div class="card"><b>${t}</b><table>${rows.map((r) => `<tr><td>${esc(r.k)}</td><td>${r.n}</td><td style="text-align:right">${inr(r.v)}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</table></div>`;
    main.innerHTML = head('वित्त रिपोर्ट', `<select id="fy">${[0, 1, 2, 3].map((i) => { const y = fyNow - i, l = `${y}-${String((y + 1) % 100).padStart(2, '0')}`; return `<option ${l === fy ? 'selected' : ''}>${l}</option>`; }).join('')}</select><a class="btn" href="/api/admin/finance/report24a.csv?fy=${fy}">⬇ ₹20,000+ योगदान सूची (CSV)</a><a class="btn" href="/api/admin/donations/export.csv?from=${fy.slice(0, 4)}-04-01&to=${+fy.slice(0, 4) + 1}-03-31">⬇ सभी दान (CSV)</a>`) +
      `<div class="grid"><div class="card kpi"><span>आय (दान)</span><b style="color:#0e9f6e">${inr(s.income)}</b><span>${s.incomeCount} भुगतान</span></div><div class="card kpi"><span>खर्च</span><b style="color:#c27803">${inr(s.expense)}</b><span>${s.expenseCount} प्रविष्टि</span></div><div class="card kpi"><span>इस वर्ष शेष</span><b>${inr(s.net)}</b></div><div class="card kpi"><span>कुल उपलब्ध शेष (सभी वर्ष)</span><b>${inr(s.balance)}</b></div></div>
      <div class="card"><b>मासिक आय बनाम खर्च</b> <span class="mut sm">(हरा = आय, पीला = खर्च)</span><div class="bars" style="margin-top:.8rem;height:180px">${s.months.map((m) => `<div title="${m.m}: आय ${inr(m.income)} / खर्च ${inr(m.expense)}"><span style="display:flex;gap:2px;align-items:flex-end;height:100%;width:100%"><i class="i" style="height:${Math.max(1, m.income / max * 100)}%"></i><i class="e" style="height:${Math.max(1, m.expense / max * 100)}%"></i></span>${m.m.slice(5)}</div>`).join('')}</div></div>
      <div class="grid g2">${tbl(s.byCampaign, 'अभियान अनुसार दान')}${tbl(s.byMode.map((x) => ({ ...x, k: x.k })), 'माध्यम अनुसार')}${tbl(s.byCategory, 'श्रेणी अनुसार खर्च')}</div>
      <p class="mut sm">नोट: राजनीतिक दलों के लिए ₹20,000 से अधिक के योगदान की जानकारी चुनाव आयोग/आयकर नियमों के अनुसार देनी होती है। यह CSV केवल सहायक सूची है — फ़ाइलिंग से पहले अपने CA/सलाहकार से जाँच करवाएँ।</p>`;
    $('#fy').onchange = (e) => { fy = e.target.value; render(); };
  });
  render();
};

// ---------------------------------------------------------------- settings
const SET_GROUPS = [
  ['वेबसाइट', [['site_name', 'नाम (हिंदी)'], ['site_name_en', 'Name (English)'], ['tagline', 'टैगलाइन (हिंदी)'], ['tagline_en', 'Tagline (English)'], ['hero_title', 'होमपेज मुख्य शीर्षक (हिंदी)'], ['hero_title_en', 'Hero title (English)'], ['hero_sub', 'उप-शीर्षक (हिंदी)', 'textarea'], ['hero_sub_en', 'Sub-heading (English)', 'textarea']]],
  ['संपर्क एवं सोशल', [['office_address', 'कार्यालय पता', 'textarea'], ['phone', 'फ़ोन'], ['email', 'Email'], ['whatsapp', 'WhatsApp नंबर (91…)'], ['facebook', 'Facebook'], ['x', 'X (Twitter)'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['maps_embed', 'Google Maps embed URL']]],
  ['सदस्यता', [['membership_fee', 'सदस्यता शुल्क (₹, 0 = निःशुल्क)'], ['membership_valid_years', 'वैधता (वर्ष)'], ['auto_approve', 'स्वतः स्वीकृति (1 = हाँ, 0 = नहीं)']]],
  ['दान', [['donation_presets', 'त्वरित राशियाँ (कॉमा से)'], ['min_donation', 'न्यूनतम दान (₹)'], ['pan_required_above', 'PAN/पता अनिवार्य (₹ से ऊपर)'], ['receipt_footer', 'रसीद का फ़ुटर पाठ', 'textarea']]],
  ['होमपेज आँकड़े', [['stat_members_extra', 'सदस्य संख्या में जोड़ें (पुराने रिकॉर्ड हेतु)'], ['stat_states_extra', 'राज्यों की संख्या में जोड़ें']]],
];
VIEWS.settings = async (main) => {
  const [{ settings }, sys] = await Promise.all([api('/settings'), api('/system')]);
  main.innerHTML = head('सेटिंग्स') + `<div class="card"><b>भुगतान गेटवे स्थिति</b><table>
  <tr><td>मोड</td><td><b>${esc(sys.paymentMode)}</b> ${sys.paymentMode === 'phonepe' ? '' : '<span class="mut">(phonepe / manual / mock — सर्वर env <code>PAYMENT_MODE</code>)</span>'}</td></tr>
  <tr><td>PhonePe परिवेश</td><td>${esc(sys.phonepeEnv)} • क्रेडेंशियल ${sys.phonepeConfigured ? '✓ सेट' : '✗ सेट नहीं'}</td></tr>
  <tr><td>Webhook URL (PhonePe डैशबोर्ड में डालें)</td><td><code>${esc(sys.webhookUrl)}</code> • Auth ${sys.webhookConfigured ? '✓' : '✗'}</td></tr>
  <tr><td>UPI ID (मैनुअल मोड)</td><td>${esc(sys.upiId || '—')}</td></tr><tr><td>साइट URL</td><td>${esc(sys.siteUrl)}</td></tr></table><p class="mut sm">गोपनीय कुंजियाँ (client secret आदि) सुरक्षा के लिए केवल सर्वर के environment variables में रखी जाती हैं, यहाँ नहीं।</p></div>
  <form id="sf">${SET_GROUPS.map(([t, items]) => `<div class="card"><b>${t}</b><div class="fg" style="margin-top:.6rem">${items.map(([k, l, ty]) => fieldHtml({ k, label: l, t: ty === 'textarea' ? 'textarea' : 'text', full: ty === 'textarea' }, settings[k])).join('')}</div></div>`).join('')}<p class="err"></p><button class="btn pri">सेटिंग्स सहेजें</button></form>`;
  $('#sf').onsubmit = guard(async (e) => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.target)); await api('/settings', { method: 'PUT', body }); toast('सेटिंग्स सहेज ली गईं'); });
};
VIEWS.audit = async (main) => {
  const j = await api('/audit');
  main.innerHTML = head('गतिविधि लॉग') + `<div class="tw"><table><tr><th>समय (UTC)</th><th>उपयोगकर्ता</th><th>क्रिया</th><th>विवरण</th><th>IP</th></tr>${j.rows.map((r) => `<tr><td>${dt(r.at)}</td><td>${esc(r.user)}</td><td>${esc(r.action)}</td><td>${esc(r.detail)}</td><td>${esc(r.ip)}</td></tr>`).join('')}</table></div>`;
};

boot();
})();
