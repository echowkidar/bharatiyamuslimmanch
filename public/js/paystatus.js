(() => {
  const box = document.getElementById('payBox'); if (!box) return;
  let n = 0;
  const poll = async () => {
    n++;
    try {
      const r = await fetch(`/api/pay/state/${box.dataset.order}?k=${box.dataset.k}`); const j = await r.json();
      if (j.status === 'success' || j.status === 'failed') return location.reload();
    } catch (e) { /* retry */ }
    if (n < 60) setTimeout(poll, 3000);
  };
  setTimeout(poll, 2500);
})();
