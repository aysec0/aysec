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

    const { user, stats, level, categories, recentSolves, certificates, heatmap, timeline } = data;
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

    // Resolve social handles → real URLs. Bare handles get the platform's
    // canonical URL prefix; full https:// URLs pass through.
    function socialUrl(kind, value) {
      if (!value) return null;
      if (value.startsWith('https://')) return value;
      if (kind === 'github')   return `https://github.com/${value}`;
      if (kind === 'twitter')  return `https://x.com/${value}`;
      if (kind === 'linkedin') return `https://www.linkedin.com/in/${value}`;
      return null;
    }
    const socials = [
      ['github',  user.social_github,  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.4.5 0 5.9 0 12.5c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.2-.1-.3-.6-1.6.1-3.3 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.6 3.3-1.2 3.3-1.2.7 1.7.2 3 .1 3.3.8.9 1.3 2 1.3 3.2 0 4.6-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.8-1.6 8.2-6.1 8.2-11.4C24 5.9 18.6.5 12 .5z"/></svg>'],
      ['twitter', user.social_twitter, '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21l-6.522 7.452L22 22h-6.86l-4.79-6.27L4.8 22H2l7.005-7.99L2 2h7.05l4.31 5.69L18.245 2zm-1.205 18h1.876L7.04 4H5.05l11.989 16z"/></svg>'],
      ['linkedin',user.social_linkedin,'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5V5c0-2.761-2.238-5-5-5zM8 19H5V8h3v11zM6.5 6.732C5.529 6.732 4.75 5.945 4.75 4.974c0-.97.78-1.758 1.75-1.758 0.97 0 1.75.787 1.75 1.758 0 0.971-0.781 1.758-1.75 1.758zM20 19h-3v-5.604c0-3.368-4-3.113-4 0V19h-3V8h3v1.765c1.396-2.586 7-2.777 7 2.476V19z"/></svg>'],
      ['website', user.social_website, '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'],
    ].map(([kind, val, icon]) => {
      const u = socialUrl(kind, val);
      if (!u) return '';
      return `<a class="profile-social" href="${escapeHtml(u)}" target="_blank" rel="noopener nofollow" aria-label="${kind}">${icon}</a>`;
    }).join('');

    const banner = user.banner_url ? `<div class="profile-banner" style="background-image:url('${escapeHtml(user.banner_url)}');"></div>` : '';

    document.getElementById('profileHero').innerHTML = `
      ${banner}
      <div class="profile-avatar">${escapeHtml(initials(user.display_name || user.username))}</div>
      <div>
        <h1 class="profile-name">${escapeHtml(user.display_name || user.username)}</h1>
        <div class="profile-handle" style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
          @${escapeHtml(user.username)}
          ${lvlBadge}
        </div>
        ${user.bio ? `<p class="profile-bio">${escapeHtml(user.bio)}</p>` : ''}
        ${socials ? `<div class="profile-socials">${socials}</div>` : ''}
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

    // Achievements timeline (notifications of cert/achievement/first_blood/level_up)
    const tl = timeline || [];
    const tlSec = document.getElementById('profileTimelineSection');
    const tlBox = document.getElementById('profileTimeline');
    if (tl.length && tlSec && tlBox) {
      tlSec.hidden = false;
      tlBox.innerHTML = tl.map((t) => `
        <li class="profile-tl-item" data-kind="${escapeHtml(t.kind)}">
          <span class="profile-tl-dot"></span>
          <div>
            <div class="profile-tl-title">${escapeHtml(t.title)}</div>
            ${t.body ? `<div class="profile-tl-body">${escapeHtml(t.body)}</div>` : ''}
            <div class="profile-tl-when">${escapeHtml(window.fmtRelative ? window.fmtRelative(t.created_at) : t.created_at)}${t.link ? ` · <a href="${escapeHtml(t.link)}">open →</a>` : ''}</div>
          </div>
        </li>`).join('');
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
