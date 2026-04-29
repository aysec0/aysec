/* ============================================================
   /duels — list page. Tabs: Open / Live now / My duels / Recent.
   "Issue a duel" button opens a modal that lets you pick a
   challenge, set a stake, and optionally call out a specific
   opponent. Open duels (no opponent) get accepted by whoever
   clicks first.
   ============================================================ */
(() => {
  let viewer = null;
  let lastData = null;

  const $ = (sel) => document.querySelector(sel);

  function diffDot(diff) {
    const order = ['easy', 'medium', 'hard', 'insane'];
    const idx = order.indexOf((diff || '').toLowerCase());
    const lvl = idx >= 0 ? idx + 1 : 1;
    return `<span class="diff-dots" data-diff="${escapeHtml((diff || '').toLowerCase())}" style="margin-left:0;">
      ${Array.from({ length: 4 }, (_, i) => `<span class="dot${i < lvl ? ' on' : ''}"></span>`).join('')}
    </span>`;
  }

  function avatarFor(u) {
    if (!u) return '<div class="duel-avatar duel-avatar-empty">?</div>';
    if (u.avatar_url) {
      return `<img class="duel-avatar" src="${escapeHtml(u.avatar_url)}" alt="" loading="lazy" />`;
    }
    const initial = (u.display_name || u.username || '?').slice(0, 1).toUpperCase();
    return `<div class="duel-avatar duel-avatar-letter">${escapeHtml(initial)}</div>`;
  }

  // mm:ss countdown to a UTC iso string
  function fmtRemaining(iso) {
    if (!iso) return '';
    const target = new Date(iso.replace(' ', 'T') + 'Z').getTime();
    const diff = target - Date.now();
    if (diff <= 0) return 'expired';
    const m = Math.floor(diff / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function statusBadge(d) {
    const cls = `duel-status duel-status-${d.status}`;
    const labels = { open: 'OPEN', active: 'LIVE', finished: 'FINISHED', cancelled: 'CANCELLED', expired: 'EXPIRED' };
    return `<span class="${cls}">${labels[d.status] || d.status}</span>`;
  }

  function duelCard(d, opts = {}) {
    const showAccept = opts.showAccept && d.status === 'open' &&
      viewer && d.challenger.id !== viewer.id &&
      (!d.opponent || d.opponent.id === viewer.id);
    const youAreChallenger = viewer && d.challenger.id === viewer.id;
    const showCancel = opts.showCancel && d.status === 'open' && youAreChallenger;
    const isMine = viewer && (d.challenger.id === viewer.id || d.opponent?.id === viewer.id);
    const winnerLabel = d.winner_id
      ? (d.winner_id === d.challenger.id ? d.challenger : d.opponent)
      : null;

    return `
      <article class="duel-card ${d.status}" data-id="${d.id}" data-tilt="4">
        <a class="duel-card-link" href="/duels/${d.id}" aria-label="Open duel ${d.id}"></a>
        <div class="duel-card-head">
          ${statusBadge(d)}
          ${d.format
            ? `<span class="duel-format-badge" style="--fmt-c:${d.format.color};">${d.format.icon} ${escapeHtml(d.format.name)}</span>
               <span class="duel-stake duel-stake-rating">+${d.format.points_win}</span>`
            : `<span class="duel-stake"><span class="duel-stake-num">${d.stake}</span> XP</span>`}
          ${d.status === 'open'   ? `<span class="duel-clock">expires ${escapeHtml(fmtRemaining(d.expires_at))}</span>` : ''}
          ${d.status === 'active' ? `<span class="duel-clock duel-clock-live" data-expires="${escapeHtml(d.expires_at || '')}">${escapeHtml(fmtRemaining(d.expires_at))} left</span>` : ''}
        </div>

        <div class="duel-card-body">
          <div class="duel-versus">
            <div class="duel-side-card duel-side-challenger ${winnerLabel?.id === d.challenger.id ? 'is-winner' : ''}">
              ${avatarFor(d.challenger)}
              <div class="duel-side-info">
                <div class="duel-side-name">${escapeHtml(d.challenger.display_name || d.challenger.username)}</div>
                <div class="duel-side-handle">@${escapeHtml(d.challenger.username)}</div>
              </div>
            </div>
            <span class="duel-vs">VS</span>
            <div class="duel-side-card duel-side-opponent ${d.opponent && winnerLabel?.id === d.opponent.id ? 'is-winner' : ''} ${!d.opponent ? 'is-empty' : ''}">
              ${avatarFor(d.opponent)}
              <div class="duel-side-info">
                <div class="duel-side-name">${d.opponent ? escapeHtml(d.opponent.display_name || d.opponent.username) : '<em class="dim">awaiting acceptor</em>'}</div>
                <div class="duel-side-handle">${d.opponent ? '@' + escapeHtml(d.opponent.username) : '&nbsp;'}</div>
              </div>
            </div>
          </div>

          <div class="duel-card-challenge">
            <span class="duel-card-c-cat">${escapeHtml(d.challenge.category)}</span>
            <span class="duel-card-c-title">${escapeHtml(d.challenge.title)}</span>
            ${diffDot(d.challenge.difficulty)}
            <span class="duel-card-c-pts">${d.challenge.points} pts</span>
          </div>

          ${d.message ? `<p class="duel-card-msg">"${escapeHtml(d.message)}"</p>` : ''}

          ${winnerLabel ? `<p class="duel-card-result">Winner: <strong>${escapeHtml(winnerLabel.display_name || winnerLabel.username)}</strong></p>` : ''}
        </div>

        <div class="duel-card-actions">
          ${showAccept  ? `<button class="btn btn-primary btn-sm duel-accept-btn" type="button" data-id="${d.id}">Accept duel</button>` : ''}
          ${showCancel  ? `<button class="btn btn-ghost btn-sm duel-cancel-btn" type="button" data-id="${d.id}">Cancel</button>` : ''}
          <a class="btn btn-ghost btn-sm" href="/duels/${d.id}">${d.status === 'active' && isMine ? 'Enter arena →' : 'View →'}</a>
        </div>
      </article>`;
  }

  function emptyHTML(msg) {
    return `<div class="empty"><p>${escapeHtml(msg)}</p></div>`;
  }

  function render(data) {
    lastData = data;
    viewer = data.viewer;

    $('#statOpen').textContent = data.open.length;
    $('#statActive').textContent = data.active.length;

    // Open
    $('#openList').innerHTML = data.open.length
      ? data.open.map((d) => duelCard(d, { showAccept: true, showCancel: true })).join('')
      : emptyHTML('No open duels right now. Be the first to issue one.');

    // Active
    $('#activeList').innerHTML = data.active.length
      ? data.active.map((d) => duelCard(d, { showAccept: false })).join('')
      : emptyHTML('No live duels at the moment.');

    // Mine
    if (!viewer) {
      $('#mineList').innerHTML = `<div class="empty"><p>Sign in to see your duels.</p><a class="btn btn-primary" href="/login?next=/duels">Sign in</a></div>`;
    } else if (!data.mine.length) {
      $('#mineList').innerHTML = emptyHTML("You haven't duelled yet. Issue your first.");
    } else {
      $('#mineList').innerHTML = data.mine.map((d) => duelCard(d, { showCancel: true })).join('');
    }

    // Recent
    $('#recentList').innerHTML = data.recent.length
      ? data.recent.map((d) => duelCard(d)).join('')
      : emptyHTML('No finished duels yet.');

    wireCardActions();
    refreshLiveClocks();
  }

  function wireCardActions() {
    document.querySelectorAll('.duel-accept-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const id = btn.dataset.id;
        if (!viewer) {
          location.href = `/login?next=/duels/${id}`;
          return;
        }
        btn.disabled = true;
        try {
          await window.api.post(`/api/duels/${id}/accept`);
          window.toast?.('Duel accepted — race is on.', 'success');
          location.href = `/duels/${id}`;
        } catch (err) {
          window.toast?.(err.message || 'Could not accept', 'error');
          btn.disabled = false;
        }
      });
    });
    document.querySelectorAll('.duel-cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('Cancel this duel?')) return;
        btn.disabled = true;
        try {
          await window.api.post(`/api/duels/${id}/cancel`);
          window.toast?.('Duel cancelled.', 'info');
          load();
        } catch (err) {
          window.toast?.(err.message || 'Could not cancel', 'error');
          btn.disabled = false;
        }
      });
    });
  }

  // Tick the live-clock display once a second so users see time draining.
  let _clockTimer = null;
  function refreshLiveClocks() {
    if (_clockTimer) clearInterval(_clockTimer);
    _clockTimer = setInterval(() => {
      document.querySelectorAll('.duel-clock-live').forEach((el) => {
        const v = el.dataset.expires;
        if (!v) return;
        el.textContent = `${fmtRemaining(v)} left`;
      });
    }, 1000);
  }

  function renderLeaderboard(rows) {
    const body = $('#duelLbBody');
    if (!rows.length) {
      body.innerHTML = `<div class="duel-lb-row"><div class="dim" style="grid-column:1/-1;text-align:center;padding:1rem;">No finished duels yet.</div></div>`;
      return;
    }
    body.innerHTML = rows.map((r, i) => `
      <div class="duel-lb-row">
        <div>${String(i + 1).padStart(2, '0')}</div>
        <div class="duel-lb-user">
          ${avatarFor(r)}
          <a href="/u/${escapeHtml(r.username)}" class="duel-lb-name">${escapeHtml(r.display_name || r.username)}</a>
        </div>
        <div style="text-align:right;color:var(--ok);">${r.wins}</div>
        <div style="text-align:right;color:var(--err);">${r.losses}</div>
        <div style="text-align:right;font-weight:600;color:${r.xp_swing >= 0 ? 'var(--ok)' : 'var(--err)'};">
          ${r.xp_swing > 0 ? '+' : ''}${r.xp_swing}
        </div>
      </div>
    `).join('');

    if (viewer) {
      const me = rows.find((r) => r.username === viewer.username);
      if (me) {
        $('#statRecord').textContent = `${me.wins}–${me.losses}`;
        $('#statSwing').textContent  = (me.xp_swing > 0 ? '+' : '') + me.xp_swing;
      }
    }
  }

  // Tabs
  function wireTabs() {
    document.querySelectorAll('.duel-tab').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.duel-tab').forEach((x) => x.classList.toggle('active', x === t));
        const which = t.dataset.tab;
        document.querySelectorAll('.duel-panel').forEach((p) => {
          p.hidden = p.dataset.panel !== which;
        });
      });
    });
  }

  // Single-click format picker — pick a format, server matches you instantly.
  let formatsCache = null;
  let myRatings = null;
  let busyTile = null;     // the tile that's currently mid-search; lock it

  function openModal() {
    $('#duelModal').hidden = false;
    $('#duelModalBackdrop').hidden = false;
    $('#duelFormAlert').hidden = true;
    populateFormatGrid();
  }
  function closeModal() {
    $('#duelModal').hidden = true;
    $('#duelModalBackdrop').hidden = true;
    busyTile = null;
  }

  async function populateFormatGrid() {
    const grid = $('#duelFormatGrid');
    if (!grid) return;
    try {
      const [{ formats }, ratings] = await Promise.all([
        formatsCache ? Promise.resolve({ formats: formatsCache }) : window.api.get('/api/duels/formats'),
        viewer ? window.api.get(`/api/duels/rating/${viewer.username}`).catch(() => ({ ratings: {} })) : { ratings: {} },
      ]);
      formatsCache = formats;
      myRatings = ratings.ratings || {};
      grid.innerHTML = formats.map((f) => {
        const r = myRatings[f.id] || { rating: 1000, provisional: true, tier: { color: '#aaa', name: 'Silver' } };
        const ratingHtml = viewer
          ? `<span class="duel-tile-rating" title="${escapeHtml(r.tier?.name || '')}">${r.rating}${r.provisional ? '?' : ''}</span>`
          : '';
        const liveDot = f.active_count > 0
          ? `<span class="duel-tile-live" title="${f.active_count} live now"><span class="presence-dot is-live"></span></span>`
          : f.open_count > 0
            ? `<span class="duel-tile-open" title="${f.open_count} waiting">·${f.open_count}</span>`
            : '';
        return `
          <button type="button" class="duel-tile" data-format="${f.id}" role="listitem" style="--fmt-c:${f.color};" aria-label="${f.name} — ${f.minutes} minutes">
            <span class="duel-tile-icon">${f.icon}</span>
            <span class="duel-tile-body">
              <span class="duel-tile-name">${escapeHtml(f.name)}</span>
              <span class="duel-tile-time">${formatTimeLabel(f.minutes)}</span>
            </span>
            ${ratingHtml}
            ${liveDot}
            <span class="duel-tile-arrow" aria-hidden="true">→</span>
          </button>`;
      }).join('');
      grid.querySelectorAll('.duel-tile').forEach((b) => {
        b.addEventListener('click', () => onTileClick(b));
      });
    } catch (err) {
      grid.innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Could not load formats')}</div>`;
    }
  }

  function formatTimeLabel(min) {
    if (min < 60) return `${min} min`;
    const h = min / 60;
    return Number.isInteger(h) ? `${h} hr` : `${h} hr`;
  }

  async function onTileClick(tile) {
    if (busyTile) return;
    busyTile = tile;
    const formatId = tile.dataset.format;
    const opponent_username = $('#duelOpponent').value.trim() || null;
    const message = $('#duelMessage').value.trim();
    const alertEl = $('#duelFormAlert');
    alertEl.hidden = true;

    // Visual feedback — tile shows a spinner state while server picks/pairs
    tile.classList.add('is-loading');
    tile.querySelector('.duel-tile-arrow').innerHTML = '<span class="spinner"></span>';

    try {
      let res;
      if (opponent_username) {
        res = await window.api.post('/api/duels', { format: formatId, opponent_username, message });
        window.toast?.(`Sent to @${opponent_username.replace(/^@/, '')}.`, 'success');
      } else {
        res = await window.api.post(`/api/duels/quick-match/${formatId}`);
        window.toast?.(res.matched ? 'Match found — race is on.' : 'Open match posted — waiting…', res.matched ? 'success' : 'info');
      }
      closeModal();
      location.href = `/duels/${res.id}`;
    } catch (err) {
      tile.classList.remove('is-loading');
      tile.querySelector('.duel-tile-arrow').textContent = '→';
      busyTile = null;
      alertEl.hidden = false;
      alertEl.className = 'alert error';
      alertEl.textContent = err.message || 'Could not start the match';
    }
  }

  function wireModal() {
    $('#newDuelBtn').addEventListener('click', () => {
      if (!viewer) { location.href = '/login?next=/duels'; return; }
      openModal();
    });
    $('#duelModalClose').addEventListener('click', closeModal);
    $('#duelModalBackdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#duelModal').hidden) closeModal();
    });
  }

  async function load() {
    try {
      const data = await window.api.get('/api/duels');
      render(data);
      const lb = await window.api.get('/api/duels/leaderboard');
      renderLeaderboard(lb.leaderboard || []);
    } catch (err) {
      $('#openList').innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Could not load duels')}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    wireModal();
    load();
  });
})();
