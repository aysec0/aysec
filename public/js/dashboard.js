/* /dashboard — pro+fun rebuild
   - Time-aware greeting + level + XP + streak
   - Quick actions: continue learning, today's challenge, weekly ring
   - Heatmap (existing), radar chart, category bars, activity feed
   - Achievements + certificates + in-progress courses + recent solves
   - Confetti on milestones
*/
(() => {
  // ---------- Helpers ----------
  function $(id) { return document.getElementById(id); }
  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  }
  function timeOfDay() {
    const h = new Date().getHours();
    if (h < 5)  return { greet: 'Burning the midnight oil',  emoji: '🌙' };
    if (h < 12) return { greet: 'Good morning',              emoji: '☀️' };
    if (h < 17) return { greet: 'Good afternoon',            emoji: '🌤️' };
    if (h < 22) return { greet: 'Good evening',              emoji: '🌆' };
    return        { greet: 'Late-night session',             emoji: '🦉' };
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
  function relTime(s) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + 'Z').getTime();
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)        return 'just now';
    if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w ago`;
    return new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ---------- Confetti (one-shot, milestone-triggered) ----------
  function fireConfetti() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const wrap = document.createElement('div');
    wrap.className = 'confetti';
    const colors = ['var(--accent)', 'var(--ai)', 'var(--terminal)', 'var(--medium)', 'var(--challenge)', 'var(--insane)'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + 'vw';
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (Math.random() * 0.6) + 's';
      s.style.animationDuration = (2.8 + Math.random() * 1.4) + 's';
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 5000);
  }

  function maybeConfetti(stats, level) {
    // Trigger if any of these milestones were just crossed (vs last seen)
    const KEY = 'aysec.dash.last';
    let last = {};
    try { last = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}

    // Detect level-up specifically (full modal, not just confetti)
    const prevIdx = last.level_idx;
    const leveledUp = level && prevIdx != null && level.level_idx > prevIdx;
    if (leveledUp) {
      // Slight delay so the page settles first
      setTimeout(() => showLevelUpModal(level, prevIdx), 700);
    } else {
      // Other one-shot milestones — just confetti
      const milestones = {
        first_solve: stats.solves >= 1,
        ten_solves:  stats.solves >= 10,
        first_blood: stats.firstBloods >= 1,
      };
      let fire = false;
      Object.entries(milestones).forEach(([k, ok]) => {
        if (ok && !last[k]) fire = true;
      });
      if (fire) fireConfetti();
      // Initial visit (no prevIdx and they already have a non-zero level): celebrate
      if (prevIdx == null && level && level.level_idx > 0) fireConfetti();
    }

    try {
      localStorage.setItem(KEY, JSON.stringify({
        first_solve: stats.solves >= 1,
        ten_solves:  stats.solves >= 10,
        first_blood: stats.firstBloods >= 1,
        level_idx:   level?.level_idx,
      }));
    } catch {}
  }

  // ---------- Hero render ----------
  function tierBadge(level, opts = {}) {
    const cur = level.current;
    const isRainbow = cur.color === 'rainbow';
    const cls = `tier-badge ${isRainbow ? 'tier-rainbow' : ''}`;
    const styleAttr = isRainbow ? '' : `style="--tier-c: ${cur.color};"`;
    const tipText = opts.tip || `Lv ${level.level_idx + 1} of ${level.total_levels}. ${cur.tagline || ''}`;
    return `
      <a class="${cls} dash-tip" href="/levels" data-tip="${escapeHtml(tipText)}" ${styleAttr}>
        <span class="tier-num"><span class="tier-icon">${window.tierIcon(cur.icon)}</span>Lv ${level.level_idx + 1}</span>
        ${escapeHtml(cur.name)}
      </a>`;
  }

  function renderHero(user, stats, level) {
    const { greet, emoji } = timeOfDay();
    const name = user.display_name || user.username;
    const next = level.next;
    const xpToNext = next ? Math.max(0, next.min - level.xp) : 0;
    const streakChip = stats.streak > 0
      ? `<span class="streak-pill"><span class="flame">🔥</span> ${stats.streak}-day streak</span>`
      : `<span class="streak-pill" style="background:var(--surface-2); color:var(--text-dim); border-color:var(--border);">no active streak — solve one challenge today</span>`;

    const isRainbow = level.current.color === 'rainbow';
    const tierColor = isRainbow ? 'var(--accent)' : level.current.color;

    const xpb = level.xp_breakdown || {};
    const xpChips = [
      { src: 'ctf',    label: 'ctf',     val: xpb.ctf },
      { src: 'lesson', label: 'lessons', val: xpb.lessons },
      { src: 'cert',   label: 'certs',   val: xpb.certs },
      { src: 'fb',     label: 'first-blood', val: xpb.first_bloods },
    ].filter((c) => c.val > 0).map((c) =>
      `<span class="xp-chip" data-src="${c.src}">${c.label} <span class="xp-chip-val">+${c.val}</span></span>`
    ).join('');

    // Use avatar.js to render — supports emoji/url/initials fallback
    const avatarMarkup = window.avatarHTML
      ? window.avatarHTML({ ...user, display_name: name }, { className: 'dash-avatar' })
          .replace('class="dash-avatar"',         `class="dash-avatar" style="background: linear-gradient(135deg, ${tierColor}, ${isRainbow ? '#db61a2' : 'var(--ai)'});"`)
          .replace('class="dash-avatar has-emoji"', `class="dash-avatar has-emoji" style="background: linear-gradient(135deg, ${tierColor}, ${isRainbow ? '#db61a2' : 'var(--ai)'});"`)
      : `<div class="dash-avatar" aria-hidden="true" style="background: linear-gradient(135deg, ${tierColor}, ${isRainbow ? '#db61a2' : 'var(--ai)'});">${escapeHtml(initials(name))}</div>`;

    $('dashHero').innerHTML = `
      <div style="position:relative;">
        ${avatarMarkup}
        <div class="dash-avatar-ring" style="border-color: color-mix(in srgb, ${tierColor} 35%, transparent);"></div>
      </div>
      <div>
        <div class="dash-greeting">${escapeHtml(greet)} <span aria-hidden="true">${emoji}</span></div>
        <h1 class="dash-name">${escapeHtml(name)}</h1>
        <div class="dash-level-row">
          ${tierBadge(level, { tip: `${level.xp.toLocaleString()} XP — ${level.current.tagline}` })}
          <div class="dash-xp">
            <div class="dash-xp-bar" title="${level.xp_pct}% to next level">
              <div class="dash-xp-fill" id="dashXpFill" style="width:0%; --tier-c: ${tierColor};" data-tier-color="${isRainbow ? 'rainbow' : 'tier'}"></div>
            </div>
            <div class="dash-xp-meta">
              <span>${level.xp.toLocaleString()} XP</span>
              <span>${next ? `${xpToNext.toLocaleString()} XP to ${escapeHtml(next.name)}` : 'max level — flex away'}</span>
            </div>
            ${xpChips ? `<div class="xp-breakdown">${xpChips}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="dash-hero-streak">
        ${streakChip}
      </div>`;

    // Animate XP bar
    setTimeout(() => {
      const fill = $('dashXpFill');
      if (fill) fill.style.width = level.xp_pct + '%';
    }, 100);
  }

  // ---------- Level-up modal ----------
  function showLevelUpModal(level, prevIdx) {
    const cur = level.current;
    const isRainbow = cur.color === 'rainbow';
    const tierColor = isRainbow ? 'var(--accent)' : cur.color;
    const overlay = document.createElement('div');
    overlay.className = 'lvlup-overlay';
    overlay.style.setProperty('--tier-c', tierColor);
    const prev = prevIdx >= 0 && prevIdx < level.level_idx
      ? `<div class="lvlup-from">from <strong>Lv ${prevIdx + 1}</strong> · <strong>+${level.level_idx - prevIdx} tier${level.level_idx - prevIdx > 1 ? 's' : ''}</strong></div>`
      : '';
    overlay.innerHTML = `
      <div class="lvlup-card">
        <div class="lvlup-eyebrow">// level up</div>
        <div class="lvlup-icon-wrap ${isRainbow ? 'tier-rainbow' : ''}">
          ${window.tierIcon(cur.icon)}
        </div>
        <div class="lvlup-tier-num">Lv ${level.level_idx + 1} of ${level.total_levels}</div>
        <h2 class="lvlup-name">${escapeHtml(cur.name)}</h2>
        <p class="lvlup-tagline">"${escapeHtml(cur.tagline || '')}"</p>
        ${prev}
        <div class="lvlup-actions">
          <button class="btn btn-primary" id="lvlupClose">Continue →</button>
          <a href="/levels" class="btn btn-ghost">See all tiers</a>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#lvlupClose').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    fireConfetti();
  }

  // ---------- Quick actions ----------
  function fmtSec(s) {
    if (s == null) return '';
    const m = Math.floor(s / 60); const sec = s % 60;
    return m ? `${m}m ${sec}s` : `${sec}s`;
  }
  function fmtCountdown(targetMs) {
    const diff = targetMs - Date.now();
    const abs = Math.abs(diff) / 1000;
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
  }

  function renderCompete(compete) {
    if (!compete) return;
    const cards = [];

    // Daily card
    if (compete.daily) {
      const d = compete.daily;
      const solved = d.solved;
      cards.push(`
        <a class="card compete-card" href="/daily">
          <div class="compete-eyebrow" style="color: var(--accent);">// daily · ${solved ? '✓ solved' : 'unsolved'}</div>
          <h3 class="compete-title">${escapeHtml(d.title)}</h3>
          <div class="compete-meta">${d.category} · ${d.difficulty} · streak ${d.streak.current}d</div>
          <div class="compete-cta">${solved ? `Locked in at ${fmtSec(d.time_seconds)} →` : 'Solve before reset →'}</div>
        </a>`);
    } else {
      cards.push(`
        <a class="card compete-card" href="/daily">
          <div class="compete-eyebrow" style="color: var(--accent);">// daily</div>
          <h3 class="compete-title">Today's challenge</h3>
          <div class="compete-meta">Tap to load — auto-rotates daily.</div>
          <div class="compete-cta">Open /daily →</div>
        </a>`);
    }

    // Live event card (first one)
    const ev = (compete.liveEvents || [])[0];
    if (ev) {
      const remaining = fmtCountdown(Date.parse(ev.ends_at));
      cards.push(`
        <a class="card compete-card" href="/live/${ev.slug}">
          <div class="compete-eyebrow" style="color: var(--terminal,#39ff7a);">// 🔴 live · ${ev.joined ? 'joined' : 'open'}</div>
          <h3 class="compete-title">${escapeHtml(ev.title)}</h3>
          <div class="compete-meta">${ev.my_solves} / ${ev.chal_count} solved · ends in ${remaining}</div>
          <div class="compete-cta">Open scoreboard →</div>
        </a>`);
    }

    // Pro Lab card (top one with progress)
    const lab = (compete.proLabs || [])[0];
    if (lab) {
      const pct = lab.total_flags ? Math.round((lab.my_flags / lab.total_flags) * 100) : 0;
      cards.push(`
        <a class="card compete-card" href="/pro-labs/${lab.slug}">
          <div class="compete-eyebrow" style="color: var(--medium,#ffb74d);">// pro lab</div>
          <h3 class="compete-title">${escapeHtml(lab.title)}</h3>
          <div class="compete-meta">${lab.my_flags} / ${lab.total_flags} flags · ${pct}%</div>
          <div class="compete-cta">${lab.my_flags ? 'Continue →' : 'Start hacking →'}</div>
        </a>`);
    }

    // Last assessment attempt
    const at = (compete.assessmentAttempts || [])[0];
    if (at && cards.length < 3) {
      const status = at.ended_at
        ? (at.passed ? '✓ passed' : '· failed')
        : '· in progress';
      cards.push(`
        <a class="card compete-card" href="/assessments/${at.slug}${!at.ended_at ? `/take/${at.id}` : ''}">
          <div class="compete-eyebrow" style="color: var(--challenge);">// assessment ${status}</div>
          <h3 class="compete-title">${escapeHtml(at.title)}</h3>
          <div class="compete-meta">${at.points_earned} / ${at.passing_points} pts</div>
          <div class="compete-cta">${at.ended_at ? 'View result →' : 'Resume attempt →'}</div>
        </a>`);
    }

    if (!cards.length) return;
    $('competeSection').hidden = false;
    $('competeRow').innerHTML = cards.slice(0, 3).join('');
  }

  function renderActions(rec, weekly, stats) {
    const items = [];

    // 1. Continue learning
    if (rec.continue_lesson) {
      const c = rec.continue_lesson;
      const pct = c.lesson_count ? Math.round((c.lessons_done / c.lesson_count) * 100) : 0;
      items.push(`
        <a class="dash-action" href="/courses/${escapeHtml(c.course_slug)}#${escapeHtml(c.lesson_slug)}" data-kind="continue">
          <span class="dash-action-eyebrow">// continue learning</span>
          <span class="dash-action-title">${escapeHtml(c.lesson_title)}</span>
          <span class="dash-action-sub">in ${escapeHtml(c.course_title)}</span>
          <div class="dash-action-foot">
            <span>${c.lessons_done}/${c.lesson_count} · ${pct}%</span>
            <span class="dash-action-cta">resume</span>
          </div>
        </a>`);
    } else if (rec.course) {
      const c = rec.course;
      items.push(`
        <a class="dash-action" href="/courses/${escapeHtml(c.slug)}" data-kind="continue">
          <span class="dash-action-eyebrow">// recommended start</span>
          <span class="dash-action-title">${escapeHtml(c.title)}</span>
          <span class="dash-action-sub">${escapeHtml(c.subtitle || '')}</span>
          <div class="dash-action-foot">
            <span>${escapeHtml(c.difficulty || '')} · free</span>
            <span class="dash-action-cta">enroll</span>
          </div>
        </a>`);
    }

    // 2. Today's challenge
    if (rec.challenge) {
      const ch = rec.challenge;
      const dEmoji = { easy: '🟢', medium: '🟡', hard: '🔴', insane: '🟣' }[ch.difficulty] || '⚪';
      items.push(`
        <a class="dash-action" href="/challenges/${escapeHtml(ch.slug)}" data-kind="challenge">
          <span class="dash-action-eyebrow">// today's challenge</span>
          <span class="dash-action-title">${dEmoji} ${escapeHtml(ch.title)}</span>
          <span class="dash-action-sub">${escapeHtml(ch.category)} · matches your strongest category</span>
          <div class="dash-action-foot">
            <span>${escapeHtml(ch.difficulty)} · ${ch.points} pts</span>
            <span class="dash-action-cta">try it</span>
          </div>
        </a>`);
    }

    // 3. Weekly summary ring
    const weeklyTarget = 500; // points target — could be user-configurable later
    const weeklyPct = Math.min(100, Math.round((weekly.score / weeklyTarget) * 100));
    const C = 2 * Math.PI * 36; // radius 36
    const dashOffset = C - (C * weeklyPct) / 100;
    items.push(`
      <div class="dash-action" data-kind="weekly" style="cursor:default;">
        <span class="dash-action-eyebrow">// this week</span>
        <span class="dash-action-title">Past 7 days</span>
        <div class="dash-weekly-row" style="margin-top:0.5rem;">
          <div class="dash-weekly-ring" title="${weekly.score} of ${weeklyTarget} pts target">
            <svg viewBox="-50 -50 100 100">
              <circle class="ring-track" cx="0" cy="0" r="36"/>
              <circle class="ring-fill"  cx="0" cy="0" r="36"
                stroke-dasharray="${C}" stroke-dashoffset="${C}"
                id="weeklyRingFill"/>
            </svg>
            <div class="ring-text">${weeklyPct}<small>% of goal</small></div>
          </div>
          <div class="dash-weekly-stats">
            <div class="dash-weekly-stat"><span class="dash-weekly-stat-key">points</span><span class="dash-weekly-stat-val">+${weekly.score}</span></div>
            <div class="dash-weekly-stat"><span class="dash-weekly-stat-key">solves</span><span class="dash-weekly-stat-val">${weekly.solves}</span></div>
            <div class="dash-weekly-stat"><span class="dash-weekly-stat-key">lessons</span><span class="dash-weekly-stat-val">${weekly.lessons}</span></div>
          </div>
        </div>
        <div class="dash-action-foot">
          <span>target: ${weeklyTarget} pts / week</span>
          <span class="dim">${weekly.score >= weeklyTarget ? '✓ goal hit' : `${weeklyTarget - weekly.score} to go`}</span>
        </div>
      </div>`);

    $('dashActions').innerHTML = items.join('');

    // Animate weekly ring
    setTimeout(() => {
      const r = $('weeklyRingFill');
      if (r) r.setAttribute('stroke-dashoffset', String(dashOffset));
    }, 200);
  }

  // ---------- Heatmap (existing logic) ----------
  function renderHeatmap(days) {
    const wrap = $('heatmap');
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
      cells.push(`<span class="heatmap-cell"${l ? ` data-lvl="${l}"` : ''} title="${escapeHtml(lblDate)} — ${d.count} ${d.count === 1 ? 'event' : 'events'}"></span>`);
    }
    wrap.innerHTML = cells.join('');
  }

  // ---------- Skill radar (SVG polygon) ----------
  const RADAR_AXES = ['web', 'crypto', 'pwn', 'rev', 'forensics', 'ai', 'misc'];

  function renderRadar(categories) {
    const svg = $('skillRadar');
    if (!svg) return;
    const byCat = Object.fromEntries((categories || []).map((c) => [c.category, c.score]));
    const maxScore = Math.max(50, ...RADAR_AXES.map((a) => byCat[a] || 0));
    const R = 110;
    const CX = 0, CY = 0;

    function pt(angleIdx, ratio) {
      const angle = (Math.PI * 2 * angleIdx) / RADAR_AXES.length - Math.PI / 2;
      return { x: CX + R * ratio * Math.cos(angle), y: CY + R * ratio * Math.sin(angle) };
    }

    // Grid (concentric rings + axes)
    const rings = [0.25, 0.5, 0.75, 1].map((r) => {
      const pts = RADAR_AXES.map((_, i) => {
        const p = pt(i, r);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }).join(' ');
      return `<polygon class="dash-radar-grid" points="${pts}"/>`;
    }).join('');

    const axes = RADAR_AXES.map((_, i) => {
      const p = pt(i, 1);
      return `<line class="dash-radar-axis" x1="0" y1="0" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`;
    }).join('');

    // User polygon
    const userPts = RADAR_AXES.map((cat, i) => {
      const ratio = (byCat[cat] || 0) / maxScore;
      const p = pt(i, Math.max(0.02, ratio));
      return { x: p.x, y: p.y, ratio, score: byCat[cat] || 0 };
    });
    const polyStr = userPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const points = userPts.map((p) => p.ratio > 0
      ? `<circle class="dash-radar-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"><title>${RADAR_AXES[userPts.indexOf(p)]}: ${p.score}</title></circle>`
      : ''
    ).join('');

    // Labels
    const labels = RADAR_AXES.map((cat, i) => {
      const lp = pt(i, 1.18);
      const anchor = lp.x < -10 ? 'end' : lp.x > 10 ? 'start' : 'middle';
      const score = byCat[cat] || 0;
      return `<text class="dash-radar-label" x="${lp.x.toFixed(1)}" y="${(lp.y + 4).toFixed(1)}" text-anchor="${anchor}">${escapeHtml(cat)} · ${score}</text>`;
    }).join('');

    svg.innerHTML = rings + axes + `<polygon class="dash-radar-poly" points="${polyStr}"/>` + points + labels;

    // Also render the existing category bars below the radar (compact)
    const card = $('categoryCard');
    const box  = $('categoryBars');
    if (categories?.length) {
      card.hidden = false;
      const max = Math.max(...categories.map((r) => r.score), 1);
      box.innerHTML = categories.map((r) => `
        <div class="cat-bar" data-cat="${escapeHtml(r.category)}">
          <div class="cat-bar-name">${escapeHtml(r.category)}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.round((r.score / max) * 100)}%"></div></div>
          <div class="cat-bar-val">${r.score} pts</div>
        </div>`).join('');
    } else {
      card.hidden = true;
    }
  }

  // ---------- Activity feed ----------
  const FEED_ICONS = {
    solve:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    lesson: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
    cert:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88"/></svg>',
  };

  function renderFeed(activity) {
    const box = $('activityFeed');
    if (!activity?.length) {
      box.innerHTML = `<div class="dash-empty"><strong>No activity yet.</strong><br/><span class="dim">Solve a challenge or complete a lesson to start your timeline.</span></div>`;
      return;
    }
    box.innerHTML = activity.slice(0, 12).map((a) => {
      let titleHTML, subHTML, amount;
      if (a.kind === 'solve') {
        titleHTML = `<a href="/challenges/${escapeHtml(a.slug)}">${escapeHtml(a.title)}</a>`;
        subHTML = `<span>solved · ${escapeHtml(a.sub)}</span>${a.first_blood ? ' <span class="first-blood-pill">first blood</span>' : ''}`;
        amount = `<span class="dash-feed-amount solve">+${a.amount} pts</span>`;
      } else if (a.kind === 'lesson') {
        titleHTML = `<a href="/courses/${escapeHtml(a.slug)}#${escapeHtml(a.lesson_slug || '')}">${escapeHtml(a.title)}</a>`;
        subHTML = `<span>completed · ${escapeHtml(a.sub)}</span>`;
        amount = `<span class="dash-feed-amount lesson">${a.amount || 10}m</span>`;
      } else if (a.kind === 'cert') {
        titleHTML = `<a href="/cert/${escapeHtml(a.slug)}">${escapeHtml(a.title)}</a>`;
        subHTML = `<span>certificate earned · <a href="/courses/${escapeHtml(a.sub)}">view course</a></span>`;
        amount = `<span class="dash-feed-amount cert">cert</span>`;
      }
      return `
        <div class="dash-feed-item" data-kind="${a.kind}">
          <span class="dash-feed-icon">${FEED_ICONS[a.kind] || ''}</span>
          <div>
            <div class="dash-feed-title">${titleHTML}</div>
            <div class="dash-feed-sub">${subHTML}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.2rem;">
            ${amount}
            <span class="dash-feed-when">${escapeHtml(relTime(a.when_at))}</span>
          </div>
        </div>`;
    }).join('');
  }

  // ---------- Achievements ----------
  const ACH_ICONS = {
    flag:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    target: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    medal:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="15" r="6"/><polyline points="9 17.5 9 22 12 20 15 22 15 17.5"/></svg>',
    crown:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 19h20l-2-9-5 4-5-8-5 8-5-4-2 9zm0 2h20v2H2v-2z"/></svg>',
    flame:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/></svg>',
    cert:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88"/></svg>',
    book:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    cpu:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  };

  function renderAchievements(items) {
    const grid = $('achievementsGrid');
    if (!grid) return;
    if (!items.length) {
      grid.innerHTML = `<div class="dash-empty"><strong>No badges yet.</strong><br/><span class="dim">Solve a challenge or complete a lesson to start earning.</span></div>`;
      return;
    }
    grid.className = 'achievement-grid';
    grid.innerHTML = items.map((a) => `
      <div class="achievement ${escapeHtml(a.icon || 'medal')}" title="${escapeHtml(a.desc)}">
        <div class="achievement-icon">${ACH_ICONS[a.icon] || ACH_ICONS.medal}</div>
        <div class="achievement-label">${escapeHtml(a.label)}</div>
        <div class="achievement-desc">${escapeHtml(a.desc)}</div>
      </div>`).join('');
  }

  // ---------- Certificates ----------
  function renderCertificates(items) {
    const sec = $('certsSection');
    const box = $('certsBox');
    if (!sec || !box) return;
    if (!items.length) { sec.hidden = true; return; }
    sec.hidden = false;
    box.innerHTML = `
      <div class="grid grid-cols-3">
        ${items.map((c) => `
          <a class="card" href="/cert/${escapeHtml(c.code)}">
            <div class="card-accent course"></div>
            <div class="card-body">
              <span class="card-type course">certificate</span>
              <h3 class="card-title">${escapeHtml(c.course_title)}</h3>
              <div class="card-meta">
                <span class="card-meta-item">issued ${escapeHtml(window.fmtDate(c.issued_at))}</span>
                <span class="card-meta-item dim" style="font-family:var(--font-mono);">${escapeHtml(c.code)}</span>
              </div>
              <span class="card-cta">View &amp; share</span>
            </div>
          </a>`).join('')}
      </div>`;
  }

  // ---------- Enrolled / In-progress ----------
  function enrolledCard(c) {
    const pct = c.lesson_count ? Math.round((c.lessons_done / c.lesson_count) * 100) : 0;
    return `
      <a class="card" href="/courses/${escapeHtml(c.slug)}">
        <div class="card-accent course"></div>
        <div class="card-body">
          <span class="card-type course">course</span>
          <h3 class="card-title">${escapeHtml(c.title)}</h3>
          <p class="card-desc">${escapeHtml(c.subtitle || '')}</p>
          <div style="margin-top:0.6rem;">
            <div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:0.78rem; color:var(--text-dim); margin-bottom:0.35rem;">
              <span>${c.lessons_done}/${c.lesson_count} lessons</span>
              <span>${pct}%</span>
            </div>
            <div style="height:6px; background:var(--bg-elev); border-radius:999px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:linear-gradient(90deg, var(--accent), var(--accent-hover)); border-radius:999px;"></div>
            </div>
          </div>
          <span class="card-cta">${pct === 100 ? 'Review' : 'Continue'}</span>
        </div>
      </a>`;
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
        <div class="lb-score dim">${escapeHtml(window.fmtRelative(s.solved_at))}</div>
      </div>`;
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', async () => {
    let data;
    try {
      data = await window.api.get('/api/auth/dashboard');
    } catch (err) {
      if (err.status === 401) {
        location.href = `/login?next=${encodeURIComponent('/dashboard')}`;
        return;
      }
      $('dashHero').innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Could not load dashboard')}</div>`;
      return;
    }

    const { user, enrolled, solved, stats, level, weekly, activity, recommended, categories, heatmap, certificates, achievements, compete } = data;

    renderHero(user, stats, level);
    renderActions(recommended, weekly, stats);
    renderCompete(compete);
    renderHeatmap(heatmap);
    renderRadar(categories);
    renderFeed(activity);
    renderAchievements(achievements || []);
    renderCertificates(certificates || []);

    // Stats
    animateNum($('statScore'),   stats.score);
    animateNum($('statSolves'),  stats.solves);
    animateNum($('statCourses'), enrolled.length);
    $('statRank').textContent = stats.solves ? `#${stats.rank}` : '—';

    // In-progress courses
    const enrolledGrid = $('enrolledGrid');
    enrolledGrid.innerHTML = enrolled.length
      ? enrolled.map(enrolledCard).join('')
      : `<div class="dash-empty"><strong>No courses yet</strong><br/><span class="dim">Enroll in a free course to start tracking progress.</span></div>`;

    // Recent solves table
    const solvedBox = $('solvedBox');
    if (!solved.length) {
      solvedBox.innerHTML = `<div class="dash-empty"><strong>No solves yet</strong><br/><span class="dim">Pop your first shell.</span></div>`;
    } else {
      solvedBox.innerHTML = `
        <div class="leaderboard">
          <div class="lb-row head" style="grid-template-columns: 1fr 110px 100px 110px;">
            <div>Challenge</div><div>Difficulty</div>
            <div style="text-align:right">Points</div>
            <div style="text-align:right">When</div>
          </div>
          ${solved.map(solveRow).join('')}
        </div>`;
    }

    // Confetti on milestone
    setTimeout(() => maybeConfetti(stats, level), 600);
  });
})();
