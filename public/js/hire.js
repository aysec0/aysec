(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contactForm');
    if (!form) return;

    // Pre-fill subject if ?topic= is present
    const topic = new URL(location.href).searchParams.get('topic');
    if (topic) {
      const map = {
        team:    'Team licenses for the training site',
        pentest: 'Web app pentest',
        ai:      'AI / LLM red-team engagement',
        speaker: 'Speaking invitation',
      };
      const subj = document.getElementById('cf-subject');
      if (subj && map[topic]) subj.value = map[topic];
    }

    const alertEl = document.getElementById('contactAlert');
    const btn = document.getElementById('cf-submit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertEl.hidden = true;
      const data = {
        name:    form.name.value.trim(),
        email:   form.email.value.trim(),
        subject: form.subject.value.trim(),
        message: form.message.value.trim(),
      };
      if (!data.name || !data.email || !data.message) {
        alertEl.hidden = false;
        alertEl.className = 'alert error';
        alertEl.textContent = 'Name, email, and message are required.';
        return;
      }
      btn.disabled = true;
      const idle = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span> Sending…';
      try {
        await window.api.post('/api/social/contact', data);
        alertEl.hidden = false;
        alertEl.className = 'alert ok';
        alertEl.textContent = 'Sent — I\'ll reply within 1 business day.';
        form.reset();
      } catch (err) {
        alertEl.hidden = false;
        alertEl.className = 'alert error';
        alertEl.textContent = err.message || 'Could not send.';
      } finally {
        btn.disabled = false;
        btn.textContent = idle;
      }
    });
  });
})();
