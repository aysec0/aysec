(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const box = document.getElementById('faqBox');
    try {
      const { faqs } = await window.api.get('/api/social/faqs?scope=pricing');
      if (!faqs || !faqs.length) {
        box.innerHTML = `<div class="empty"><p>No FAQs yet.</p></div>`;
        return;
      }
      box.innerHTML = faqs.map((f) => `
        <details>
          <summary>${escapeHtml(f.question)}</summary>
          <div class="faq-answer">${escapeHtml(f.answer)}</div>
        </details>`).join('');
    } catch {
      box.innerHTML = `<div class="empty"><p>Could not load FAQs.</p></div>`;
    }
  });
})();
