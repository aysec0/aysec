(() => {
  function fmtPrice(cents) {
    return cents
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
      : 'Free';
  }
  function fmtHours(min) {
    const h = Math.round(min / 60);
    return h ? `${h}h` : `${min}m`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('tracksGrid');
    try {
      const { tracks } = await window.api.get('/api/tracks');
      if (!tracks?.length) {
        grid.innerHTML = `<div class="empty"><h3>No tracks yet</h3></div>`;
        return;
      }
      grid.innerHTML = tracks.map((t) => {
        const savings = t.sum_price_cents > t.bundle_price_cents
          ? t.sum_price_cents - t.bundle_price_cents : 0;
        const savePct = savings ? Math.round((savings / t.sum_price_cents) * 100) : 0;
        return `
          <a class="track-card" href="/tracks/${escapeHtml(t.slug)}" data-track="${escapeHtml(t.slug)}">
            <span class="track-eyebrow">// learning path</span>
            <h3 class="track-title">${escapeHtml(t.title)}</h3>
            <p class="track-subtitle">${escapeHtml(t.subtitle || '')}</p>
            <p class="muted" style="font-size:0.92rem; line-height:1.55;">${escapeHtml(t.description || '')}</p>
            <div class="track-meta">
              <span class="track-meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${t.course_count} course${t.course_count === 1 ? '' : 's'}
              </span>
              <span class="track-meta-item">${t.lesson_count} lessons</span>
              <span class="track-meta-item">~${fmtHours(t.total_minutes)}</span>
              <span class="track-meta-item" style="margin-left:auto; color:var(--text); font-weight:600;">
                ${fmtPrice(t.bundle_price_cents)}
                ${savings ? `<span class="track-savings">save ${savePct}%</span>` : ''}
              </span>
            </div>
            <span class="track-cta">Open path</span>
          </a>`;
      }).join('');
    } catch {
      grid.innerHTML = `<div class="empty"><h3>Could not load tracks</h3></div>`;
    }
  });
})();
