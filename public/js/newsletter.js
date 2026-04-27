(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    // Show subscriber count if any
    try {
      const { subscribers } = await window.api.get('/api/newsletter/stats');
      const c = document.getElementById('nl-count');
      if (c && subscribers >= 25) c.textContent = `${subscribers.toLocaleString()} readers and counting.`;
    } catch {}

    const form = document.getElementById('nlForm');
    const msg = document.getElementById('nl-msg');
    const btn = document.getElementById('nl-submit');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('nl-email').value.trim();
      if (!email) return;
      btn.disabled = true;
      const idle = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        await window.api.post('/api/newsletter/subscribe', { email, source: 'landing' });
        form.reset();
        msg.textContent = '✓ Subscribed. Check your inbox in a moment.';
        msg.style.color = 'var(--terminal)';
      } catch (err) {
        msg.textContent = err.message || 'Subscribe failed.';
        msg.style.color = 'var(--hard)';
      } finally {
        btn.disabled = false;
        btn.textContent = idle;
      }
    });
  });
})();
