/* ============================================================
   /duels/:id — single duel arena.

   Fetches the duel + submission timeline, polls every 4s while
   the duel is active so each side sees the other's submissions
   in near-real-time, runs a live mm:ss countdown, and exposes
   the flag form when the viewer is one of the two duelists.
   ============================================================ */
(() => {
  const id = location.pathname.split('/').filter(Boolean)[1];
  let state = null;   // { duel, submissions, viewer }
  let pollTimer = null;
  let clockTimer = null;

  const $ = (s) => document.querySelector(s);

  function avatarFor(u) {
    if (!u) return '<div class="duel-avatar duel-avatar-empty">?</div>';
    if (u.avatar_url) {
      return `<img class="duel-avatar" src="${escapeHtml(u.avatar_url)}" alt="" loading="lazy" />`;
    }
    const initial = (u.display_name || u.username || '?').slice(0, 1).toUpperCase();
    return `<div class="duel-avatar duel-avatar-letter">${escapeHtml(initial)}</div>`;
  }

  function diffDot(diff) {
    const order = ['easy', 'medium', 'hard', 'insane'];
    const idx = order.indexOf((diff || '').toLowerCase());
    const lvl = idx >= 0 ? idx + 1 : 1;
    return `<span class="diff-dots" data-diff="${escapeHtml((diff || '').toLowerCase())}" style="margin-left:0;">
      ${Array.from({ length: 4 }, (_, i) => `<span class="dot${i < lvl ? ' on' : ''}"></span>`).join('')}
    </span>`;
  }

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

  function fmtElapsed(start, end) {
    if (!start) return '';
    const a = new Date(start.replace(' ', 'T') + 'Z').getTime();
    const b = end ? new Date(end.replace(' ', 'T') + 'Z').getTime() : Date.now();
    const diff = Math.max(0, Math.floor((b - a) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderHead() {
    const d = state.duel;
    document.title = `Duel #${d.id} — aysec`;
    $('#crumbId').textContent = `#${d.id}`;

    const labels = { open: 'OPEN', active: 'LIVE', finished: 'FINISHED', cancelled: 'CANCELLED', expired: 'EXPIRED' };
    $('#duelHead').innerHTML = `
      <div class="detail-meta">
        <span class="duel-status duel-status-${d.status}">${labels[d.status] || d.status}</span>
        <span class="card-meta-item">${d.stake} XP at stake</span>
        ${d.status === 'active' ? `<span class="duel-clock duel-clock-live" id="liveClock">${escapeHtml(fmtRemaining(d.expires_at))} left</span>` : ''}
        ${d.status === 'open'   ? `<span class="duel-clock">expires ${escapeHtml(fmtRemaining(d.expires_at))}</span>` : ''}
      </div>
      <h1 class="detail-title">Duel #${d.id}</h1>
      ${d.message ? `<p class="duel-message">"${escapeHtml(d.message)}"</p>` : ''}
    `;
  }

  function renderArena() {
    const d = state.duel;
    const winner = d.winner_id;

    $('#duelArena').innerHTML = `
      <div class="duel-arena-grid">
        <div class="duel-arena-side ${winner === d.challenger.id ? 'is-winner' : ''}">
          <div class="duel-arena-tag">CHALLENGER</div>
          <a href="/u/${escapeHtml(d.challenger.username)}" class="duel-arena-link">
            ${avatarFor(d.challenger)}
            <div>
              <div class="duel-arena-name">${escapeHtml(d.challenger.display_name || d.challenger.username)}</div>
              <div class="duel-arena-handle">@${escapeHtml(d.challenger.username)}</div>
            </div>
          </a>
          ${winner === d.challenger.id ? `<div class="duel-trophy">🏆 +${d.stake} XP</div>` : ''}
          ${winner && winner !== d.challenger.id ? `<div class="duel-loss">−${d.stake} XP</div>` : ''}
        </div>

        <div class="duel-arena-mid">
          <div class="duel-arena-vs">VS</div>
          <div class="duel-arena-stake">
            <span class="duel-stake-num">${d.stake}</span>
            <span class="duel-stake-label">XP pot</span>
          </div>
          ${d.started_at && d.status === 'active' ? `<div class="duel-arena-elapsed" id="elapsedClock">${escapeHtml(fmtElapsed(d.started_at, null))}</div>` : ''}
          ${d.started_at && d.status !== 'active' && d.finished_at ? `<div class="duel-arena-elapsed">Took ${escapeHtml(fmtElapsed(d.started_at, d.finished_at))}</div>` : ''}
        </div>

        <div class="duel-arena-side ${winner && d.opponent && winner === d.opponent.id ? 'is-winner' : ''} ${!d.opponent ? 'is-empty' : ''}">
          <div class="duel-arena-tag">OPPONENT</div>
          ${d.opponent ? `
            <a href="/u/${escapeHtml(d.opponent.username)}" class="duel-arena-link">
              ${avatarFor(d.opponent)}
              <div>
                <div class="duel-arena-name">${escapeHtml(d.opponent.display_name || d.opponent.username)}</div>
                <div class="duel-arena-handle">@${escapeHtml(d.opponent.username)}</div>
              </div>
            </a>
          ` : `
            <div class="duel-arena-link">
              <div class="duel-avatar duel-avatar-empty">?</div>
              <div><div class="duel-arena-name dim"><em>Awaiting acceptor</em></div></div>
            </div>
          `}
          ${winner && d.opponent && winner === d.opponent.id ? `<div class="duel-trophy">🏆 +${d.stake} XP</div>` : ''}
          ${winner && d.opponent && winner !== d.opponent.id ? `<div class="duel-loss">−${d.stake} XP</div>` : ''}
        </div>
      </div>`;
  }

  function renderChallengeBox() {
    const d = state.duel;
    const v = state.viewer;
    const isDuelist = v && (v.id === d.challenger.id || (d.opponent && v.id === d.opponent.id));
    const showFlag = isDuelist && d.status === 'active';
    const box = $('#duelChallengeBox');

    // Hide the challenge body until the viewer is actually in the race —
    // public spectators see only metadata. (We rely on the regular CTF page
    // staying solvable by anyone, but the live duel doesn't broadcast hints.)
    if (showFlag || d.status !== 'active') {
      box.hidden = false;
      box.innerHTML = `
        <h3 class="duel-section-title">Challenge</h3>
        <div class="duel-challenge-card">
          <div class="duel-challenge-head">
            <span class="duel-challenge-cat">${escapeHtml(d.challenge.category)}</span>
            ${diffDot(d.challenge.difficulty)}
            <span class="duel-challenge-pts">${d.challenge.points} pts</span>
          </div>
          <h4 class="duel-challenge-title">${escapeHtml(d.challenge.title)}</h4>
          <p class="muted" style="margin:0.4rem 0 0.6rem;">
            Solve this challenge through the regular flow — read the brief, download attachments,
            target the remote.
          </p>
          <a class="btn btn-ghost btn-sm" href="/challenges/${escapeHtml(d.challenge.slug)}" target="_blank" rel="noopener">
            Open challenge ↗
          </a>
        </div>`;
    } else {
      box.hidden = true;
    }

    $('#duelFlagBox').hidden = !showFlag;
  }

  function renderStats() {
    const d = state.duel;
    $('#duelStats').innerHTML = `
      <div class="stat"><span class="stat-key">status</span><span class="stat-val">${escapeHtml(d.status)}</span></div>
      <div class="stat"><span class="stat-key">stake</span><span class="stat-val">${d.stake} XP</span></div>
      <div class="stat"><span class="stat-key">challenge</span><span class="stat-val">${escapeHtml(d.challenge.title)}</span></div>
      <div class="stat"><span class="stat-key">difficulty</span><span class="stat-val">${escapeHtml(d.challenge.difficulty)}</span></div>
      <div class="stat"><span class="stat-key">points</span><span class="stat-val">${d.challenge.points}</span></div>
      <div class="stat"><span class="stat-key">issued</span><span class="stat-val">${escapeHtml(window.fmtRelative(d.created_at))}</span></div>
      ${d.started_at ? `<div class="stat"><span class="stat-key">started</span><span class="stat-val">${escapeHtml(window.fmtRelative(d.started_at))}</span></div>` : ''}
      ${d.finished_at ? `<div class="stat"><span class="stat-key">finished</span><span class="stat-val">${escapeHtml(window.fmtRelative(d.finished_at))}</span></div>` : ''}
    `;
  }

  function renderActions() {
    const box = $('#duelActions');
    const d = state.duel;
    const v = state.viewer;
    const html = [];

    if (!v) {
      html.push(`<a class="btn btn-primary" href="/login?next=/duels/${d.id}">Sign in to act</a>`);
    } else if (d.status === 'open') {
      const youAreChallenger = v.id === d.challenger.id;
      const calledOut        = d.opponent && v.id === d.opponent.id;
      const isOpen           = !d.opponent;
      if (youAreChallenger) {
        html.push(`<button class="btn btn-ghost" id="cancelBtn" type="button">Cancel duel</button>`);
      } else if (calledOut || isOpen) {
        if (v.hasSolvedChallenge) {
          html.push(`<div class="alert warn">You've already solved <strong>${escapeHtml(d.challenge.title)}</strong> — accepting would be an unfair race.</div>`);
        } else {
          html.push(`<button class="btn btn-primary" id="acceptBtn" type="button">Accept duel</button>`);
        }
      }
    } else if (d.status === 'active') {
      const isDuelist = v.id === d.challenger.id || (d.opponent && v.id === d.opponent.id);
      if (isDuelist) {
        html.push(`<button class="btn btn-ghost" id="forfeitBtn" type="button">Forfeit duel</button>`);
      }
    }

    box.innerHTML = html.join('');

    $('#acceptBtn')?.addEventListener('click', async () => {
      $('#acceptBtn').disabled = true;
      try {
        await window.api.post(`/api/duels/${d.id}/accept`);
        window.toast?.('Race is on.', 'success');
        load();
      } catch (err) {
        window.toast?.(err.message || 'Could not accept', 'error');
        $('#acceptBtn').disabled = false;
      }
    });
    $('#cancelBtn')?.addEventListener('click', async () => {
      if (!confirm('Cancel this duel?')) return;
      try {
        await window.api.post(`/api/duels/${d.id}/cancel`);
        window.toast?.('Duel cancelled.', 'info');
        load();
      } catch (err) {
        window.toast?.(err.message || 'Could not cancel', 'error');
      }
    });
    $('#forfeitBtn')?.addEventListener('click', async () => {
      if (!confirm('Forfeit? You lose the stake and the duel ends.')) return;
      try {
        await window.api.post(`/api/duels/${d.id}/forfeit`);
        window.toast?.('Forfeited.', 'info');
        load();
      } catch (err) {
        window.toast?.(err.message || 'Could not forfeit', 'error');
      }
    });
  }

  function renderTimeline() {
    const box = $('#duelTimelineBox');
    const subs = state.submissions || [];
    if (!subs.length) {
      box.innerHTML = `<p class="muted">No submissions yet.</p>`;
      return;
    }
    const start = state.duel.started_at;
    box.innerHTML = `
      <div class="duel-timeline-list">
        ${subs.map((s) => `
          <div class="duel-timeline-row ${s.is_correct ? 'is-correct' : 'is-wrong'}">
            <div class="duel-tl-time">${escapeHtml(start ? '+' + fmtElapsed(start, s.submitted_at) : window.fmtRelative(s.submitted_at))}</div>
            <div class="duel-tl-user">${avatarFor(s)} <span>${escapeHtml(s.display_name || s.username)}</span></div>
            <div class="duel-tl-result">${s.is_correct ? '✓ correct' : '✗ wrong'}</div>
          </div>
        `).join('')}
      </div>`;
  }

  function startClocks() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      const d = state?.duel;
      if (!d) return;
      const live = document.getElementById('liveClock');
      if (live && d.expires_at) live.textContent = `${fmtRemaining(d.expires_at)} left`;
      const el = document.getElementById('elapsedClock');
      if (el && d.started_at) el.textContent = fmtElapsed(d.started_at, null);
      // If we crossed expiry locally, force a refetch to flip status server-side
      if (d.status === 'active' && d.expires_at) {
        const target = new Date(d.expires_at.replace(' ', 'T') + 'Z').getTime();
        if (Date.now() > target + 1500) load();
      }
    }, 1000);
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!state?.duel) return;
      // Only poll while the duel is open or active — finished/cancelled is terminal.
      if (state.duel.status === 'open' || state.duel.status === 'active') load(true);
    }, 4000);
  }

  async function load(silent = false) {
    try {
      const data = await window.api.get(`/api/duels/${id}`);
      state = data;
      renderHead();
      renderArena();
      renderChallengeBox();
      renderStats();
      renderActions();
      renderTimeline();
    } catch (err) {
      if (!silent) {
        $('#duelHead').innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Duel not found')}</div>`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    startClocks();
    startPolling();

    // Wire flag-submit form (lives in static HTML; only enabled when arena rendered).
    document.getElementById('duelFlagForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = $('#duelFlagAlert');
      const btn = $('#duelFlagBtn');
      const flag = $('#duelFlagInput').value.trim();
      alertEl.hidden = true;
      if (!flag) {
        alertEl.hidden = false;
        alertEl.className = 'alert error';
        alertEl.textContent = 'Enter a flag.';
        return;
      }
      btn.disabled = true;
      const idle = btn.textContent;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const res = await window.api.post(`/api/duels/${id}/submit`, { flag });
        if (res.correct && res.won) {
          alertEl.hidden = false;
          alertEl.className = 'alert ok';
          alertEl.textContent = `🩸 Flag accepted — you took the pot. +${res.stake} XP.`;
        } else if (res.correct) {
          alertEl.hidden = false;
          alertEl.className = 'alert warn';
          alertEl.textContent = 'Correct flag — but the other side beat you to it. Solve credited anyway.';
        } else {
          alertEl.hidden = false;
          alertEl.className = 'alert warn';
          alertEl.textContent = 'Wrong flag. Keep trying — clock is ticking.';
        }
        load();
      } catch (err) {
        alertEl.hidden = false;
        alertEl.className = 'alert error';
        alertEl.textContent = err.message || 'Submit failed';
      } finally {
        btn.disabled = false;
        btn.textContent = idle;
      }
    });
  });

  window.addEventListener('beforeunload', () => {
    if (pollTimer) clearInterval(pollTimer);
    if (clockTimer) clearInterval(clockTimer);
  });
})();
