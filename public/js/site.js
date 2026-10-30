(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  document.documentElement.classList.add('js');

  // preloader
  const ready = () => document.body.classList.add('ready');
  if (document.readyState === 'complete') setTimeout(ready, 150); else addEventListener('load', () => setTimeout(ready, 150));
  setTimeout(ready, 2500);

  // nav
  const nav = $('#nav'), burger = $('#burger');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  burger && burger.addEventListener('click', () => {
    const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o);
    document.body.style.overflow = o ? 'hidden' : '';
  });
  $$('#links a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); document.body.style.overflow = ''; burger.setAttribute('aria-expanded', false); }));

  // reveal + counters (GSAP ScrollTrigger when present, IntersectionObserver otherwise)
  const countUp = (el) => {
    const end = +el.dataset.count || 0, t0 = performance.now(), dur = 1600;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = Math.round(end * e).toLocaleString('en-IN'); if (p < 1) requestAnimationFrame(step); };
    el.textContent = '0'; requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target; io.unobserve(el);
    if (el.classList.contains('reveal')) { el.style.transitionDelay = (el.dataset.d || 0) + 'ms'; el.classList.add('in'); }
    if (el.dataset.count !== undefined && !reduce) countUp(el);
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach((el) => {
    const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.classList.contains('reveal')) : [];
    el.dataset.d = Math.min(sib.indexOf(el), 5) * 90; io.observe(el);
  });
  $$('[data-count]').forEach((el) => io.observe(el));

  // GSAP extras: hero parallax, section title sweep
  const startGsap = () => {
    if (!window.gsap || !window.ScrollTrigger || reduce) return;
    gsap.registerPlugin(ScrollTrigger);
    const hin = $('.hero-in');
    if (hin) gsap.to(hin, { yPercent: -12, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    $$('.stat b').forEach((b) => gsap.from(b, { scale: 0.7, opacity: 0, duration: 0.9, ease: 'back.out(1.6)', scrollTrigger: { trigger: b, start: 'top 90%' } }));
    $$('.sec-h h2').forEach((h) => gsap.from(h, { backgroundPositionX: '100%', duration: 1, scrollTrigger: { trigger: h, start: 'top 90%' } }));
    $$('.pi').forEach((p) => gsap.from(p, { rotate: -25, scale: 0.4, duration: 0.9, ease: 'elastic.out(1,.55)', scrollTrigger: { trigger: p, start: 'top 92%' } }));
  };
  addEventListener('load', startGsap);

  // 3D tilt on cards (desktop only)
  if (fine && !reduce) {
    $$('.tilt').forEach((el) => {
      let raf;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { el.style.transition = 'transform .08s'; el.style.transform = `perspective(900px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg) translateZ(0)`; });
      });
      el.addEventListener('pointerleave', () => { el.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
    });
    // magnetic buttons
    $$('.magnetic').forEach((b) => {
      b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px,${(e.clientY - r.top - r.height / 2) * 0.28}px)`; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
    // cursor glow
    const g = document.createElement('div'); g.className = 'cursor-glow'; document.body.appendChild(g);
    addEventListener('pointermove', (e) => { g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; }, { passive: true });
  }

  // lightbox (photos + youtube)
  const items = () => $$('[data-lightbox]');
  const openLb = (html, idx) => {
    const lb = document.createElement('div'); lb.className = 'lb'; lb.innerHTML = html;
    const close = () => { lb.remove(); removeEventListener('keydown', key); document.body.style.overflow = ''; };
    const key = (e) => { if (e.key === 'Escape') close(); if (idx !== undefined && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { close(); const l = items(); const n = (idx + (e.key === 'ArrowRight' ? 1 : -1) + l.length) % l.length; showPhoto(l, n); } };
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.tagName === 'BUTTON' && e.target.classList.contains('x')) close(); });
    $$('.nx,.pv', lb).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); key({ key: b.classList.contains('nx') ? 'ArrowRight' : 'ArrowLeft' }); }));
    addEventListener('keydown', key); document.body.appendChild(lb); document.body.style.overflow = 'hidden';
  };
  const showPhoto = (l, n) => { const a = l[n]; openLb(`<button class="x" aria-label="close">×</button>${l.length > 1 ? '<button class="pv" aria-label="prev">‹</button><button class="nx" aria-label="next">›</button>' : ''}<img src="${a.getAttribute('href')}" alt=""><p>${(a.dataset.cap || '').replace(/</g, '&lt;')}</p>`, n); };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-lightbox]');
    if (a) { e.preventDefault(); const l = items(); showPhoto(l, l.indexOf(a)); return; }
    const v = e.target.closest('[data-video]');
    if (v) { e.preventDefault(); openLb(`<button class="x" aria-label="close">×</button><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.dataset.video)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="video"></iframe>`); return; }
    const c = e.target.closest('[data-copy]');
    if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy); const t = c.textContent; c.textContent = '✓'; setTimeout(() => (c.textContent = t), 1500); }
    if (e.target.closest('[data-print]')) window.print();
  });

  // ajax forms
  $$('form[data-ajax]').forEach((f) => {
    const err = $('.form-err', f), btn = $('button[type=submit]', f);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); err.textContent = ''; err.classList.remove('okmsg');
      if (!f.checkValidity()) { f.reportValidity(); return; }
      const label = btn.innerHTML; btn.disabled = true; btn.textContent = '…';
      try {
        const isMulti = f.enctype === 'multipart/form-data';
        const body = isMulti ? new FormData(f) : new URLSearchParams(new FormData(f));
        const r = await fetch(f.action, { method: 'POST', body, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const j = await r.json().catch(() => ({ ok: false, error: 'सर्वर से उत्तर नहीं मिला।' }));
        if (!j.ok) throw new Error(j.error || 'त्रुटि');
        if (j.redirect) { location.href = j.redirect; return; }
        err.classList.add('okmsg'); err.textContent = j.message || 'ठीक है'; f.reset();
      } catch (e) { err.textContent = e.message; } finally { btn.disabled = false; btn.innerHTML = label; }
    });
  });

  // donate amount chips
  const amtIn = $('#amtIn');
  if (amtIn) $$('.amt').forEach((b) => b.addEventListener('click', () => { amtIn.value = b.dataset.amt; $$('.amt').forEach((x) => x.classList.toggle('on', x === b)); }));
  if (amtIn) amtIn.addEventListener('input', () => $$('.amt').forEach((x) => x.classList.toggle('on', x.dataset.amt === amtIn.value)));

  // photo preview
  const pin = $('#photoIn');
  if (pin) pin.addEventListener('change', () => {
    const f = pin.files[0]; if (!f) return;
    if (f.size > 5.5 * 1024 * 1024) { alert('फ़ोटो 5MB से छोटी होनी चाहिए।'); pin.value = ''; return; }
    const u = URL.createObjectURL(f); $('#photoBox').innerHTML = `<img src="${u}" alt="">`;
  });
})();

// ===== membership popup (shown first on every new visit) =====
(() => {
  const m = document.getElementById('joinModal'); if (!m) return;
  const $ = (s, el = m) => el.querySelector(s);
  const safe = { get: (k, s) => { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } }, set: (k, v, s) => { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) { /* ignore */ } } };
  const joinedAt = +safe.get('bmm_joined');
  if (safe.get('bmm_jm_seen', true) || (joinedAt && Date.now() - joinedAt < 365 * 864e5)) return;
  let last;
  const open = () => { m.hidden = false; last = document.activeElement; document.body.style.overflow = 'hidden'; setTimeout(() => { const i = $('input[name=name]'); i && i.focus({ preventScroll: true }); }, 350); };
  const close = () => { m.hidden = true; document.body.style.overflow = ''; safe.set('bmm_jm_seen', '1', true); last && last.focus && last.focus(); };
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-jm-close]')) close(); });
  addEventListener('keydown', (e) => { if (!m.hidden && e.key === 'Escape') close(); });
  const form = $('#jmForm'), err = $('.form-err', form), btn = $('button[type=submit]', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const f = form.photo && form.photo.files[0];
    if (f && f.size > 5.5 * 1024 * 1024) { err.textContent = 'फ़ोटो 5MB से छोटी होनी चाहिए।'; return; }
    const label = btn.innerHTML; btn.disabled = true; btn.textContent = '…';
    try {
      const r = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const j = await r.json().catch(() => ({ ok: false, error: 'सर्वर से उत्तर नहीं मिला।' }));
      if (!j.ok) throw new Error(j.error || 'त्रुटि');
      safe.set('bmm_joined', String(Date.now()));
      if (j.redirect && !/^\/join\/done/.test(j.redirect)) { location.href = j.redirect; return; } // membership fee -> payment page
      form.hidden = true; $('.jm-main > .kicker').hidden = true; $('#jmT').hidden = true; $('.jm-main > p').hidden = true; $('.jm-done').hidden = false;
    } catch (er) { err.textContent = er.message; btn.disabled = false; btn.innerHTML = label; }
  });
  const go = () => setTimeout(open, 900);
  if (document.body.classList.contains('ready')) go(); else addEventListener('load', go, { once: true });
})();
