(() => {
  const username = location.pathname.split('/').filter(Boolean)[1];

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  }

  function animateNum(el, target, dur = 900) {
    if (!el || target == null) return;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = String(Math.round(ease(t) * target));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderHeatmap(days) {
    const wrap = document.getElementById('profileHeatmap');
    if (!wrap || !days?.length) return;
    const max = Math.max(1, ...days.map((d) => d.count));
    const lvl = (n) => {
      if (n === 0) return 0;
      const p = n / max;
      if (p <= 0.25) return 1;
      if (p <= 0.5)  return 2;
      if (p <= 0.75) return 3;
      return 4;
    };
    const first = new Date(days[0].date + 'T00:00:00Z');
    const offset = first.getUTCDay();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`<span class="heatmap-cell" style="visibility:hidden"></span>`);
    for (const d of days) {
      const l = lvl(d.count);
      const lblDate = new Date(d.date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      cells.push(`<span class="heatmap-cell"${l ? ` data-lvl="${l}"` : ''} title="${escapeHtml(lblDate)} — ${d.count} solve${d.count === 1 ? '' : 's'}"></span>`);
    }
    wrap.innerHTML = cells.join('');
  }

  function renderCategories(rows) {
    const card = document.getElementById('profileCategoryCard');
    const box  = document.getElementById('profileCategoryBars');
    if (!card || !box) return;
    if (!rows?.length) { card.hidden = true; return; }
    card.hidden = false;
    const max = Math.max(...rows.map((r) => r.score), 1);
    box.innerHTML = rows.map((r) => `
      <div class="cat-bar" data-cat="${escapeHtml(r.category)}">
        <div class="cat-bar-name">${escapeHtml(r.category)}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.round((r.score / max) * 100)}%"></div></div>
        <div class="cat-bar-val">${r.score} pts</div>
      </div>`).join('');
  }

  function solveRow(s) {
    const d = (s.difficulty || 'easy').toLowerCase();
    return `
      <div class="lb-row" style="grid-template-columns: 1fr 110px 100px 110px; align-items:center;">
        <div>
          <a href="/challenges/${escapeHtml(s.slug)}" style="color:var(--text); font-weight:500;">${escapeHtml(s.title)}</a>
          <div class="dim" style="font-size:0.78rem; font-family:var(--font-mono); margin-top:2px;">${escapeHtml(s.category)}</div>
        </div>
        <div><span class="badge ${d}">${escapeHtml(s.difficulty)}</span></div>
        <div class="lb-score">+${s.points} pts</div>
        <div class="lb-score dim">${window.fmtRelative(s.solved_at)}</div>
      </div>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let data;
    try {
      data = await window.api.get(`/api/users/${encodeURIComponent(username)}`);
    } catch (err) {
      document.getElementById('profileHero').innerHTML = `
        <div></div>
        <div>
          <h1 class="profile-name">User not found</h1>
          <div class="profile-handle">@${escapeHtml(username)}</div>
          <p class="profile-bio">${escapeHtml(err.message || 'No public profile at this handle.')}</p>
        </div>`;
      return;
    }

    const { user, stats, level, categories, recentSolves, certificates, heatmap } = data;
    document.title = `${user.display_name || user.username} — aysec`;

    const lvlBadge = level && level.current ? (() => {
      const isRainbow = level.current.color === 'rainbow';
      const cls = `tier-badge ${isRainbow ? 'tier-rainbow' : ''}`;
      const style = isRainbow ? '' : `style="--tier-c: ${level.current.color};"`;
      const icon = (window.tierIcon && level.current.icon) ? `<span class="tier-icon">${window.tierIcon(level.current.icon)}</span>` : '';
      return `<a class="${cls}" href="/levels" ${style}>
        <span class="tier-num">${icon}Lv ${level.level_idx + 1}</span>
        ${escapeHtml(level.current.name)}
      </a>`;
    })() : '';

    const profileUrl = location.href;
    document.getElementById('profileHero').innerHTML = `
      <div class="profile-avatar">${escapeHtml(initials(user.display_name || user.username))}</div>
      <div>
        <h1 class="profile-name">${escapeHtml(user.display_name || user.username)}</h1>
        <div class="profile-handle" style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
          @${escapeHtml(user.username)}
          ${lvlBadge}
        </div>
        ${user.bio ? `<p class="profile-bio">${escapeHtml(user.bio)}</p>` : ''}
        <div class="profile-since">Member since ${escapeHtml(window.fmtDate(user.member_since))}</div>
      </div>
      <div class="profile-share">
        <button class="btn btn-ghost" id="profileCopyBtn">Copy link</button>
        <a class="btn btn-ghost" target="_blank" rel="noopener"
           href="https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out @${user.username}'s aysec profile`)}&url=${encodeURIComponent(profileUrl)}">Share on X</a>
      </div>`;

    document.getElementById('profileCopyBtn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(profileUrl);
        const b = document.getElementById('profileCopyBtn');
        const idle = b.textContent;
        b.textContent = '✓ Copied';
        setTimeout(() => (b.textContent = idle), 1500);
      } catch {}
    });

    // Stats grid
    const statsEl = document.getElementById('profileStats');
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">Score</div>
        <div class="stat-card-value counter" id="pfScore">0</div>
        <div class="stat-card-foot">CTF points</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Solves</div>
        <div class="stat-card-value counter" id="pfSolves">0</div>
        <div class="stat-card-foot">Challenges done</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Rank</div>
        <div class="stat-card-value">${stats.solves ? '#' + stats.rank : '—'}</div>
        <div class="stat-card-foot">All-time</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">First bloods</div>
        <div class="stat-card-value counter" id="pfFb">0</div>
        <div class="stat-card-foot">Challenges led</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Daily streak</div>
        <div class="stat-card-value">
          <span style="color: var(--accent);">${(stats.streak?.current ?? 0)}</span>
          <span class="dim" style="font-size:1rem; font-weight:500;">d</span>
        </div>
        <div class="stat-card-foot">Longest ${stats.streak?.longest ?? 0}d · ${stats.daily_solves ?? 0} dailies solved</div>
      </div>`;
    animateNum(document.getElementById('pfScore'),  stats.score);
    animateNum(document.getElementById('pfSolves'), stats.solves);
    animateNum(document.getElementById('pfFb'),     stats.firstBloods);

    renderHeatmap(heatmap);
    renderCategories(categories);

    // Skill DNA preview card
    const dnaCard = document.getElementById('dnaPreviewCard');
    const dnaPreview = document.getElementById('dnaPreviewSvg');
    if (dnaCard && dnaPreview && window.SkillDNA) {
      dnaCard.href = `/u/${encodeURIComponent(user.username)}/dna`;
      dnaPreview.innerHTML = window.SkillDNA.render({
        username: user.username,
        allSolves: data.allSolves || [],
        certs: certificates.length,
        level: level?.level_idx || 0,
        tierColor: level?.current?.color || '#4d9aff',
        streak: stats?.streak?.current ?? 0,
      }, { size: 220, preview: true });
    }

    // Certificates
    const certSec = document.getElementById('profileCertsSection');
    const certBox = document.getElementById('profileCerts');
    if (certificates.length) {
      certSec.hidden = false;
      certBox.innerHTML = certificates.map((c) => `
        <a class="card" href="/cert/${escapeHtml(c.code)}">
          <div class="card-accent course"></div>
          <div class="card-body">
            <span class="card-type course">certificate</span>
            <h3 class="card-title">${escapeHtml(c.course_title)}</h3>
            <div class="card-meta">
              <span class="card-meta-item">issued ${escapeHtml(window.fmtDate(c.issued_at))}</span>
            </div>
            <span class="card-cta">View &amp; share</span>
          </div>
        </a>`).join('');
    }

    // Recent solves
    const solvesBox = document.getElementById('profileSolves');
    if (!recentSolves.length) {
      solvesBox.innerHTML = `<div class="empty"><p>No solves yet.</p></div>`;
    } else {
      solvesBox.innerHTML = `
        <div class="leaderboard">
          <div class="lb-row head" style="grid-template-columns: 1fr 110px 100px 110px;">
            <div>Challenge</div><div>Difficulty</div>
            <div style="text-align:right">Points</div>
            <div style="text-align:right">When</div>
          </div>
          ${recentSolves.map(solveRow).join('')}
        </div>`;
    }
  });
})();
