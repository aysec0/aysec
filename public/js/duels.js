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
          <span class="duel-stake"><span class="duel-stake-num">${d.stake}</span> XP</span>
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

  // Issue-duel modal --------------------------------------------------------
  // Cache the populated dropdown so reopening the modal is instant and so
  // the very first paint never shows an empty select.
  let challengeOptionsCache = null;

  function openModal() {
    $('#duelModal').hidden = false;
    $('#duelModalBackdrop').hidden = false;
    $('#duelFormAlert').hidden = true;
    // If we already populated, the cached HTML is already on the select.
    // Re-fetch in the background so the list stays fresh after the user
    // solves new challenges.
    populateChallengeOptions(challengeOptionsCache == null);
    setTimeout(() => $('#duelChallenge').focus(), 50);
  }
  function closeModal() {
    $('#duelModal').hidden = true;
    $('#duelModalBackdrop').hidden = true;
  }

  async function populateChallengeOptions(showLoading = true) {
    const sel = $('#duelChallenge');
    if (!sel) return;
    if (showLoading && !sel.options.length) {
      sel.innerHTML = `<option value="">Loading challenges…</option>`;
    }
    try {
      const { challenges } = await window.api.get('/api/challenges');
      const eligible = (challenges || []).filter((c) => !c.solved);
      if (!eligible.length) {
        const why = challenges?.length
          ? `— You've solved every challenge. Add more to duel —`
          : `— No challenges available yet —`;
        sel.innerHTML = `<option value="">${why}</option>`;
        challengeOptionsCache = sel.innerHTML;
        return;
      }
      // Group by category for readability. optgroup labels render in the
      // native dropdown; the closed select shows the selected option text.
      const byCat = {};
      for (const c of eligible) (byCat[c.category] ||= []).push(c);
      const html = `<option value="">Choose a challenge…</option>` +
        Object.entries(byCat).map(([cat, list]) => `
          <optgroup label="${escapeHtml(cat)}">
            ${list.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.title)} · ${escapeHtml(c.difficulty)} · ${c.points}pt</option>`).join('')}
          </optgroup>
        `).join('');
      sel.innerHTML = html;
      challengeOptionsCache = html;
    } catch (err) {
      console.warn('duels: populateChallengeOptions failed', err);
      // Only overwrite the dropdown with the error if we don't already
      // have cached options (so a flaky refresh doesn't wipe a working list).
      if (!challengeOptionsCache) {
        sel.innerHTML = `<option value="">Could not load challenges — refresh and try again</option>`;
      }
    }
  }

  function wireModal() {
    $('#newDuelBtn').addEventListener('click', () => {
      if (!viewer) {
        location.href = '/login?next=/duels';
        return;
      }
      openModal();
    });
    $('#duelModalClose').addEventListener('click', closeModal);
    $('#duelCancelBtn').addEventListener('click', closeModal);
    $('#duelModalBackdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#duelModal').hidden) closeModal();
    });
    $('#duelForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = $('#duelFormAlert');
      const btn = $('#duelSubmitBtn');
      const challenge_slug = $('#duelChallenge').value;
      const opponent_username = $('#duelOpponent').value.trim() || null;
      const stake = Number($('#duelStake').value) || 50;
      const message = $('#duelMessage').value.trim();
      if (!challenge_slug) {
        alertEl.hidden = false;
        alertEl.className = 'alert error';
        alertEl.textContent = 'Pick a challenge first.';
        return;
      }
      btn.disabled = true;
      const idle = btn.textContent;
      btn.textContent = 'Issuing…';
      try {
        const { id } = await window.api.post('/api/duels', { challenge_slug, opponent_username, stake, message });
        closeModal();
        window.toast?.(opponent_username ? `Duel issued to @${opponent_username}.` : 'Open duel posted.', 'success');
        location.href = `/duels/${id}`;
      } catch (err) {
        alertEl.hidden = false;
        alertEl.className = 'alert error';
        alertEl.textContent = err.message || 'Could not issue duel';
        btn.disabled = false;
        btn.textContent = idle;
      }
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
    // Pre-populate the challenge dropdown immediately so opening the modal
    // is instant — no race window where the select shows empty.
    populateChallengeOptions(false);
  });
})();
