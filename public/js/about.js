(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    // Recent talks (top 3)
    const talksBox = document.getElementById('recentTalks');
    if (talksBox) {
      try {
        const { talks } = await window.api.get('/api/social/talks');
        const recent = (talks || []).slice(0, 3);
        if (!recent.length) {
          talksBox.innerHTML = `<div class="empty"><p>No talks yet.</p></div>`;
        } else {
          talksBox.innerHTML = recent.map((t) => {
            const d = new Date(t.date + 'T00:00:00Z');
            const month = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
            const titleHtml = t.url
              ? `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">${escapeHtml(t.title)}</a>`
              : escapeHtml(t.title);
            return `
              <div class="talk-item">
                <div class="talk-date">${escapeHtml(month)}</div>
                <div>
                  <div class="talk-title">${titleHtml}</div>
                  <div class="talk-venue">${escapeHtml(t.venue)}</div>
                  ${t.description ? `<div class="talk-desc">${escapeHtml(t.description)}</div>` : ''}
                </div>
                <span class="talk-kind ${escapeHtml(t.kind)}">${escapeHtml(t.kind)}</span>
              </div>`;
          }).join('');
        }
      } catch {
        talksBox.innerHTML = `<div class="empty"><p>Could not load talks.</p></div>`;
      }
    }

    // General FAQs
    const faqBox = document.getElementById('generalFaq');
    if (faqBox) {
      try {
        const { faqs } = await window.api.get('/api/social/faqs?scope=general');
        if (!faqs || !faqs.length) {
          faqBox.innerHTML = `<div class="empty"><p>No FAQs yet.</p></div>`;
        } else {
          faqBox.innerHTML = faqs.map((f) => `
            <details>
              <summary>${escapeHtml(f.question)}</summary>
              <div class="faq-answer">${escapeHtml(f.answer)}</div>
            </details>`).join('');
        }
      } catch {
        faqBox.innerHTML = `<div class="empty"><p>Could not load FAQs.</p></div>`;
      }
    }
  });
})();
