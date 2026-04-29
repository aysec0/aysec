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

  // Sanitize markdown HTML before insertion (description / topics / tips often
  // come from admin markdown which marked.parse renders to HTML server-side).
  function safeHtml(html) {
    if (!html) return '';
    return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const { certification: c, courses, challenges, modules, summary } = await window.api.get(`/api/certifications/${slug}`);

      document.title = `${c.cert_name} prep — aysec`;
      document.getElementById('crumbSlug').textContent = c.slug;
      document.getElementById('certHeadEyebrow').innerHTML =
        `<span class="page-eyebrow">// ${escapeHtml(c.cert_name)} prep</span>`;
      document.getElementById('certShortName').textContent = c.cert_name;
      document.getElementById('certFullName').textContent  = c.cert_full_name || '';
      document.getElementById('certTagline').textContent = c.tagline || '';

      // Description
      document.getElementById('certDescription').innerHTML = safeHtml(c.description_html);

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
        document.getElementById('certTips').innerHTML = safeHtml(c.exam_tips_html);
      }

      // Week-by-week syllabus modules
      if (modules?.length) renderModules(modules, summary);

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

  // ---- Week-by-week syllabus rendering ----
  function renderModules(modules, summary) {
    const section = document.getElementById('modulesSection');
    if (!section) return;
    section.hidden = false;

    // localStorage fallback for anonymous users
    const localKey = `cert.${slug}.completed`;
    const local = new Set(JSON.parse(localStorage.getItem(localKey) || '[]'));

    function isDone(m) { return m.completed || local.has(m.id); }
    function setDone(m, done) {
      m.completed = done;
      if (done) local.add(m.id); else local.delete(m.id);
      localStorage.setItem(localKey, JSON.stringify([...local]));
    }

    function progress() {
      const done = modules.filter(isDone).length;
      const total = modules.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const wrap = document.getElementById('modulesProgress');
      const fill = document.getElementById('modulesProgressFill');
      const meta = document.getElementById('modulesProgressMeta');
      if (wrap) wrap.hidden = false;
      if (fill) fill.style.width = `${pct}%`;
      if (meta) meta.textContent = `${done} of ${total} done · ${pct}%`;
    }

    const grid = document.getElementById('certModules');
    grid.innerHTML = modules.map((m, i) => `
      <article class="cert-module ${isDone(m) ? 'is-done' : ''}" data-id="${m.id}">
        <header class="cert-module-head">
          <label class="cert-module-check" title="Mark week complete">
            <input type="checkbox" data-toggle="${m.id}" ${isDone(m) ? 'checked' : ''} />
            <span class="cert-module-check-box"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
          </label>
          <div class="cert-module-head-text">
            <span class="cert-module-week">Week ${m.week_num}</span>
            <h3 class="cert-module-title">${escapeHtml(m.title)}</h3>
            ${m.goal ? `<p class="cert-module-goal">${escapeHtml(m.goal)}</p>` : ''}
          </div>
          <button class="cert-module-toggle" aria-label="Expand" data-expand="${m.id}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </header>
        <div class="cert-module-body" hidden>
          ${m.topics_html       ? `<section class="cert-module-block"><h4>Topics &amp; commands</h4><div class="prose">${safeHtml(m.topics_html)}</div></section>` : ''}
          ${m.daily_tasks_html  ? `<section class="cert-module-block"><h4>Daily checklist</h4><div class="prose">${safeHtml(m.daily_tasks_html)}</div></section>` : ''}
          ${m.lab_targets_html  ? `<section class="cert-module-block"><h4>Lab targets this week</h4><div class="prose">${safeHtml(m.lab_targets_html)}</div></section>` : ''}
          ${m.resources_html    ? `<section class="cert-module-block"><h4>Resources</h4><div class="prose">${safeHtml(m.resources_html)}</div></section>` : ''}
        </div>
      </article>`).join('');

    // Wire expand toggles + completion checkboxes
    grid.querySelectorAll('[data-expand]').forEach((b) => {
      b.addEventListener('click', () => {
        const card = b.closest('.cert-module');
        const body = card.querySelector('.cert-module-body');
        body.hidden = !body.hidden;
        b.classList.toggle('is-open', !body.hidden);
      });
    });
    // Click anywhere in head except the checkbox toggles expand
    grid.querySelectorAll('.cert-module-head').forEach((h) => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('.cert-module-check') || e.target.closest('[data-expand]')) return;
        h.querySelector('[data-expand]')?.click();
      });
    });
    grid.querySelectorAll('[data-toggle]').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const id = Number(cb.dataset.toggle);
        const m = modules.find((x) => x.id === id);
        const card = cb.closest('.cert-module');
        const done = cb.checked;
        setDone(m, done);
        card.classList.toggle('is-done', done);
        progress();
        // Best-effort server-side persistence (silent if not signed in)
        try {
          await window.api.post(`/api/certifications/modules/${id}/toggle`, { completed: done });
        } catch (err) {
          if (err.status !== 401) window.toast?.(err.message || 'sync failed', 'error');
        }
      });
    });
    progress();
  }
})();
