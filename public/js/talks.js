(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('talksList');
    try {
      const { talks } = await window.api.get('/api/social/talks');
      if (!talks || !talks.length) {
        list.innerHTML = `<div class="empty"><h3>No talks yet</h3><p>The page will populate as engagements ship.</p></div>`;
        return;
      }
      list.innerHTML = talks.map((t) => {
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
    } catch {
      list.innerHTML = `<div class="empty"><h3>Could not load talks</h3></div>`;
    }
  });
})();
