(() => {
  const slug = location.pathname.split('/').filter(Boolean)[1];
  function fmtHours(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h)      return `${h}h`;
    return `${m}m`;
  }
  function fmtPrice(cents) {
    return cents
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
      : 'Free';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const headEl   = document.getElementById('trackHead');
    const detailEl = document.getElementById('detailHead');
    const stepsEl  = document.getElementById('trackSteps');
    const crumbEl  = document.getElementById('crumbSlug');
    try {
      const { track, courses, summary } = await window.api.get(`/api/tracks/${slug}`);
      crumbEl.textContent = track.slug;
      document.title = `${track.title} — aysec`;

      const savePct = summary.savings && summary.sum_price_cents
        ? Math.round((summary.savings / summary.sum_price_cents) * 100) : 0;

      headEl.innerHTML = `
        <div class="detail-meta">
          <span class="card-type course">learning path</span>
          <span class="card-meta-item">${courses.length} course${courses.length === 1 ? '' : 's'}</span>
          <span class="card-meta-item">${summary.total_lessons} lessons</span>
          <span class="card-meta-item">~${fmtHours(summary.total_minutes)} of content</span>
        </div>
        <h1 class="detail-title">${escapeHtml(track.title)}</h1>
        <p class="detail-subtitle">${escapeHtml(track.subtitle || '')}</p>
        <p class="muted" style="max-width:680px">${escapeHtml(track.description || '')}</p>`;

      detailEl.innerHTML = `
        <div></div>
        <aside class="detail-side">
          <div class="detail-price">
            <span class="currency">$</span>${(track.bundle_price_cents / 100).toFixed(0)}
            <span class="period" style="display:block; font-size:0.85rem; margin-top:4px; color:var(--text-muted);">bundle, lifetime access</span>
          </div>
          ${summary.savings ? `<div class="alert ok">
            <svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <div>Save <strong>${fmtPrice(summary.savings)}</strong> (${savePct}%) vs buying separately.</div>
          </div>` : ''}
          <a href="/signup?plan=track:${escapeHtml(track.slug)}" class="btn btn-primary btn-block">Get this path</a>
          <div class="detail-features">
            <div class="detail-feature"><span class="check">✓</span> All ${courses.length} courses included</div>
            <div class="detail-feature"><span class="check">✓</span> ${summary.total_lessons} lessons across the bundle</div>
            <div class="detail-feature"><span class="check">✓</span> Per-course completion certificates</div>
            <div class="detail-feature"><span class="check">✓</span> Lifetime access &amp; updates</div>
            <div class="detail-feature"><span class="check">✓</span> 30-day money-back guarantee</div>
          </div>
        </aside>`;

      stepsEl.innerHTML = `
        <h2 class="section-title" style="font-size:1.5rem; margin-top:2rem; margin-bottom:1.25rem;">The path</h2>
        ${courses.map((c, i) => `
          <a class="track-step" href="/courses/${escapeHtml(c.slug)}">
            <span class="track-step-num">${String(i + 1).padStart(2, '0')}</span>
            <div>
              <div class="track-step-title">${escapeHtml(c.title)}</div>
              <div class="track-step-meta">
                <span>${escapeHtml(c.difficulty)}</span>
                <span>${c.lesson_count} lessons</span>
                <span>~${fmtHours(c.total_minutes)}</span>
                <span>${c.is_paid ? fmtPrice(c.price_cents) + ' standalone' : 'Free standalone'}</span>
              </div>
            </div>
            <span class="track-step-arrow">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
          </a>`).join('')}`;
    } catch (err) {
      headEl.innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Track not found')}</div>`;
    }
  });
})();
