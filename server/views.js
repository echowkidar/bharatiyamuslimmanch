const { db, settings } = require('./db');
const cfg = require('./config');
const U = require('./util');
const { esc, fmtDate, STATES } = U;

// ---------------------------------------------------------------- context
function ctxOf(req) {
  const lang = req.cookies && req.cookies.lang === 'en' ? 'en' : 'hi';
  const s = settings();
  const L = (hi, en) => (lang === 'en' && en ? en : hi);
  return { lang, L, s, req, path: req.path, nonce: req.res.locals.nonce };
}
const stName = (c, st) => (c.lang === 'en' ? st.en : st.hi);
const money = (paise) => U.inr(paise);
const nl2br = (t) => esc(t).replace(/\n/g, '<br>');
const splitWords = (t) => String(t).split(/\s+/).filter(Boolean).map((w) => `<span class="w"><span>${esc(w)}</span></span>`).join(' ');
const initials = (n) => esc(String(n || '?').replace(/^(डॉ\.?|Dr\.?|श्री|जनाब|मोहम्मद|Mohammad|Mohd)\s*/i, '').trim().charAt(0) || '?');

const ICON = {
  facebook: '<svg viewBox="0 0 24 24"><path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.9.4-1.7 1.8-1.7h1.6V3.8S15.6 3.5 14.3 3.5c-2.6 0-4.3 1.600-4.3 4.500v2.500H7.200v3.300H10V22h3.500z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M17.800 3h3l-6.600 7.500L22 21h-6.100l-4.800-6.200L5.600 21h-3l7.100-8.100L2.300 3h6.200l4.300 5.700L17.800 3zm-1 16.200h1.700L7.500 4.700H5.700l11.100 14.500z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24"><path d="M22 8.200c-.2-1-.9-1.700-1.900-1.900C18.400 6 12 6 12 6s-6.400 0-8.100.3C2.900 6.500 2.200 7.200 2 8.200 1.700 9.900 1.700 12 1.700 12s0 2.100.3 3.800c.2 1 .9 1.700 1.900 1.900C5.600 18 12 18 12 18s6.400 0 8.100-.3c1-.2 1.700-.9 1.900-1.900.3-1.700.3-3.800.3-3.800s0-2.100-.3-3.800zM10 15V9l5.200 3-5.200 3z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24"><path d="M7.800 2h8.400A5.800 5.800 0 0 1 22 7.800v8.400a5.800 5.800 0 0 1-5.800 5.800H7.800A5.800 5.800 0 0 1 2 16.200V7.800A5.800 5.800 0 0 1 7.800 2zm-.2 2A3.600 3.600 0 0 0 4 7.600v8.800A3.600 3.600 0 0 0 7.600 20h8.800a3.600 3.600 0 0 0 3.600-3.600V7.600A3.600 3.600 0 0 0 16.400 4H7.600zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5.300-3.200a1.200 1.200 0 1 1 0 2.400 1.200 1.200 0 0 1 0-2.400z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.600 15.100L2 22l5-1.300A10 10 0 1 0 12 2zm0 1.800a8.200 8.200 0 1 1-4.300 15.200l-.3-.2-3 .8.8-2.900-.2-.3A8.200 8.200 0 0 1 12 3.800zm-3 3.700c-.2 0-.5.100-.7.400-.3.300-1 1-1 2.500s1.100 2.900 1.200 3.100c.2.200 2.100 3.300 5.200 4.500 2.500 1 3 .8 3.500.7.600-.1 1.800-.7 2-1.400.3-.7.3-1.300.2-1.400-.1-.1-.3-.2-.7-.4l-1.900-.9c-.3-.1-.5-.1-.7.100l-.9 1.100c-.2.200-.3.200-.6.100-.3-.2-1.200-.4-2.300-1.400-.8-.8-1.400-1.700-1.600-2-.2-.3 0-.4.100-.6l.5-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.100c-.2-.5-.5-.5-.7-.5H9z"/></svg>',
};
const social = (s) =>
  [['facebook', s.facebook], ['x', s.x], ['youtube', s.youtube], ['instagram', s.instagram], ['whatsapp', s.whatsapp ? 'https://wa.me/' + String(s.whatsapp).replace(/\D/g, '') : '']]
    .filter(([, u]) => u).map(([k, u]) => `<a class="soc" href="${esc(u)}" target="_blank" rel="noopener" aria-label="${k}">${ICON[k]}</a>`).join('');

// ----------------------------------------------------------------- layout
function layout(c, { title, desc, body, active = '', home = false, og, noindex = false, extraHead = '', scripts = '' }) {
  const { L, s, lang } = c;
  const siteName = L(s.site_name, s.site_name_en);
  const fullTitle = title ? `${title} | ${siteName}` : `${siteName} | ${L(s.tagline, s.tagline_en)}`;
  const description = desc || L(s.hero_sub, s.hero_sub_en);
  const notices = db.prepare('SELECT text,link FROM notices WHERE active=1 ORDER BY sort,id DESC LIMIT 12').all();
  const ticker = (notices.length ? notices : [{ text: L('भारतीय मुस्लिम मंच की आधिकारिक वेबसाइट पर आपका स्वागत है — सदस्य बनें, संविधान और भाईचारे की आवाज़ बनें।', 'Welcome to the official website of Bharatiya Muslim Manch — become a member, be a voice for the Constitution and brotherhood.') }])
    .map((n) => (n.link ? `<a href="${esc(n.link)}">${esc(n.text)}</a>` : `<span>${esc(n.text)}</span>`)).join('<i>✦</i>');
  const nav = [
    ['home', '/', L('होम', 'Home')], ['about', '/about', L('मंच परिचय', 'About')], ['leaders', '/leaders', L('नेतृत्व', 'Leadership')],
    ['press', '/press', L('प्रेस विज्ञप्ति', 'Press')], ['gallery', '/gallery', L('गैलरी', 'Gallery')], ['events', '/events', L('कार्यक्रम', 'Events')],
    ['units', '/units', L('राज्य इकाइयाँ', 'State Units')], ['contact', '/contact', L('संपर्क', 'Contact')],
  ];
  const otherLang = lang === 'hi' ? 'en' : 'hi';
  const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: s.site_name_en, alternateName: s.site_name, url: cfg.SITE_URL, logo: cfg.SITE_URL + '/img/apple-touch-icon.png', sameAs: [s.facebook, s.youtube, s.x, s.instagram].filter(Boolean) };
  return `<!doctype html>
<html lang="${lang}" data-lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(U.plain(description, 180))}">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<meta name="theme-color" content="#050b1f">
<link rel="canonical" href="${esc(cfg.SITE_URL + c.req.path)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(U.plain(description, 180))}">
<meta property="og:image" content="${esc(cfg.SITE_URL + (og || '/img/og.jpg'))}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/img/favicon.png"><link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preload" href="/fonts/noto-sans-devanagari-devanagari-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css?v=${cfg.VERSION}">
${extraHead}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body class="${home ? 'is-home' : 'inner'}">
<div class="preloader" aria-hidden="true"><img src="/img/logo.webp" alt=""><i></i></div>
<div class="tri-bar"><i></i><i></i><i></i></div>
<div class="ticker" role="marquee" aria-label="${L('सूचनाएँ', 'Notices')}"><b>${L('ताज़ा', 'LATEST')}</b><div class="ticker-track"><div class="ticker-in">${ticker}<i>✦</i>${ticker}</div></div></div>
<header class="nav" id="nav">
  <a class="brand" href="/"><img src="/img/logo.webp" alt="" width="52" height="52"><span><b>${esc(siteName)}</b><small>${esc(lang === 'hi' ? s.site_name_en : s.site_name)}</small></span></a>
  <nav class="links" id="links" aria-label="Main">
    ${nav.map(([k, h, t]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${t}</a>`).join('')}
    <div class="nav-cta-m"><a class="btn btn-ghost" href="/join">${L('सदस्य बनें', 'Join')}</a><a class="btn btn-gold" href="/donate">${L('दान करें', 'Donate')}</a></div>
  </nav>
  <div class="nav-right">
    <a class="lang" href="/lang/${otherLang}?next=${encodeURIComponent(c.req.originalUrl)}" title="Language">${lang === 'hi' ? 'EN' : 'हिं'}</a>
    <a class="btn btn-ghost hide-m" href="/join">${L('सदस्य बनें', 'Join')}</a>
    <a class="btn btn-gold hide-m" href="/donate">${L('दान करें', 'Donate')}</a>
    <button class="burger" id="burger" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button>
  </div>
</header>
<main id="main">${body}</main>
${joinPopup(c)}
<footer class="foot">
  <div class="foot-glow"></div>
  <div class="wrap foot-grid">
    <div>
      <a class="brand" href="/"><img src="/img/logo.webp" alt="" width="56" height="56"><span><b>${esc(siteName)}</b><small>${esc(lang === 'hi' ? s.site_name_en : s.site_name)}</small></span></a>
      <p class="muted">${esc(L(s.tagline, s.tagline_en))}</p>
      <div class="socs">${social(s)}</div>
    </div>
    <div><h4>${L('मंच', 'The Manch')}</h4>
      <a href="/about">${L('मंच परिचय', 'About us')}</a><a href="/leaders">${L('नेतृत्व', 'Leadership')}</a><a href="/units">${L('राज्य इकाइयाँ', 'State units')}</a><a href="/p/constitution">${L('उद्देश्य एवं संविधान', 'Aims & Constitution')}</a></div>
    <div><h4>${L('मीडिया', 'Media')}</h4>
      <a href="/press">${L('प्रेस विज्ञप्ति', 'Press releases')}</a><a href="/gallery">${L('फ़ोटो गैलरी', 'Photo gallery')}</a><a href="/gallery?tab=video">${L('वीडियो', 'Videos')}</a><a href="/events">${L('कार्यक्रम', 'Events')}</a></div>
    <div><h4>${L('जुड़ें', 'Get involved')}</h4>
      <a href="/join">${L('सदस्यता फॉर्म', 'Become a member')}</a><a href="/card">${L('अपना सदस्यता कार्ड पाएँ', 'Get your member card')}</a><a href="/donate">${L('दान / सहयोग', 'Donate')}</a><a href="/contact">${L('संपर्क करें', 'Contact us')}</a></div>
    <div><h4>${L('संपर्क', 'Contact')}</h4>
      <p class="muted">${nl2br(s.office_address)}</p>
      ${s.phone ? `<a href="tel:${esc(s.phone)}">📞 ${esc(s.phone)}</a>` : ''}
      ${s.email ? `<a href="mailto:${esc(s.email)}">✉️ ${esc(s.email)}</a>` : ''}</div>
  </div>
  <div class="wrap foot-bot"><span>© ${new Date().getFullYear()} ${esc(siteName)}. ${L('सर्वाधिकार सुरक्षित।', 'All rights reserved.')}</span>
    <span><a href="/p/privacy">${L('गोपनीयता नीति', 'Privacy')}</a> · <a href="/p/terms">${L('नियम व शर्तें', 'Terms')}</a> · <a href="/p/refund">${L('रिफंड नीति', 'Refunds')}</a></span></div>
</footer>
<script src="/vendor/gsap.min.js" defer></script><script src="/vendor/ScrollTrigger.min.js" defer></script>
<script src="/js/site.js?v=${cfg.VERSION}" defer></script>
${home ? '<script src="/js/hero3d.js" type="module" defer></script>' : ''}
${scripts}
</body></html>`;
}


const NO_POPUP = /^\/(join|donate|pay|card|verify|receipt)/;
function joinPopup(c) {
  if (NO_POPUP.test(c.req.path)) return '';
  const { L } = c;
  const fee = parseInt(c.s.membership_fee) || 0;
  return `<div class="jm" id="joinModal" role="dialog" aria-modal="true" aria-labelledby="jmT" hidden>
  <div class="jm-box">
    <button class="jm-x" type="button" data-jm-close aria-label="${L('बंद करें', 'Close')}">×</button>
    <aside class="jm-side"><img src="/img/logo.webp" alt="" width="84" height="84"><h3>${L('भारतीय मुस्लिम मंच', 'Bharatiya Muslim Manch')}</h3><p>${L(c.s.tagline, c.s.tagline_en)}</p>
      <ul class="ticks"><li>${L('डिजिटल सदस्यता कार्ड (QR सहित)', 'Digital member card with QR')}</li><li>${L('अपने राज्य/ज़िले की इकाई से जुड़ाव', 'Connect with your local unit')}</li><li>${L('मंच के कार्यक्रमों की जानकारी', 'Updates on Manch programmes')}</li></ul></aside>
    <div class="jm-main">
      <span class="kicker">${L('सदस्यता', 'Membership')}</span><h2 id="jmT">${L('मंच के सदस्य बनें', 'Become a member')}</h2>
      <p class="muted sm">${L('सिर्फ़ एक मिनट — नीचे की जानकारी भरें।', 'Takes one minute — fill in the details below.')}${fee ? ' ' + L('शुल्क', 'Fee') + ' ₹' + fee : ''}</p>
      <form id="jmForm" data-mjoin action="/api/join" method="post" enctype="multipart/form-data" novalidate>
        <div class="fgrid">
          ${field(L('पूरा नाम', 'Full name'), '<input name="name" required maxlength="80" autocomplete="name">', { req: 1 })}
          ${field(L('मोबाइल नंबर', 'Mobile number'), '<input name="mobile" required inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" autocomplete="tel-national">', { req: 1 })}
          ${field(L('राज्य', 'State'), `<select name="state_code" required>${stateOptions(c)}</select>`, { req: 1 })}
          ${field(L('ज़िला', 'District'), '<input name="district" required maxlength="60">', { req: 1 })}
          ${field(L('फ़ोटो (वैकल्पिक)', 'Photo (optional)'), '<input name="photo" type="file" accept="image/jpeg,image/png,image/webp">', { cls: 'full' })}
        </div>
        <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="check"><input type="checkbox" name="consent" value="1" required> <span>${L('मैं भारत का नागरिक हूँ, मंच के उद्देश्यों से सहमत हूँ और मेरी जानकारी सही है।', 'I am a citizen of India, I agree with the aims of the Manch and my details are correct.')}</span></label>
        <div class="form-err" role="alert"></div>
        <div class="jm-actions"><button class="btn btn-gold btn-lg" type="submit">${L('सदस्य बनें', 'Join now')} →</button><button class="btn btn-ghost" type="button" data-jm-close>${L('अभी नहीं — वेबसाइट देखें', 'Not now — explore the site')}</button></div>
        <p class="tiny muted"><a href="/join">${L('पूरा सदस्यता फॉर्म (पता, शिक्षा आदि)', 'Full membership form')}</a> • <a href="/p/privacy">${L('गोपनीयता', 'Privacy')}</a></p>
      </form>
      <div class="jm-done" hidden><p class="big-ok">✓</p><h3>${L('धन्यवाद! आपका आवेदन मिल गया', 'Thank you! Application received')}</h3><p class="muted">${L('स्वीकृति के बाद आप "कार्ड पाएँ" पेज से अपना सदस्यता कार्ड डाउनलोड कर सकेंगे।', 'After approval you can download your card from the "Get card" page.')}</p><button class="btn btn-gold" type="button" data-jm-close>${L('वेबसाइट देखें', 'Explore the site')}</button></div>
    </div>
  </div></div>`;
}

// --------------------------------------------------------------- fragments
const head = (c, kicker, title, sub) => `<section class="page-hero"><div class="wrap">${kicker ? `<span class="kicker">${kicker}</span>` : ''}<h1 class="split">${splitWords(title)}</h1>${sub ? `<p class="lead">${esc(sub)}</p>` : ''}</div></section>`;
const empty = (msg) => `<div class="empty"><img src="/img/logo.webp" alt="" width="64" height="64"><p>${esc(msg)}</p></div>`;

function leaderCard(c, l, big = false) {
  const name = c.L(l.name, l.name_en || l.name), title = c.L(l.title, l.title_en || l.title);
  return `<article class="leader tilt ${big ? 'big' : ''} reveal">
    <div class="leader-ph">${l.photo ? `<img src="${esc(l.photo)}" alt="${esc(name)}" loading="lazy">` : `<span>${initials(name)}</span>`}<i class="ring"></i></div>
    <div class="leader-tx"><h3>${esc(name)}</h3><p class="role">${esc(title || '')}</p>
    ${big && l.bio ? `<p class="bio">${esc(l.bio)}</p>` : ''}
    <div class="socs sm">${social({ facebook: l.facebook, x: l.x, youtube: l.youtube })}</div></div></article>`;
}

function pressCard(c, p) {
  return `<a class="card press-card tilt reveal" href="/press/${p.id}">
    <div class="thumb">${p.cover ? `<img src="${esc(U.thumbOf(p.cover))}" alt="" loading="lazy">` : `<div class="ph"><img src="/img/logo.webp" alt=""></div>`}</div>
    <div class="card-b"><time>${fmtDate(p.published_at, c.lang)}</time><h3>${esc(p.title)}</h3><p>${esc(p.summary || U.plain(p.body, 140))}</p><span class="more">${c.L('पूरा पढ़ें', 'Read more')} →</span></div></a>`;
}
function eventCard(c, e) {
  const d = e.event_date ? new Date(e.event_date + 'T00:00:00') : null;
  const mon = d ? d.toLocaleDateString(c.lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short' }) : '';
  return `<article class="card event-card tilt reveal"><div class="date"><b>${d ? d.getDate() : '—'}</b><span>${mon}</span><small>${d ? d.getFullYear() : ''}</small></div>
    <div class="card-b"><h3>${esc(e.title)}</h3>${e.venue ? `<p class="venue">📍 ${esc(e.venue)}</p>` : ''}<p>${esc(U.plain(e.description, 160))}</p></div></article>`;
}

// -------------------------------------------------------------------- HOME
function home(c) {
  const { L, s } = c;
  const patron = db.prepare(`SELECT * FROM leaders WHERE active=1 AND grp='patron' ORDER BY sort,id LIMIT 1`).get();
  const convenor = db.prepare(`SELECT * FROM leaders WHERE active=1 AND grp='convenor' ORDER BY sort,id LIMIT 1`).get();
  const others = db.prepare(`SELECT * FROM leaders WHERE active=1 AND grp='national' ORDER BY sort,id LIMIT 4`).all();
  const press = db.prepare(`SELECT * FROM press WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT 3`).all();
  const events = db.prepare(`SELECT * FROM events WHERE status='published' ORDER BY event_date DESC LIMIT 3`).all();
  const photos = db.prepare(`SELECT m.* FROM media m LEFT JOIN albums a ON a.id=m.album_id WHERE m.type='photo' AND (a.id IS NULL OR a.active=1) ORDER BY m.id DESC LIMIT 8`).all();
  const videos = db.prepare(`SELECT * FROM media WHERE type='video' ORDER BY id DESC LIMIT 3`).all();
  const nMembers = db.prepare(`SELECT COUNT(*) n FROM members WHERE status='active'`).get().n + (parseInt(s.stat_members_extra) || 0);
  const nStates = Math.max(db.prepare(`SELECT COUNT(DISTINCT state_code) n FROM units WHERE active=1`).get().n, 0) + (parseInt(s.stat_states_extra) || 0);
  const nPress = db.prepare(`SELECT COUNT(*) n FROM press WHERE status='published'`).get().n;
  const nEvents = db.prepare(`SELECT COUNT(*) n FROM events WHERE status='published'`).get().n;
  const presets = String(s.donation_presets).split(',').map((x) => parseInt(x)).filter(Boolean);

  const pillars = [
    ['⚖️', L('संविधान और अधिकार', 'Constitution & Rights'), L('संविधान में दिए गए बराबरी, इज़्ज़त और इंसाफ़ के हक़ की हिफ़ाज़त और जागरूकता।', 'Protecting and spreading awareness of the rights of equality, dignity and justice given by the Constitution.')],
    ['🎓', L('शिक्षा और रोज़गार', 'Education & Livelihood'), L('तालीम, छात्रवृत्ति, कौशल और रोज़गार के मौक़ों तक हर नौजवान की पहुँच।', 'Access to education, scholarships, skills and job opportunities for every young person.')],
    ['🤝', L('भाईचारा और अमन', 'Brotherhood & Peace'), L('सर्वसमाज के साथ संवाद, गंगा-जमुनी तहज़ीब और सौहार्द को मज़बूत करना।', 'Dialogue with all communities, strengthening harmony and our shared culture.')],
    ['🕌', L('वक़्फ़ और विधिक सहायता', 'Waqf & Legal Aid'), L('वक़्फ़ संपत्तियों की सुरक्षा और ज़रूरतमंदों के लिए विधिक मदद।', 'Protecting waqf properties and providing legal help to those in need.')],
  ];

  const body = `
<section class="hero" id="top">
  <div class="hero-orb o1"></div><div class="hero-orb o2"></div>
  <div class="hero-fade"></div>
  <img class="hero-img" src="/img/hero.webp" alt="${esc(L('भारतीय मुस्लिम मंच का नेतृत्व', 'Leadership of Bharatiya Muslim Manch'))}" width="1500" height="1000" fetchpriority="high">
  <div class="wrap hero-in">
    <span class="kicker pulse">${L('भारतीय मुस्लिम मंच • आधिकारिक वेबसाइट', 'Bharatiya Muslim Manch • Official website')}</span>
    <h1 class="hero-h split">${splitWords(L(s.hero_title, s.hero_title_en))}</h1>
    <p class="lead hero-p">${esc(L(s.hero_sub, s.hero_sub_en))}</p>
    <div class="values">${[L('संविधान', 'Constitution'), L('भाईचारा', 'Brotherhood'), L('इंसाफ़', 'Justice'), L('तालीम', 'Education')].map((v) => `<span>${v}</span>`).join('')}</div>
    <div class="hero-cta"><a class="btn btn-gold btn-lg magnetic" href="/join">${L('सदस्य बनें', 'Become a member')} <i>→</i></a><a class="btn btn-ghost btn-lg magnetic" href="/donate">${L('दान करें', 'Donate')}</a></div>
    <div class="hero-people">
      ${patron ? `<div class="hp"><small>${L('संरक्षक', 'Patron')}</small><b>${esc(L(patron.name, patron.name_en || patron.name))}</b></div>` : ''}
      ${convenor ? `<div class="hp"><small>${L('राष्ट्रीय संयोजक', 'National Convenor')}</small><b>${esc(L(convenor.name, convenor.name_en || convenor.name))}</b></div>` : ''}
    </div>
  </div>
  <a class="scroll-cue" href="#leaders" aria-label="scroll"><i></i></a>
</section>

<section class="sec" id="leaders"><div class="wrap">
  <div class="sec-h reveal"><span class="kicker">${L('हमारा नेतृत्व', 'Our leadership')}</span><h2>${L('मार्गदर्शन और नेतृत्व', 'Guidance & leadership')}</h2></div>
  <div class="leaders-top">
    ${patron ? leaderCard(c, patron, true) : ''}
    ${convenor ? leaderCard(c, convenor, true) : ''}
  </div>
  ${others.length ? `<div class="leaders-grid">${others.map((l) => leaderCard(c, l)).join('')}</div>` : ''}
  <p class="center reveal"><a class="btn btn-ghost" href="/leaders">${L('पूरा नेतृत्व देखें', 'View all leaders')} →</a></p>
</div></section>

<section class="sec sec-alt"><div class="wrap">
  <div class="sec-h reveal"><span class="kicker">${L('हमारे संकल्प', 'Our pillars')}</span><h2>${L('मंच किन मुद्दों पर काम करता है', 'What the Manch works for')}</h2></div>
  <div class="pillars">${pillars.map(([i, t, d]) => `<div class="pillar tilt reveal"><span class="pi">${i}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
</div></section>

<section class="globe-sec"><div class="wrap globe-grid">
  <div class="globe-tx reveal"><span class="kicker">${L('देश भर में', 'Across India')}</span><h2>${L('देश भर में फैलता हमारा संगठन', 'Our organisation, growing across India')}</h2>
    <p class="lead">${L('हर राज्य और ज़िले में मंच की इकाइयाँ बन रही हैं। अपने क्षेत्र की इकाई से जुड़ें और संविधान, तालीम व भाईचारे की इस मुहिम का हिस्सा बनें।', 'Units of the Manch are being formed in every state and district. Join your local unit and be part of this movement for the Constitution, education and harmony.')}</p>
    <div class="stats-grid">
      <div class="stat"><b data-count="${nMembers}">${nMembers}</b><span>${L('सक्रिय सदस्य', 'Active members')}</span></div>
      <div class="stat"><b data-count="${nStates}">${nStates}</b><span>${L('राज्य इकाइयाँ', 'State units')}</span></div>
      <div class="stat"><b data-count="${nPress}">${nPress}</b><span>${L('प्रेस विज्ञप्तियाँ', 'Press releases')}</span></div>
      <div class="stat"><b data-count="${nEvents}">${nEvents}</b><span>${L('कार्यक्रम', 'Events')}</span></div>
    </div>
    <div class="hero-cta"><a class="btn btn-gold magnetic" href="/units">${L('अपनी इकाई खोजें', 'Find your unit')} →</a><a class="btn btn-ghost" href="/join">${L('सदस्य बनें', 'Join')}</a></div></div>
  <div class="globe-wrap reveal"><canvas id="hero3d" aria-hidden="true"></canvas></div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="sec-h reveal row"><div><span class="kicker">${L('मीडिया', 'Media')}</span><h2>${L('ताज़ा प्रेस विज्ञप्ति', 'Latest press releases')}</h2></div><a class="btn btn-ghost" href="/press">${L('सभी देखें', 'See all')} →</a></div>
  ${press.length ? `<div class="grid3">${press.map((p) => pressCard(c, p)).join('')}</div>` : empty(L('जल्द ही प्रेस विज्ञप्तियाँ यहाँ प्रकाशित होंगी।', 'Press releases will be published here soon.'))}
</div></section>

<section class="sec sec-alt"><div class="wrap">
  <div class="sec-h reveal row"><div><span class="kicker">${L('कार्यक्रम', 'Events')}</span><h2>${L('आने वाले और हालिया कार्यक्रम', 'Upcoming & recent events')}</h2></div><a class="btn btn-ghost" href="/events">${L('सभी देखें', 'See all')} →</a></div>
  ${events.length ? `<div class="grid3">${events.map((e) => eventCard(c, e)).join('')}</div>` : empty(L('कार्यक्रमों की जानकारी जल्द जोड़ी जाएगी।', 'Event details will be added soon.'))}
</div></section>

${videos.length ? `<section class="sec"><div class="wrap"><div class="sec-h reveal row"><div><span class="kicker">${L('वीडियो', 'Video')}</span><h2>${L('मंच की आवाज़', 'Voice of the Manch')}</h2></div><a class="btn btn-ghost" href="/gallery?tab=video">${L('सभी वीडियो', 'All videos')} →</a></div>
  <div class="grid3">${videos.map((v) => videoCard(c, v)).join('')}</div></div></section>` : ''}

${photos.length ? `<section class="sec sec-alt"><div class="wrap"><div class="sec-h reveal row"><div><span class="kicker">${L('गैलरी', 'Gallery')}</span><h2>${L('तस्वीरों में मंच', 'The Manch in pictures')}</h2></div><a class="btn btn-ghost" href="/gallery">${L('पूरी गैलरी', 'Full gallery')} →</a></div>
  <div class="masonry">${photos.map((p) => photoTile(p)).join('')}</div></div></section>` : ''}

<section class="cta-band"><div class="wrap cta-grid">
  <div class="cta-card tilt reveal"><span class="kicker">${L('सदस्यता', 'Membership')}</span><h2>${L('मंच से जुड़ें, आवाज़ बनें', 'Join the Manch, be a voice')}</h2>
    <p>${L('ऑनलाइन फॉर्म भरें और अपना डिजिटल सदस्यता कार्ड पाएँ।', 'Fill the online form and get your digital membership card.')}</p>
    <a class="btn btn-gold btn-lg magnetic" href="/join">${L('अभी सदस्य बनें', 'Join now')} →</a></div>
  <div class="cta-card tilt reveal alt"><span class="kicker">${L('सहयोग', 'Support')}</span><h2>${L('आपका सहयोग, हमारी ताक़त', 'Your support is our strength')}</h2>
    <div class="chips">${presets.slice(0, 4).map((a) => `<a href="/donate?amount=${a}">₹${a.toLocaleString('en-IN')}</a>`).join('')}</div>
    <a class="btn btn-light btn-lg magnetic" href="/donate">${L('दान करें', 'Donate')} →</a></div>
</div></section>`;
  return layout(c, { body, home: true, active: 'home' });
}

function photoTile(p) {
  return `<a class="tile reveal" href="${esc(p.file)}" data-lightbox data-cap="${esc(p.caption || '')}"><img src="${esc(U.thumbOf(p.file))}" alt="${esc(p.caption || '')}" loading="lazy"><span>${esc(p.caption || '')}</span></a>`;
}
function videoCard(c, v) {
  return `<a class="card video-card tilt reveal" href="https://www.youtube.com/watch?v=${esc(v.youtube_id)}" data-video="${esc(v.youtube_id)}" target="_blank" rel="noopener">
    <div class="thumb"><img src="https://i.ytimg.com/vi/${esc(v.youtube_id)}/hqdefault.jpg" alt="" loading="lazy"><i class="play">▶</i></div>
    <div class="card-b"><h3>${esc(v.caption || 'Video')}</h3></div></a>`;
}

// ----------------------------------------------------------------- simple pages
function aboutPage(c) {
  const pg = db.prepare(`SELECT * FROM pages WHERE slug='about'`).get();
  const body = `${head(c, c.L('मंच परिचय', 'About us'), c.L('भारतीय मुस्लिम मंच', 'Bharatiya Muslim Manch'), c.L(c.s.tagline, c.s.tagline_en))}
  <section class="sec"><div class="wrap narrow"><article class="paper prose reveal">${pg ? pg.body : ''}</article></div></section>`;
  return layout(c, { title: c.L('मंच परिचय', 'About us'), body, active: 'about' });
}
function cmsPage(c, pg) {
  const body = `${head(c, '', pg.title)}<section class="sec"><div class="wrap narrow"><article class="paper prose reveal">${pg.body}</article></div></section>`;
  return layout(c, { title: pg.title, body });
}
function leadersPage(c) {
  const rows = db.prepare(`SELECT * FROM leaders WHERE active=1 ORDER BY CASE grp WHEN 'patron' THEN 0 WHEN 'convenor' THEN 1 WHEN 'national' THEN 2 ELSE 3 END, sort, id`).all();
  const g = (k) => rows.filter((r) => r.grp === k);
  const sec = (title, arr, big) => (arr.length ? `<div class="sec-h reveal"><h2>${title}</h2></div><div class="${big ? 'leaders-top' : 'leaders-grid'}">${arr.map((l) => leaderCard(c, l, big)).join('')}</div>` : '');
  const body = `${head(c, c.L('नेतृत्व', 'Leadership'), c.L('हमारा नेतृत्व', 'Our leadership'))}
  <section class="sec"><div class="wrap">${sec(c.L('संरक्षक एवं राष्ट्रीय संयोजक', 'Patron & National Convenor'), [...g('patron'), ...g('convenor')], true)}
  ${sec(c.L('राष्ट्रीय पदाधिकारी', 'National office bearers'), g('national'))}${sec(c.L('राज्य नेतृत्व', 'State leadership'), g('state'))}
  ${rows.length ? '' : empty(c.L('जल्द ही जोड़ा जाएगा।', 'Coming soon.'))}</div></section>`;
  return layout(c, { title: c.L('नेतृत्व', 'Leadership'), body, active: 'leaders' });
}

function pressList(c, page, total, rows) {
  const per = 9, pages = Math.max(1, Math.ceil(total / per));
  const body = `${head(c, c.L('मीडिया', 'Media'), c.L('प्रेस विज्ञप्ति', 'Press releases'))}
  <section class="sec"><div class="wrap">${rows.length ? `<div class="grid3">${rows.map((p) => pressCard(c, p)).join('')}</div>` : empty(c.L('अभी कोई प्रेस विज्ञप्ति नहीं है।', 'No press releases yet.'))}
  ${pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) => `<a class="${i + 1 === page ? 'on' : ''}" href="/press?page=${i + 1}">${i + 1}</a>`).join('')}</div>` : ''}</div></section>`;
  return layout(c, { title: c.L('प्रेस विज्ञप्ति', 'Press releases'), body, active: 'press' });
}
function pressArticle(c, p, more) {
  const url = encodeURIComponent(cfg.SITE_URL + '/press/' + p.id);
  const body = `<section class="page-hero art-hero"><div class="wrap narrow"><span class="kicker">${c.L('प्रेस विज्ञप्ति', 'Press release')} • ${fmtDate(p.published_at, c.lang)}</span><h1>${esc(p.title)}</h1></div></section>
  <section class="sec"><div class="wrap narrow"><article class="paper prose">${p.cover ? `<img class="cover" src="${esc(p.cover)}" alt="">` : ''}${p.body || ''}
  ${p.attachment ? `<p class="attach"><a class="btn btn-ghost" href="${esc(p.attachment)}" target="_blank" rel="noopener">📄 ${c.L('PDF डाउनलोड करें', 'Download PDF')}</a></p>` : ''}</article>
  <div class="share"><span>${c.L('साझा करें', 'Share')}:</span><a href="https://wa.me/?text=${encodeURIComponent(p.title)}%20${url}" target="_blank" rel="noopener">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener">Facebook</a><a href="https://twitter.com/intent/tweet?url=${url}&text=${encodeURIComponent(p.title)}" target="_blank" rel="noopener">X</a><button type="button" data-copy="${esc(cfg.SITE_URL + '/press/' + p.id)}">${c.L('लिंक कॉपी', 'Copy link')}</button></div>
  </div></section>
  ${more.length ? `<section class="sec sec-alt"><div class="wrap"><div class="sec-h"><h2>${c.L('और पढ़ें', 'More releases')}</h2></div><div class="grid3">${more.map((m) => pressCard(c, m)).join('')}</div></div></section>` : ''}`;
  return layout(c, { title: p.title, desc: p.summary || U.plain(p.body), body, active: 'press', og: p.cover || undefined });
}

function galleryPage(c, tab, albums, photos, videos) {
  const body = `${head(c, c.L('गैलरी', 'Gallery'), c.L('फ़ोटो एवं वीडियो गैलरी', 'Photo & video gallery'))}
  <section class="sec"><div class="wrap">
  <div class="tabs"><a class="${tab !== 'video' ? 'on' : ''}" href="/gallery">📸 ${c.L('फ़ोटो', 'Photos')}</a><a class="${tab === 'video' ? 'on' : ''}" href="/gallery?tab=video">🎬 ${c.L('वीडियो', 'Videos')}</a></div>
  ${tab === 'video'
    ? (videos.length ? `<div class="grid3">${videos.map((v) => videoCard(c, v)).join('')}</div>` : empty(c.L('अभी कोई वीडियो नहीं है।', 'No videos yet.')))
    : `${albums.length ? `<div class="grid3">${albums.map((a) => `<a class="card album tilt reveal" href="/gallery/${a.id}"><div class="thumb">${a.cover ? `<img src="${esc(U.thumbOf(a.cover))}" alt="" loading="lazy">` : '<div class="ph"><img src="/img/logo.webp" alt=""></div>'}<em>${a.n} ${c.L('फ़ोटो', 'photos')}</em></div><div class="card-b"><h3>${esc(a.title)}</h3><time>${fmtDate(a.event_date, c.lang)}</time></div></a>`).join('')}</div>` : ''}
       ${photos.length ? `<div class="sec-h"><h2>${c.L('हाल की तस्वीरें', 'Recent photos')}</h2></div><div class="masonry">${photos.map(photoTile).join('')}</div>` : ''}
       ${!albums.length && !photos.length ? empty(c.L('अभी कोई फ़ोटो नहीं है।', 'No photos yet.')) : ''}`}
  </div></section>`;
  return layout(c, { title: c.L('गैलरी', 'Gallery'), body, active: 'gallery' });
}
function albumPage(c, a, photos) {
  const body = `${head(c, c.L('गैलरी', 'Gallery') + (a.event_date ? ' • ' + fmtDate(a.event_date, c.lang) : ''), a.title, a.description)}
  <section class="sec"><div class="wrap">${photos.length ? `<div class="masonry">${photos.map(photoTile).join('')}</div>` : empty(c.L('इस एल्बम में अभी फ़ोटो नहीं है।', 'No photos in this album yet.'))}
  <p class="center"><a class="btn btn-ghost" href="/gallery">← ${c.L('सभी एल्बम', 'All albums')}</a></p></div></section>`;
  return layout(c, { title: a.title, body, active: 'gallery', og: a.cover || undefined });
}
function eventsPage(c, rows) {
  const today = U.todayISO();
  const up = rows.filter((e) => e.event_date >= today).reverse(), past = rows.filter((e) => !e.event_date || e.event_date < today);
  const body = `${head(c, c.L('कार्यक्रम', 'Events'), c.L('आने वाले एवं हालिया कार्यक्रम', 'Upcoming & recent events'))}
  <section class="sec"><div class="wrap">
  ${up.length ? `<div class="sec-h"><h2>${c.L('आने वाले कार्यक्रम', 'Upcoming')}</h2></div><div class="grid3">${up.map((e) => eventCard(c, e)).join('')}</div>` : ''}
  ${past.length ? `<div class="sec-h"><h2>${c.L('पिछले कार्यक्रम', 'Past events')}</h2></div><div class="grid3">${past.map((e) => eventCard(c, e)).join('')}</div>` : ''}
  ${rows.length ? '' : empty(c.L('कार्यक्रमों की जानकारी जल्द जोड़ी जाएगी।', 'Event details will be added soon.'))}</div></section>`;
  return layout(c, { title: c.L('कार्यक्रम', 'Events'), body, active: 'events' });
}
function unitsPage(c, rows) {
  const by = {};
  rows.forEach((r) => (by[r.state_code || r.state] ||= { state: r.state, code: r.state_code, items: [] }).items.push(r));
  const groups = Object.values(by).sort((a, b) => a.state.localeCompare(b.state, 'hi'));
  const body = `${head(c, c.L('संगठन', 'Organisation'), c.L('राज्य एवं ज़िला इकाइयाँ', 'State & district units'), c.L('अपने राज्य की इकाई से संपर्क करें।', 'Contact the unit in your state.'))}
  <section class="sec"><div class="wrap">${groups.length ? groups.map((g) => `<div class="sec-h reveal"><h2>${esc(g.state)}</h2></div><div class="grid3">${g.items.map((u) => `<div class="card unit tilt reveal"><div class="card-b"><h3>${esc(u.district || g.state)}</h3>
    ${u.head_name ? `<p><b>${esc(u.head_name)}</b>${u.head_title ? ' — ' + esc(u.head_title) : ''}</p>` : ''}${u.address ? `<p class="muted">📍 ${esc(u.address)}</p>` : ''}
    ${u.phone ? `<a href="tel:${esc(u.phone)}">📞 ${esc(u.phone)}</a>` : ''}${u.email ? `<a href="mailto:${esc(u.email)}">✉️ ${esc(u.email)}</a>` : ''}</div></div>`).join('')}</div>`).join('')
    : empty(c.L('राज्य इकाइयों की सूची जल्द जोड़ी जाएगी। तब तक कृपया सीधे संपर्क करें।', 'State units will be listed soon. Please contact us directly until then.'))}
  <p class="center"><a class="btn btn-gold" href="/contact">${c.L('संपर्क करें', 'Contact us')}</a></p></div></section>`;
  return layout(c, { title: c.L('राज्य इकाइयाँ', 'State units'), body, active: 'units' });
}

// -------------------------------------------------------------------- forms
const field = (label, input, opt = {}) => `<label class="f ${opt.cls || ''}"><span>${label}${opt.req ? ' <em>*</em>' : ''}</span>${input}${opt.hint ? `<small>${opt.hint}</small>` : ''}</label>`;
const stateOptions = (c, sel) => `<option value="">${c.L('— राज्य चुनें —', '— Select state —')}</option>` + STATES.map((s) => `<option value="${s.code}" ${s.code === sel ? 'selected' : ''}>${esc(stName(c, s))}</option>`).join('');

function joinPage(c) {
  const fee = parseInt(c.s.membership_fee) || 0;
  const { L } = c;
  const body = `${head(c, L('सदस्यता', 'Membership'), L('भारतीय मुस्लिम मंच के सदस्य बनें', 'Become a member of Bharatiya Muslim Manch'), L('फॉर्म भरें, अनुमोदन के बाद आपको डिजिटल सदस्यता कार्ड मिलेगा।', 'Fill the form; after approval you will receive a digital membership card.'))}
  <section class="sec"><div class="wrap form-wrap">
  <form class="form glass" id="joinForm" data-ajax action="/api/join" method="post" enctype="multipart/form-data" novalidate>
    ${fee ? `<div class="notice">${L('सदस्यता शुल्क', 'Membership fee')}: <b>₹${fee}</b> — ${L('फॉर्म जमा करने के बाद भुगतान पेज खुलेगा।', 'the payment page opens after you submit.')}</div>` : ''}
    <div class="photo-pick"><label for="photoIn" class="photo-box" id="photoBox"><span>📷<br>${L('फ़ोटो जोड़ें', 'Add photo')}</span></label><input id="photoIn" type="file" name="photo" accept="image/jpeg,image/png,image/webp" hidden><small>${L('कार्ड के लिए साफ़ पासपोर्ट-साइज़ फ़ोटो (अधिकतम 5MB)', 'Clear passport-size photo for the card (max 5MB)')}</small></div>
    <div class="fgrid">
      ${field(L('पूरा नाम', 'Full name'), '<input name="name" required maxlength="80" autocomplete="name">', { req: 1 })}
      ${field(L('पिता / पति का नाम', "Father's / husband's name"), '<input name="father_name" maxlength="80">')}
      ${field(L('मोबाइल नंबर', 'Mobile number'), '<input name="mobile" required inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" autocomplete="tel-national">', { req: 1, hint: L('10 अंकों का भारतीय मोबाइल नंबर', '10-digit Indian mobile number') })}
      ${field('Email', '<input name="email" type="email" maxlength="100" autocomplete="email">')}
      ${field(L('जन्म तिथि', 'Date of birth'), '<input name="dob" type="date" max="' + U.todayISO() + '">')}
      ${field(L('लिंग', 'Gender'), `<select name="gender"><option value="">—</option><option value="M">${L('पुरुष', 'Male')}</option><option value="F">${L('महिला', 'Female')}</option><option value="O">${L('अन्य', 'Other')}</option></select>`)}
      ${field(L('राज्य', 'State'), `<select name="state_code" required>${stateOptions(c)}</select>`, { req: 1 })}
      ${field(L('ज़िला', 'District'), '<input name="district" required maxlength="60">', { req: 1 })}
      ${field(L('शहर / गाँव', 'City / village'), '<input name="city" maxlength="60">')}
      ${field(L('पिन कोड', 'PIN code'), '<input name="pincode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}">')}
      ${field(L('पूरा पता', 'Full address'), '<textarea name="address" rows="2" maxlength="300"></textarea>', { cls: 'full' })}
      ${field(L('पेशा', 'Occupation'), '<input name="occupation" maxlength="60">')}
      ${field(L('शिक्षा', 'Qualification'), '<input name="qualification" maxlength="60">')}
      ${field(L('रेफरेंस (यदि कोई)', 'Referred by (if any)'), '<input name="referral" maxlength="80">', { cls: 'full' })}
    </div>
    <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" name="consent" value="1" required> <span>${L('मैं भारत का नागरिक हूँ, मंच के उद्देश्यों से सहमत हूँ और मेरी दी गई जानकारी सही है। मैं अपनी जानकारी के सदस्यता कार्य हेतु उपयोग की अनुमति देता/देती हूँ।', 'I am a citizen of India, I agree with the aims of the Manch and the information I gave is correct. I allow my details to be used for membership purposes.')}</span></label>
    <div class="form-err" role="alert"></div>
    <button class="btn btn-gold btn-lg" type="submit">${fee ? L('जमा करें और भुगतान करें', 'Submit & pay') : L('सदस्यता के लिए आवेदन करें', 'Apply for membership')} →</button>
    <p class="tiny muted">${L('आपकी निजी जानकारी गोपनीय रखी जाएगी।', 'Your personal details are kept confidential.')} <a href="/p/privacy">${L('गोपनीयता नीति', 'Privacy policy')}</a></p>
  </form>
  <aside class="side"><div class="glass"><h3>${L('सदस्यता के लाभ', 'Why join')}</h3><ul class="ticks"><li>${L('डिजिटल सदस्यता कार्ड (QR सत्यापन सहित)', 'Digital membership card with QR verification')}</li><li>${L('राज्य/ज़िला इकाई से जुड़ाव', 'Connect with your state/district unit')}</li><li>${L('मंच के कार्यक्रमों की जानकारी', 'Updates about Manch programmes')}</li><li>${L('संविधानिक अधिकारों पर जागरूकता', 'Awareness on constitutional rights')}</li></ul></div>
  <div class="glass"><h3>${L('पहले से सदस्य हैं?', 'Already a member?')}</h3><p class="muted">${L('अपना सदस्यता कार्ड डाउनलोड करें।', 'Download your membership card.')}</p><a class="btn btn-ghost" href="/card">${L('कार्ड पाएँ', 'Get card')} →</a></div></aside>
  </div></section>`;
  return layout(c, { title: L('सदस्य बनें', 'Join'), body, active: '' });
}

function joinDone(c, m) {
  const body = `${head(c, '', c.L('धन्यवाद! आपका आवेदन प्राप्त हो गया', 'Thank you! Your application is received'))}
  <section class="sec"><div class="wrap narrow"><div class="paper center"><p class="big-ok">✓</p><p>${c.L('आवेदक', 'Applicant')}: <b>${esc(m.name)}</b></p>
  <p>${c.L('आपके आवेदन की समीक्षा के बाद सदस्यता स्वीकृत की जाएगी। स्वीकृति के बाद आप अपना सदस्यता कार्ड', 'Your application will be reviewed. After approval you can download your card')} <a href="/card">${c.L('यहाँ से', 'here')}</a> ${c.L('डाउनलोड कर सकेंगे।', 'using your membership number and mobile.')}</p>
  <p><a class="btn btn-gold" href="/">${c.L('होम पर जाएँ', 'Back home')}</a></p></div></div></section>`;
  return layout(c, { title: c.L('आवेदन प्राप्त', 'Application received'), body, noindex: true });
}

function donatePage(c, campaigns, preAmount) {
  const { L, s } = c;
  const presets = String(s.donation_presets).split(',').map((x) => parseInt(x)).filter(Boolean);
  const mode = cfg.PAYMENT_MODE;
  const thr = parseInt(s.pan_required_above) || 20000;
  const body = `${head(c, L('सहयोग', 'Support'), L('मंच को सहयोग दें', 'Support the Manch'), L('आपका हर योगदान संविधान, शिक्षा और भाईचारे के काम को ताक़त देता है।', 'Every contribution strengthens our work for the Constitution, education and harmony.'))}
  <section class="sec"><div class="wrap form-wrap">
  <form class="form glass" id="donateForm" data-ajax action="/api/donate" method="post" novalidate data-thr="${thr}">
    <h3>${L('राशि चुनें', 'Choose amount')}</h3>
    <div class="amounts">${presets.map((a) => `<button type="button" class="amt ${a === preAmount ? 'on' : ''}" data-amt="${a}">₹${a.toLocaleString('en-IN')}</button>`).join('')}</div>
    <label class="f"><span>${L('या अपनी राशि (₹)', 'Or enter amount (₹)')}</span><input name="amount" id="amtIn" type="number" min="${parseInt(s.min_donation) || 10}" max="500000" step="1" required value="${preAmount || ''}" inputmode="numeric"></label>
    ${campaigns.length ? field(L('किस अभियान के लिए', 'For campaign'), `<select name="campaign_id"><option value="">${L('मंच का सामान्य कोष', 'General fund')}</option>${campaigns.map((x) => `<option value="${x.id}">${esc(x.title)}</option>`).join('')}</select>`) : ''}
    <div class="fgrid">
      ${field(L('आपका नाम', 'Your name'), '<input name="name" required maxlength="80" autocomplete="name">', { req: 1 })}
      ${field(L('मोबाइल नंबर', 'Mobile'), '<input name="mobile" required inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}">', { req: 1 })}
      ${field('Email', '<input name="email" type="email" maxlength="100">', { hint: L('रसीद भेजने हेतु', 'for the receipt') })}
      ${field('PAN', '<input name="pan" maxlength="10" style="text-transform:uppercase" id="panIn">', { hint: L(`₹${thr.toLocaleString('en-IN')} से अधिक पर अनिवार्य`, `Mandatory above ₹${thr.toLocaleString('en-IN')}`) })}
      ${field(L('पता', 'Address'), '<textarea name="address" rows="2" maxlength="300" id="addrIn"></textarea>', { cls: 'full', hint: L(`₹${thr.toLocaleString('en-IN')} से अधिक पर अनिवार्य`, `Mandatory above ₹${thr.toLocaleString('en-IN')}`) })}
    </div>
    <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" name="declare" value="1" required> <span>${L('मैं भारत का नागरिक हूँ तथा यह योगदान स्वेच्छा से अपनी वैध आय से कर रहा/रही हूँ। यह किसी विदेशी स्रोत या सरकारी कंपनी से नहीं है।', 'I am a citizen of India and I am making this contribution voluntarily from my own lawful funds — not from a foreign source or a government company.')}</span></label>
    <div class="form-err" role="alert"></div>
    <button class="btn btn-gold btn-lg" type="submit">${L('सुरक्षित भुगतान करें', 'Pay securely')} →</button>
    <p class="tiny muted">${mode === 'phonepe' ? L('भुगतान PhonePe पेमेंट गेटवे द्वारा — UPI, कार्ड, नेट बैंकिंग।', 'Payments via PhonePe Payment Gateway — UPI, cards, net banking.') : mode === 'manual' ? L('UPI से भुगतान करें और UTR दर्ज करें।', 'Pay via UPI and enter the UTR.') : L('टेस्ट मोड — असली भुगतान नहीं होगा।', 'TEST MODE — no real payment.')}</p>
  </form>
  <aside class="side"><div class="glass"><h3>🔒 ${L('सुरक्षित एवं पारदर्शी', 'Safe & transparent')}</h3><ul class="ticks"><li>${L('भुगतान के बाद तुरंत डिजिटल रसीद', 'Instant digital receipt after payment')}</li><li>${L('सभी योगदानों का लेखा-जोखा रखा जाता है', 'All contributions are accounted for')}</li><li>${L('नक़द नहीं — केवल ऑनलाइन/बैंकिंग माध्यम', 'Online/banking channels only')}</li></ul></div>
  <div class="glass"><p class="tiny muted">${esc(s.receipt_footer)}</p></div></aside>
  </div></section>`;
  return layout(c, { title: L('दान करें', 'Donate'), body, active: '' });
}

function payStatusPage(c, d) {
  const { L } = c;
  const ok = d.status === 'success', fail = d.status === 'failed';
  const body = `${head(c, '', ok ? L('भुगतान सफल — धन्यवाद!', 'Payment successful — thank you!') : fail ? L('भुगतान असफल', 'Payment failed') : L('भुगतान की पुष्टि हो रही है…', 'Confirming your payment…'))}
  <section class="sec"><div class="wrap narrow"><div class="paper center" id="payBox" data-order="${esc(d.order_id)}" data-k="${U.hmac(d.order_id)}" data-state="${d.status}">
  <p class="big-${ok ? 'ok' : fail ? 'no' : 'wait'}">${ok ? '✓' : fail ? '✕' : '…'}</p>
  <p>${L('राशि', 'Amount')}: <b>${money(d.amount)}</b> • ${L('ऑर्डर', 'Order')}: <code>${esc(d.order_id)}</code></p>
  ${ok ? `<p>${L('रसीद संख्या', 'Receipt no.')}: <b>${esc(d.receipt_no)}</b></p><p><a class="btn btn-gold" href="/receipt/${esc(d.order_id)}?k=${U.hmac(d.order_id)}">🧾 ${L('रसीद देखें / प्रिंट करें', 'View / print receipt')}</a></p>
     ${d.purpose === 'membership' ? `<p>${L('आपकी सदस्यता का शुल्क प्राप्त हो गया है। अनुमोदन के बाद आप कार्ड डाउनलोड कर सकेंगे।', 'Your membership fee is received. You can download your card after approval.')}</p>` : ''}`
   : fail ? `<p>${L('कृपया दोबारा प्रयास करें। यदि राशि कट गई है तो 2–3 कार्य दिवस में वापस आ जाएगी।', 'Please try again. If money was deducted it will be refunded in 2–3 working days.')}</p><p><a class="btn btn-gold" href="/donate">${L('दोबारा प्रयास करें', 'Try again')}</a></p>`
   : `<p>${L('कृपया यह पेज बंद न करें। स्थिति अपने-आप अपडेट होगी।', 'Please keep this page open; the status updates automatically.')}</p>`}
  </div></div></section>`;
  return layout(c, { title: L('भुगतान स्थिति', 'Payment status'), body, noindex: true, scripts: d.status === 'success' || d.status === 'failed' ? '' : '<script src="/js/paystatus.js" defer></script>' });
}

function upiPage(c, d, qrSvg, link) {
  const { L } = c;
  const body = `${head(c, L('UPI भुगतान', 'UPI payment'), L('UPI से भुगतान करें', 'Pay with UPI'))}
  <section class="sec"><div class="wrap narrow"><div class="paper center">
  <p>${L('राशि', 'Amount')}: <b class="big-amt">${money(d.amount)}</b></p>
  <div class="qr">${qrSvg}</div>
  <p class="muted">${L('किसी भी UPI ऐप (PhonePe, GPay, Paytm) से स्कैन करें', 'Scan with any UPI app (PhonePe, GPay, Paytm)')}<br>UPI ID: <b>${esc(cfg.UPI_ID)}</b></p>
  <p class="only-m"><a class="btn btn-gold" href="${esc(link)}">${L('UPI ऐप खोलें', 'Open UPI app')}</a></p>
  <form class="form" id="utrForm" data-ajax action="/api/pay/utr" method="post"><input type="hidden" name="order" value="${esc(d.order_id)}"><input type="hidden" name="k" value="${U.hmac(d.order_id)}">
  ${field(L('भुगतान के बाद UTR / Transaction ID दर्ज करें', 'After paying, enter the UTR / transaction ID'), '<input name="utr" required minlength="8" maxlength="30" pattern="[A-Za-z0-9]{8,30}">', { req: 1 })}
  <div class="form-err" role="alert"></div><button class="btn btn-gold" type="submit">${L('जमा करें', 'Submit')}</button></form>
  <p class="tiny muted">${L('हमारी टीम भुगतान सत्यापित करके रसीद जारी करेगी।', 'Our team verifies the payment and issues the receipt.')}</p>
  </div></div></section>`;
  return layout(c, { title: 'UPI', body, noindex: true });
}
function mockPage(c, d) {
  const body = `${head(c, 'TEST MODE', 'Mock payment gateway')}<section class="sec"><div class="wrap narrow"><div class="paper center"><p>Order <code>${esc(d.order_id)}</code> — ${money(d.amount)}</p>
  <p class="muted">This page exists only for local testing (PAYMENT_MODE=mock).</p>
  <form method="post" action="/pay/mock/${esc(d.order_id)}?k=${U.hmac(d.order_id)}"><button class="btn btn-gold" name="r" value="ok">Simulate SUCCESS</button> <button class="btn btn-ghost" name="r" value="fail">Simulate FAILURE</button></form></div></div></section>`;
  return layout(c, { title: 'Mock', body, noindex: true });
}
function utrDone(c, d) {
  const body = `${head(c, '', c.L('UTR प्राप्त हुआ', 'UTR received'))}<section class="sec"><div class="wrap narrow"><div class="paper center"><p class="big-wait">…</p>
  <p>${c.L('सत्यापन के बाद आपकी रसीद जारी की जाएगी। आदेश संख्या', 'Your receipt will be issued after verification. Order no.')}: <code>${esc(d.order_id)}</code></p>
  <p><a class="btn btn-gold" href="/pay/status/${esc(d.order_id)}?k=${U.hmac(d.order_id)}">${c.L('स्थिति देखें', 'Check status')}</a></p></div></div></section>`;
  return layout(c, { title: 'UTR', body, noindex: true });
}

function receiptPage(c, d, camp) {
  const s = c.s;
  const body = `<section class="sec receipt-sec"><div class="wrap narrow"><div class="receipt paper" id="receipt">
  <div class="rc-head"><img src="/img/logo.webp" alt="" width="70" height="70"><div><h1>${esc(s.site_name)}</h1><p>${esc(s.site_name_en)}</p><p class="muted">${esc(s.office_address)}${s.phone ? ' • ' + esc(s.phone) : ''}${s.email ? ' • ' + esc(s.email) : ''}</p></div></div>
  <h2 class="rc-title">${d.purpose === 'membership' ? 'सदस्यता शुल्क रसीद / Membership Fee Receipt' : 'दान रसीद / Donation Receipt'}</h2>
  <table class="rc-t"><tr><th>रसीद संख्या / Receipt No.</th><td>${esc(d.receipt_no)}</td></tr>
  <tr><th>दिनांक / Date</th><td>${fmtDate(d.paid_at, 'en')}</td></tr>
  <tr><th>प्राप्तकर्ता / Received from</th><td>${esc(d.name)}${d.mobile ? ' (' + esc(d.mobile.replace(/^(\d{2})\d{6}(\d{2})$/, '$1XXXXXX$2')) + ')' : ''}</td></tr>
  ${d.pan ? `<tr><th>PAN</th><td>${esc(d.pan.replace(/^(\w{3})\w{4}(\w{3})$/, '$1XXXX$2'))}</td></tr>` : ''}
  <tr><th>राशि / Amount</th><td><b>${money(d.amount)}</b></td></tr>
  ${camp ? `<tr><th>अभियान / Campaign</th><td>${esc(camp.title)}</td></tr>` : ''}
  <tr><th>माध्यम / Mode</th><td>${d.mode === 'phonepe' ? 'PhonePe (Online)' : d.mode === 'manual' ? 'UPI' : d.mode === 'offline' ? 'Offline (Bank/Cheque)' : 'Test'} ${d.utr ? '• UTR ' + esc(d.utr) : ''}</td></tr>
  <tr><th>ऑर्डर आईडी / Order ID</th><td>${esc(d.order_id)}</td></tr></table>
  <p class="tiny muted">${esc(s.receipt_footer)}</p><p class="tiny muted">कंप्यूटर द्वारा जनित रसीद — हस्ताक्षर की आवश्यकता नहीं। / Computer generated receipt.</p></div>
  <p class="center no-print"><button class="btn btn-gold" data-print>🖨️ Print / Save PDF</button> <a class="btn btn-ghost" href="/">Home</a></p></div></section>`;
  return layout(c, { title: 'Receipt ' + d.receipt_no, body, noindex: true });
}

// ------------------------------------------------------------- member card
function cardLookupPage(c, err) {
  const { L } = c;
  const body = `${head(c, L('सदस्यता कार्ड', 'Membership card'), L('अपना सदस्यता कार्ड पाएँ', 'Get your membership card'))}
  <section class="sec"><div class="wrap narrow"><form class="form glass" data-ajax action="/api/card" method="post" novalidate>
  ${field(L('सदस्यता संख्या', 'Membership number'), '<input name="member_no" required placeholder="BMM-UP-26-000001" style="text-transform:uppercase">', { req: 1 })}
  ${field(L('पंजीकृत मोबाइल नंबर', 'Registered mobile'), '<input name="mobile" required inputmode="numeric" maxlength="10">', { req: 1 })}
  <div class="form-err" role="alert"></div><button class="btn btn-gold btn-lg" type="submit">${L('कार्ड दिखाएँ', 'Show card')} →</button></form></div></section>`;
  return layout(c, { title: L('सदस्यता कार्ड', 'Membership card'), body, noindex: true });
}

/** Printable ID card (CR80). Used on the public card page and in the admin batch print. */
function idCardHtml(m, qrSvg, s) {
  const st = U.stateByCode(m.state_code);
  return `<div class="idc"><div class="idc-f">
    <div class="idc-top"><img src="/img/logo.webp" alt=""><div><b>${esc(s.site_name)}</b><small>${esc(s.site_name_en)}</small></div></div>
    <div class="idc-mid"><div class="idc-ph">${m.photo ? `<img src="${esc(m.photo)}" alt="" crossorigin="anonymous">` : `<span>${initials(m.name)}</span>`}</div>
      <div class="idc-info"><h3>${esc(m.name)}</h3><p class="idc-d">${esc(m.designation || 'सदस्य')}</p>
        <dl><dt>सदस्यता सं.</dt><dd>${esc(m.member_no)}</dd>${m.father_name ? `<dt>पिता/पति</dt><dd>${esc(m.father_name)}</dd>` : ''}<dt>क्षेत्र</dt><dd>${esc([m.district, st ? st.hi : m.state].filter(Boolean).join(', '))}</dd></dl></div></div>
    <div class="idc-bot"><span>वैधता: ${m.valid_till ? fmtDate(m.valid_till, 'en') : '—'}</span><i class="idc-tri"><u></u><u></u><u></u></i></div></div>
  <div class="idc-b"><div class="idc-qr">${qrSvg}</div><p>स्कैन करके सदस्यता सत्यापित करें<br><small>Scan to verify membership</small></p>
    <p class="idc-c">${esc(s.office_address)}<br>${esc(s.email || '')} ${s.phone ? '• ' + esc(s.phone) : ''}</p><p class="idc-site">${esc(cfg.SITE_URL.replace(/^https?:\/\//, ''))}</p></div></div>`;
}
function cardPage(c, m, qrSvg) {
  const body = `${head(c, c.L('सदस्यता कार्ड', 'Membership card'), m.name)}
  <section class="sec"><div class="wrap narrow center"><div id="cardArea" class="card-area">${idCardHtml(m, qrSvg, c.s)}</div>
  <p class="no-print"><button class="btn btn-gold" id="dlCard">⬇️ ${c.L('कार्ड PNG डाउनलोड', 'Download card (PNG)')}</button> <button class="btn btn-ghost" data-print>🖨️ ${c.L('प्रिंट', 'Print')}</button></p></div></section>`;
  return layout(c, { title: c.L('सदस्यता कार्ड', 'Membership card'), body, noindex: true, scripts: '<script src="/vendor/html-to-image.js" defer></script><script src="/js/card.js" defer></script>' });
}
function verifyPage(c, m) {
  const { L } = c;
  const ok = m && m.status === 'active' && (!m.valid_till || m.valid_till >= U.todayISO());
  const body = `${head(c, L('सदस्यता सत्यापन', 'Membership verification'), ok ? L('✓ वैध सदस्य', '✓ Valid member') : m ? L('सदस्यता वैध नहीं है', 'Membership not valid') : L('कोई रिकॉर्ड नहीं मिला', 'No record found'))}
  <section class="sec"><div class="wrap narrow"><div class="paper center">${m ? `<div class="v-ph">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : `<span>${initials(m.name)}</span>`}</div><h2>${esc(m.name)}</h2><p>${esc(m.designation || '')}</p>
    <p>${L('सदस्यता सं.', 'Member no.')}: <b>${esc(m.member_no)}</b></p><p>${esc([m.district, m.state].filter(Boolean).join(', '))}</p>
    <p>${L('स्थिति', 'Status')}: <b class="${ok ? 'good' : 'bad'}">${ok ? L('सक्रिय', 'Active') : L('निष्क्रिय / समाप्त', 'Inactive / expired')}</b> • ${L('वैधता', 'Valid till')}: ${m.valid_till ? fmtDate(m.valid_till, c.lang) : '—'}</p>` : `<p>${L('यह सदस्यता संख्या हमारे रिकॉर्ड में नहीं है।', 'This membership number is not in our records.')}</p>`}</div></div></section>`;
  return layout(c, { title: L('सदस्यता सत्यापन', 'Verify'), body, noindex: true });
}

function contactPage(c) {
  const { L, s } = c;
  const body = `${head(c, L('संपर्क', 'Contact'), L('हमसे संपर्क करें', 'Get in touch'))}
  <section class="sec"><div class="wrap form-wrap">
  <form class="form glass" data-ajax action="/api/contact" method="post" novalidate>
    <div class="fgrid">${field(L('नाम', 'Name'), '<input name="name" required maxlength="80">', { req: 1 })}${field(L('मोबाइल', 'Mobile'), '<input name="mobile" required inputmode="numeric" maxlength="10">', { req: 1 })}
    ${field('Email', '<input name="email" type="email" maxlength="100">')}${field(L('विषय', 'Subject'), '<input name="subject" maxlength="120">')}
    ${field(L('संदेश', 'Message'), '<textarea name="message" rows="5" required maxlength="2000"></textarea>', { cls: 'full', req: 1 })}</div>
    <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="form-err" role="alert"></div><button class="btn btn-gold btn-lg" type="submit">${L('संदेश भेजें', 'Send message')} →</button></form>
  <aside class="side"><div class="glass"><h3>${L('मंच कार्यालय', 'Office')}</h3><p>${nl2br(s.office_address)}</p>${s.phone ? `<p>📞 <a href="tel:${esc(s.phone)}">${esc(s.phone)}</a></p>` : ''}${s.email ? `<p>✉️ <a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>` : ''}<div class="socs">${social(s)}</div></div>
  ${s.maps_embed ? `<div class="glass map"><iframe src="${esc(s.maps_embed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="map"></iframe></div>` : ''}</aside></div></section>`;
  return layout(c, { title: L('संपर्क', 'Contact'), body, active: 'contact' });
}

function notFound(c) {
  const body = `<section class="page-hero"><div class="wrap center"><h1>404</h1><p class="lead">${c.L('यह पेज नहीं मिला।', 'Page not found.')}</p><a class="btn btn-gold" href="/">${c.L('होम पर जाएँ', 'Go home')}</a></div></section>`;
  return layout(c, { title: '404', body, noindex: true });
}

module.exports = {
  ctxOf, layout, home, aboutPage, cmsPage, leadersPage, pressList, pressArticle, galleryPage, albumPage, eventsPage, unitsPage,
  joinPage, joinDone, donatePage, payStatusPage, upiPage, mockPage, utrDone, receiptPage, cardLookupPage, cardPage, verifyPage,
  contactPage, notFound, idCardHtml,
};
