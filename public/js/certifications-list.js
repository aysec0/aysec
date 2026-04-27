(() => {
  function fmtPrice(cents, currency = 'USD') {
    if (!cents) return '—';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 })
      .format(cents / 100);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('certsGrid');
    try {
      const { certifications } = await window.api.get('/api/certifications');
      if (!certifications?.length) {
        grid.innerHTML = `<div class="empty"><h3>No cert paths yet</h3></div>`;
        return;
      }
      grid.innerHTML = certifications.map((c) => `
        <a class="cert-card" href="/certifications/${escapeHtml(c.slug)}" data-issuer="${escapeHtml(c.cert_issuer)}">
          <div class="cert-card-top">
            <div>
              <div class="cert-name">${escapeHtml(c.cert_name)}</div>
              <div class="cert-issuer">${escapeHtml(c.cert_issuer)}</div>
            </div>
            <div class="cert-cost">
              <span class="cert-cost-label">Exam fee</span>
              <span class="cert-cost-amount">${fmtPrice(c.exam_cost_cents, c.exam_currency || 'USD')}</span>
            </div>
          </div>
          <p class="cert-fullname">${escapeHtml(c.cert_full_name || '')}</p>
          <p class="cert-tagline">${escapeHtml(c.tagline || '')}</p>
          <div class="cert-meta">
            <span class="cert-difficulty" data-d="${escapeHtml(c.difficulty || 'intermediate')}">${escapeHtml(c.difficulty || '—')}</span>
            <span class="cert-meta-item">${escapeHtml(c.duration_estimate || '')}</span>
            <span class="cert-meta-item" style="margin-left:auto;">${c.course_count} course${c.course_count === 1 ? '' : 's'} mapped</span>
          </div>
        </a>`).join('');
    } catch {
      grid.innerHTML = `<div class="empty"><h3>Could not load certifications</h3></div>`;
    }
  });
})();
