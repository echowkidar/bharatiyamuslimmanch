(() => {
  const btn = document.getElementById('dlCard'); if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true; const t = btn.textContent; btn.textContent = '…';
    try {
      const out = [];
      for (const el of document.querySelectorAll('#cardArea .idc-f, #cardArea .idc-b')) {
        const url = await htmlToImage.toPng(el, { pixelRatio: 3, cacheBust: true });
        out.push(url);
      }
      // stack front + back vertically in one PNG
      const imgs = await Promise.all(out.map((u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; })));
      const w = Math.max(...imgs.map((i) => i.width)), gap = 60, h = imgs.reduce((a, i) => a + i.height, 0) + gap * (imgs.length + 1);
      const c = document.createElement('canvas'); c.width = w + gap * 2; c.height = h; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      let y = gap; imgs.forEach((i) => { x.drawImage(i, gap, y); y += i.height + gap; });
      const a = document.createElement('a'); a.download = 'BMM-member-card.png'; a.href = c.toDataURL('image/png'); a.click();
    } catch (e) { alert('कार्ड डाउनलोड नहीं हो सका — कृपया "प्रिंट" का उपयोग करें।'); }
    btn.disabled = false; btn.textContent = t;
  });
})();
