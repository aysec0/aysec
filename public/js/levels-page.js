/* /levels — public ladder. Highlights the user's current tier if signed in. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('levelsGrid');
    const youAre = document.getElementById('youAre');

    let levels = [];
    let userLevel = null;

    try {
      const data = await window.api.get('/api/levels');
      levels = data.levels || [];
    } catch {}

    // Try to get user's current level (only if signed in)
    try {
      const dash = await window.api.get('/api/auth/dashboard').catch(() => null);
      if (dash?.level?.current) userLevel = dash.level;
    } catch {}

    if (userLevel) {
      const cur = userLevel.current;
      const next = userLevel.next;
      const xpToNext = next ? Math.max(0, next.min - userLevel.xp) : 0;
      const isRainbow = cur.color === 'rainbow';
      youAre.hidden = false;
      youAre.style.borderColor = isRainbow ? 'var(--accent)' : `color-mix(in srgb, ${cur.color} 50%, var(--border))`;
      youAre.innerHTML = `
        <svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        <div>
          You're at <strong>Lv ${userLevel.level_idx + 1} · ${escapeHtml(cur.name)}</strong> with
          <strong>${userLevel.xp.toLocaleString()} XP</strong>.
          ${next
            ? `<strong>${xpToNext.toLocaleString()} XP</strong> to reach <strong>${escapeHtml(next.name)}</strong>.`
            : `You're at the top — flex away.`}
        </div>`;
    }

    if (!levels.length) {
      grid.innerHTML = `<div class="empty"><h3>Could not load levels</h3></div>`;
      return;
    }

    grid.innerHTML = levels.map((lvl) => {
      const isRainbow = lvl.color === 'rainbow';
      const isCurrent = userLevel && userLevel.level_idx === lvl.idx;
      const isLocked  = userLevel && userLevel.level_idx < lvl.idx;
      const cls = ['level-row',
        isCurrent ? 'is-current' : '',
        isLocked ? 'is-locked' : '',
      ].filter(Boolean).join(' ');
      const style = isRainbow ? '' : `style="--tier-c: ${lvl.color};"`;
      const iconCls = `level-row-icon ${isRainbow ? 'tier-rainbow' : ''}`;
      return `
        <div class="${cls}" ${style}>
          <div class="level-row-num">Lv ${lvl.idx + 1}</div>
          <div class="${iconCls}">${window.tierIcon(lvl.icon)}</div>
          <div>
            <div class="level-row-name">${escapeHtml(lvl.name)}</div>
            <div class="level-row-tagline">"${escapeHtml(lvl.tagline)}"</div>
          </div>
          <div class="level-row-min">
            <strong>${lvl.min.toLocaleString()}</strong>
            <span class="lbl">XP needed</span>
          </div>
        </div>`;
    }).join('');
  });
})();
