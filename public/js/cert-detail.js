(() => {
  const slug = location.pathname.split('/').filter(Boolean)[1];

  function fmtPrice(cents, currency = 'USD') {
    if (cents == null) return '—';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 })
      .format(cents / 100);
  }
  function fmtHours(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h)      return `${h}h`;
    return `${m}m`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const { certification: c, courses, challenges, summary } = await window.api.get(`/api/certifications/${slug}`);

      document.title = `${c.cert_name} prep — aysec`;
      document.getElementById('crumbSlug').textContent = c.slug;
      document.getElementById('certHeadEyebrow').innerHTML =
        `<span class="page-eyebrow">// ${escapeHtml(c.cert_name)} prep</span>`;
      document.getElementById('certShortName').textContent = c.cert_name;
      document.getElementById('certFullName').textContent  = c.cert_full_name || '';
      document.getElementById('certTagline').textContent = c.tagline || '';

      // Description
      document.getElementById('certDescription').innerHTML = c.description_html || '';

      // Side panel
      document.getElementById('certSide').innerHTML = `
        <div class="cert-hero-row">
          <span class="cert-hero-key">Issuer</span>
          <span class="cert-hero-val">${escapeHtml(c.cert_issuer)}</span>
        </div>
        <div class="cert-hero-row">
          <span class="cert-hero-key">Exam fee</span>
          <span class="cert-hero-val">${fmtPrice(c.exam_cost_cents, c.exam_currency || 'USD')}</span>
        </div>
        <div class="cert-hero-row">
          <span class="cert-hero-key">Difficulty</span>
          <span class="cert-hero-val"><span class="cert-difficulty" data-d="${escapeHtml(c.difficulty || 'intermediate')}">${escapeHtml(c.difficulty || '—')}</span></span>
        </div>
        <div class="cert-hero-row">
          <span class="cert-hero-key">Prep duration</span>
          <span class="cert-hero-val">${escapeHtml(c.duration_estimate || '—')}</span>
        </div>
        <div class="cert-hero-row">
          <span class="cert-hero-key">Path content</span>
          <span class="cert-hero-val">${courses.length} courses · ${summary.total_lessons} lessons</span>
        </div>
        <div class="cert-hero-row">
          <span class="cert-hero-key">Total study time</span>
          <span class="cert-hero-val">~${fmtHours(summary.total_minutes)}</span>
        </div>
        ${c.exam_url ? `
          <a href="${escapeHtml(c.exam_url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-block" style="margin-top:0.5rem;">
            Official cert page →
          </a>` : ''}
        <a href="/signup" class="btn btn-primary btn-block">Start prepping</a>`;

      // What covers / uncovers — render as chip cloud when the seed text uses `·` separators,
      // otherwise fall back to the rendered markdown HTML.
      function renderCoverage(text, htmlFallback) {
        const raw = (text || '').trim();
        if (raw && raw.includes('·')) {
          const items = raw.split('·').map((s) => s.trim()).filter(Boolean);
          return `<div class="cert-coverage-tags">${
            items.map((it) => `<span class="cert-coverage-tag">${escapeHtml(it)}</span>`).join('')
          }</div>`;
        }
        return htmlFallback || '';
      }
      document.getElementById('certCovers').innerHTML   = renderCoverage(c.what_covered,     c.what_covered_html);
      document.getElementById('certUncovers').innerHTML = renderCoverage(c.what_not_covered, c.what_not_covered_html);

      // Tips — markdown HTML already rendered server-side
      if (c.exam_tips_html) {
        document.getElementById('tipsSection').hidden = false;
        document.getElementById('certTips').innerHTML = c.exam_tips_html;
      }

      // Curriculum
      document.getElementById('curriculumMeta').textContent =
        `${courses.length} courses · ${summary.total_lessons} lessons · ~${fmtHours(summary.total_minutes)} of content` +
        (summary.paid_courses_total_cents ? ` · ${fmtPrice(summary.paid_courses_total_cents)} in paid courses` : '');

      document.getElementById('certCourses').innerHTML = courses.map((co, i) => `
        <a class="cert-step" href="/courses/${escapeHtml(co.slug)}">
          <span class="cert-step-num">${String(i + 1).padStart(2, '0')}</span>
          <div>
            <div class="cert-step-title">${escapeHtml(co.title)}</div>
            ${co.why_relevant ? `<div class="cert-step-why">${escapeHtml(co.why_relevant)}</div>` : ''}
            <div class="cert-step-meta">
              <span>${escapeHtml(co.difficulty)}</span>
              <span>${co.lesson_count} lessons</span>
              <span>~${fmtHours(co.total_minutes)}</span>
              <span>${co.is_paid ? fmtPrice(co.price_cents, co.currency) : 'Free'}</span>
            </div>
          </div>
          <span class="track-step-arrow">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
        </a>`).join('');

      // Aligned challenges
      if (challenges?.length) {
        document.getElementById('challengesSection').hidden = false;
        document.getElementById('certChallenges').innerHTML = challenges.map((ch) => {
          const d = (ch.difficulty || 'easy').toLowerCase();
          return `
            <a class="card" href="/challenges/${escapeHtml(ch.slug)}">
              <div class="card-accent challenge"></div>
              <div class="card-body">
                <span class="card-type challenge">${escapeHtml(ch.category)}</span>
                <h3 class="card-title">${escapeHtml(ch.title)}</h3>
                <div class="card-meta">
                  <span class="badge ${d}">${escapeHtml(ch.difficulty)}</span>
                  <span class="card-meta-item">${ch.points} pts</span>
                </div>
              </div>
            </a>`;
        }).join('');
      }
    } catch (err) {
      document.getElementById('certTitle').textContent = 'Certification not found';
      document.getElementById('certTagline').textContent = err.message || '';
    }
  });
})();
