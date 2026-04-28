/* Landing page only — section loaders. */
(() => {
  function courseCard(c) {
    const priceLabel = c.is_paid ? window.fmtPrice(c.price_cents, c.currency) : 'Free';
    const priceClass = c.is_paid ? 'paid' : 'free';
    return `
      <a class="card" href="/courses/${escapeHtml(c.slug)}">
        <div class="card-accent course"></div>
        <div class="card-body">
          <span class="card-type course">course</span>
          <h3 class="card-title">${escapeHtml(c.title)}</h3>
          <p class="card-desc">${escapeHtml(c.subtitle || '')}</p>
          <div class="card-meta">
            <span class="card-meta-item">${escapeHtml(c.difficulty || '')}</span>
            ${c.lesson_count != null ? `<span class="card-meta-item">${c.lesson_count} lessons</span>` : ''}
            <span class="badge ${priceClass}">${priceLabel}</span>
          </div>
          <span class="card-cta">Open course</span>
        </div>
      </a>`;
  }

  function challengeCard(c) {
    const diff = (c.difficulty || 'easy').toLowerCase();
    return `
      <a class="card" href="/challenges/${escapeHtml(c.slug)}">
        <div class="card-accent challenge"></div>
        <div class="card-body">
          <span class="card-type challenge">${escapeHtml(c.category)}</span>
          <h3 class="card-title">${escapeHtml(c.title)}</h3>
          <div class="card-meta">
            <span class="badge ${diff}">${escapeHtml(c.difficulty)}</span>
            <span class="card-meta-item">${c.points} pts</span>
            <span class="card-meta-item">${c.solves || 0} solves</span>
            ${c.solved ? '<span class="badge solved">solved</span>' : ''}
          </div>
        </div>
      </a>`;
  }

  function postCard(p) {
    return `
      <a class="card" href="/blog/${escapeHtml(p.slug)}">
        <div class="card-accent blog"></div>
        <div class="card-body">
          <span class="card-type blog">${escapeHtml(p.kind || 'post')}</span>
          <h3 class="card-title">${escapeHtml(p.title)}</h3>
          <p class="card-desc">${escapeHtml(p.excerpt || '')}</p>
          <div class="card-meta">
            ${(p.tags || '').split(',').filter(Boolean).slice(0, 3)
              .map((t) => `<span class="card-meta-item">#${escapeHtml(t.trim())}</span>`).join('')}
            <span class="card-meta-item dim">${window.fmtRelative(p.published_at)}</span>
          </div>
          <span class="card-cta">Read</span>
        </div>
      </a>`;
  }

  async function load(url) {
    try { return await window.api.get(url); } catch { return null; }
  }

  async function loadCourses() {
    const grid = document.getElementById('coursesGrid');
    if (!grid) return;
    const data = await load('/api/courses');
    const items = (data?.courses || []).slice(0, 3);
    grid.innerHTML = items.length
      ? items.map(courseCard).join('')
      : `<div class="empty"><h3>No courses yet</h3><p>Run <code>npm run db:init</code> to seed.</p></div>`;
  }

  async function loadChallenges() {
    const grid = document.getElementById('challengesGrid');
    if (!grid) return;
    const data = await load('/api/challenges');
    const items = (data?.challenges || []).slice(0, 4);
    grid.innerHTML = items.length
      ? items.map(challengeCard).join('')
      : `<div class="empty"><h3>No challenges yet</h3></div>`;
  }

  async function loadPosts() {
    const grid = document.getElementById('postsGrid');
    if (!grid) return;
    const data = await load('/api/posts');
    const items = (data?.posts || []).slice(0, 3);
    grid.innerHTML = items.length
      ? items.map(postCard).join('')
      : `<div class="empty"><h3>No posts yet</h3></div>`;
  }

  async function loadLeaderboard() {
    const lb = document.getElementById('leaderboard');
    if (!lb) return;
    const data = await load('/api/challenges/leaderboard/top');
    const rows = (data?.leaderboard || []).slice(0, 5);
    lb.innerHTML = `
      <div class="lb-row head">
        <div>#</div><div>User</div>
        <div style="text-align:right">Solves</div>
        <div style="text-align:right">Score</div>
      </div>`;
    if (!rows.length) {
      lb.insertAdjacentHTML('beforeend',
        `<div class="lb-row"><div class="lb-rank">—</div><div class="lb-user muted">No solves yet. Be the first.</div><div class="lb-solves">—</div><div class="lb-score">—</div></div>`);
      return;
    }
    rows.forEach((r, i) => {
      lb.insertAdjacentHTML('beforeend', `
        <div class="lb-row">
          <div class="lb-rank">${String(i + 1).padStart(2, '0')}</div>
          <div class="lb-user">${escapeHtml(r.display_name || r.username)}</div>
          <div class="lb-solves">${r.solves}</div>
          <div class="lb-score">${r.score}</div>
        </div>`);
    });
  }

  function animateTo(el, target, duration = 1100) {
    if (!el || target == null) return;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(ease(t) * target));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  async function loadStats() {
    const [c, ch, p] = await Promise.all([
      load('/api/courses'), load('/api/challenges'), load('/api/posts'),
    ]);
    const targets = {
      courses:    c?.courses?.length,
      challenges: ch?.challenges?.length,
      writeups:   p?.posts?.length,
    };

    const items = Object.entries(targets)
      .map(([k, v]) => [document.querySelector(`[data-stat="${k}"]`), v])
      .filter(([el, v]) => el && v != null);
    items.forEach(([el]) => (el.textContent = '0'));

    if (!('IntersectionObserver' in window)) {
      items.forEach(([el, v]) => animateTo(el, v));
      return;
    }
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !seen.has(e.target)) {
          seen.add(e.target);
          const v = items.find(([el]) => el === e.target)?.[1];
          animateTo(e.target, v);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    items.forEach(([el]) => io.observe(el));
  }

  // Hero typewriter rotator
  function startRotator() {
    const el = document.getElementById('heroRotator');
    if (!el) return;
    const phrases = [
      'AI red-teaming',
      'LLM application security',
      'web app pentesting',
      'CTF challenge authoring',
      'training engineering teams',
    ];
    let phraseIdx = 0;
    let charIdx   = phrases[0].length;
    let deleting  = false;
    let pause     = 0;
    el.textContent = phrases[0];

    function tick() {
      if (pause > 0) { pause--; return setTimeout(tick, 60); }
      const cur = phrases[phraseIdx];
      if (!deleting) {
        if (charIdx < cur.length) {
          charIdx++;
          el.textContent = cur.slice(0, charIdx);
          setTimeout(tick, 60);
        } else {
          pause = 24; // hold for ~1.4s
          deleting = true;
          tick();
        }
      } else {
        if (charIdx > 0) {
          charIdx--;
          el.textContent = cur.slice(0, charIdx);
          setTimeout(tick, 30);
        } else {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
          setTimeout(tick, 200);
        }
      }
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setTimeout(tick, 2400);
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  }

  async function loadTestimonials() {
    const grid = document.getElementById('testimonialsGrid');
    if (!grid) return;
    const data = await load('/api/social/testimonials');
    const items = (data?.testimonials || []).slice(0, 3);
    if (!items.length) { grid.innerHTML = `<div class="empty"><h3>No testimonials yet</h3></div>`; return; }
    grid.innerHTML = items.map((t) => `
      <div class="testimonial">
        <div class="stars" data-rating="${t.rating || 5}">${'★'.repeat(t.rating || 5)}${'☆'.repeat(5 - (t.rating || 5))}</div>
        <p class="testimonial-quote">"${escapeHtml(t.quote)}"</p>
        <div class="testimonial-author">
          <span class="testimonial-avatar">${escapeHtml(initials(t.author_name))}</span>
          <div>
            <div class="testimonial-name">${escapeHtml(t.author_name)}</div>
            <div class="testimonial-meta">${escapeHtml([t.author_title, t.author_company].filter(Boolean).join(' · '))}</div>
          </div>
        </div>
      </div>`).join('');
  }

  function wireHeroNewsletter() {
    const form = document.getElementById('heroNlForm');
    if (!form) return;
    const msg = document.getElementById('hero-nl-msg');
    const btn = document.getElementById('hero-nl-submit');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('hero-nl-email').value.trim();
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
  }

  // ---- Compete section: today's daily, live event, featured pro lab ----
  function escapeHtmlCompete(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function relCountdown(targetMs) {
    const diff = targetMs - Date.now();
    const abs = Math.abs(diff) / 1000;
    const d = Math.floor(abs / 86400);
    const h = Math.floor((abs % 86400) / 3600);
    const m = Math.floor((abs % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function loadCompete() {
    const grid = document.getElementById('competeGrid');
    if (!grid) return;
    let dailyHtml = '', liveHtml = '', labHtml = '';

    try {
      const r = await window.api.get('/api/daily/today');
      if (r.challenge) {
        dailyHtml = `
          <a class="card compete-card" href="/daily">
            <div class="compete-eyebrow" style="color: var(--accent);">// daily challenge</div>
            <h3 class="compete-title">${escapeHtmlCompete(r.challenge.title)}</h3>
            <div class="compete-meta">${r.challenge.category} · ${r.challenge.difficulty} · ${r.challenge.points}+${r.bonus_points} pts</div>
            <div class="compete-cta">Solve today →</div>
          </a>`;
      }
    } catch {}

    try {
      const r = await window.api.get('/api/ctf-events');
      const live = r.events.find((e) => e.status === 'live') || r.events.find((e) => e.status === 'upcoming');
      if (live) {
        const target = live.status === 'live' ? Date.parse(live.ends_at) : Date.parse(live.starts_at);
        const labelTop = live.status === 'live' ? '🔴 live now' : 'upcoming';
        const labelBottom = live.status === 'live' ? `ends in ${relCountdown(target)}` : `starts in ${relCountdown(target)}`;
        liveHtml = `
          <a class="card compete-card" href="/live/${live.slug}">
            <div class="compete-eyebrow" style="color: var(--terminal,#39ff7a);">// ${labelTop}</div>
            <h3 class="compete-title">${escapeHtmlCompete(live.title)}</h3>
            <div class="compete-meta">${live.challenge_count} challenges · ${live.participants} in</div>
            <div class="compete-cta">${labelBottom} →</div>
          </a>`;
      }
    } catch {}

    try {
      const r = await window.api.get('/api/pro-labs');
      const lab = r.labs[0];
      if (lab) {
        labHtml = `
          <a class="card compete-card" href="/pro-labs/${lab.slug}">
            <div class="compete-eyebrow" style="color: var(--medium,#ffb74d);">// pro lab</div>
            <h3 class="compete-title">${escapeHtmlCompete(lab.title)}</h3>
            <div class="compete-meta">${lab.machine_count} machines · ${lab.difficulty || 'mixed'}</div>
            <div class="compete-cta">Pwn the network →</div>
          </a>`;
      }
    } catch {}

    const cards = [dailyHtml, liveHtml, labHtml].filter(Boolean);
    grid.innerHTML = cards.length ? cards.join('') :
      '<div class="card" style="padding:1.25rem;"><p class="dim">Nothing to compete in right now.</p></div>';
  }

  async function loadSiteSettings() {
    try {
      const r = await window.api.get('/api/site-settings');
      const s = r.settings;
      // Plain text replacements
      document.querySelectorAll('[data-site]').forEach((el) => {
        const k = el.dataset.site;
        if (s[k]) el.textContent = s[k];
      });
      // CTA href overrides
      document.querySelectorAll('[data-site-href]').forEach((a) => {
        const k = a.dataset.siteHref;
        if (s[k]) a.setAttribute('href', s[k]);
      });
    } catch {} // Silently fall back to default DOM text
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadSiteSettings();
    loadCourses();
    loadChallenges();
    loadPosts();
    loadLeaderboard();
    loadStats();
    loadTestimonials();
    loadCompete();
    startRotator();
    wireHeroNewsletter();
  });
})();
