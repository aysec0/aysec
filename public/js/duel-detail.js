/* ============================================================
   /duels/:id — focused arena page.

   Layout:
     - Top bar: back arrow + BIG countdown clock + status/format meta
     - Versus banner: avatars left + center pot + avatars right
     - Challenge spotlight: title + category + difficulty + source badge
       + "Open original challenge ↗" link
     - Flag form (only for active duelists)
     - Submission timeline
     - Side rail: stats + actions

   Polling:
     - 4s while open/active. Stops on terminal states.
     - 1Hz local clock so the countdown doesn't tick once per fetch.
   ============================================================ */
(() => {
  const id = location.pathname.split('/').filter(Boolean)[1];
  let state = null;
  let pollTimer = null;
  let clockTimer = null;

  const $ = (s) => document.querySelector(s);

  // Visual labels for source platforms — SVG icons (resolved at render time
  // via window.icon) instead of emoji so they look consistent across OSes.
  const SOURCE_LABELS = {
    aysec:       { name: 'aysec original', iconName: 'check',       color: '#39ff7a' },
    overthewire: { name: 'OverTheWire',    iconName: 'globe',       color: '#7aa2f7' },
    cryptohack:  { name: 'CryptoHack',     iconName: 'lock',        color: '#bb88ff' },
    tryhackme:   { name: 'TryHackMe',      iconName: 'target',      color: '#88e8a3' },
    htb:         { name: 'Hack The Box',   iconName: 'shield',      color: '#9fef00' },
  };
  function sourceIcon(id, size = 12) {
    const s = SOURCE_LABELS[id] || SOURCE_LABELS.aysec;
    return window.icon ? window.icon(s.iconName, size) : '';
  }

  function avatarFor(u, large = false) {
    const cls = `arena-avatar${large ? ' arena-avatar-lg' : ''}`;
    if (!u) return `<div class="${cls} arena-avatar-empty">?</div>`;
    if (u.avatar_url) {
      return `<img class="${cls}" src="${escapeHtml(u.avatar_url)}" alt="" loading="lazy" />`;
    }
    const initial = (u.display_name || u.username || '?').slice(0, 1).toUpperCase();
    return `<div class="${cls} arena-avatar-letter">${escapeHtml(initial)}</div>`;
  }

  function diffDot(diff) {
    const order = ['easy', 'medium', 'hard', 'insane'];
    const idx = order.indexOf((diff || '').toLowerCase());
    const lvl = idx >= 0 ? idx + 1 : 1;
    return `<span class="diff-dots" data-diff="${escapeHtml((diff || '').toLowerCase())}" style="margin-left:0;">
      ${Array.from({ length: 4 }, (_, i) => `<span class="dot${i < lvl ? ' on' : ''}"></span>`).join('')}
    </span>`;
  }

  function fmtClock(iso) {
    if (!iso) return '--:--';
    const target = new Date(iso.replace(' ', 'T') + 'Z').getTime();
    const diff = target - Date.now();
    if (diff <= 0) return '00:00';
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function fmtElapsed(start, end) {
    if (!start) return '';
    const a = new Date(start.replace(' ', 'T') + 'Z').getTime();
    const b = end ? new Date(end.replace(' ', 'T') + 'Z').getTime() : Date.now();
    const diff = Math.max(0, Math.floor((b - a) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  /* ---- Top bar ---- */
  function renderArenaBar() {
    const d = state.duel;
    document.title = `${d.format ? d.format.name + ' ' : ''}duel #${d.id} — aysec`;

    const labels = { open: 'OPEN', active: 'LIVE', finished: 'FINISHED', cancelled: 'CANCELLED', expired: 'EXPIRED' };
    const fmt = d.format;
    const formatBadge = fmt
      ? `<span class="duel-format-badge" style="--fmt-c:${fmt.color};">${window.iconForDuelFormat ? window.iconForDuelFormat(fmt.id) : ''} ${escapeHtml(fmt.name)}</span>`
      : '';

    let label = '';
    if (d.status === 'active')   label = 'time remaining';
    else if (d.status === 'open') label = 'expires in';
    else if (d.status === 'finished') label = `took ${fmtElapsed(d.started_at, d.finished_at)}`;
    else label = labels[d.status] || d.status;

    $('#arenaClockLabel').textContent = label;
    tickClocks();   // populate immediately

    let metaHtml = `
      <span class="duel-status duel-status-${d.status}">${labels[d.status] || d.status}</span>
      ${formatBadge}
    `;
    if (d.status === 'finished' && d.winner_rating_change != null) {
      metaHtml += `
        <span class="duel-rating-swing positive">+${d.winner_rating_change}</span>
        <span class="duel-rating-swing negative">${d.loser_rating_change}</span>
      `;
    }
    metaHtml += `<span data-presence-scope="duel" data-presence-id="${d.id}"></span>`;
    $('#arenaMeta').innerHTML = metaHtml;
  }

  /* ---- Versus banner ---- */
  function renderVersus() {
    const d = state.duel;
    const winner = d.winner_id;
    const fmt = d.format;
    const finishedWithElo = d.status === 'finished' && d.winner_rating_change != null;

    const winLbl  = finishedWithElo ? `+${d.winner_rating_change}` : (fmt ? '+ELO' : `+${d.stake} XP`);
    const lossLbl = finishedWithElo ? `${d.loser_rating_change}`   : (fmt ? '−ELO' : `−${d.stake} XP`);
    const centerLabel = fmt ? `${fmt.minutes}-min ${fmt.name}` : 'Duel';

    $('#duelArena').innerHTML = `
      <div class="arena-versus-grid">
        <div class="arena-versus-side ${winner === d.challenger.id ? 'is-winner' : ''}">
          <a href="/u/${escapeHtml(d.challenger.username)}" class="arena-versus-link">
            ${avatarFor(d.challenger, true)}
            <div>
              <div class="arena-versus-name">${escapeHtml(d.challenger.display_name || d.challenger.username)}</div>
              <div class="arena-versus-handle">@${escapeHtml(d.challenger.username)}</div>
            </div>
          </a>
          ${winner === d.challenger.id ? `<div class="arena-trophy">🏆 ${escapeHtml(winLbl)}</div>` : ''}
          ${winner && winner !== d.challenger.id ? `<div class="arena-loss">${escapeHtml(lossLbl)}</div>` : ''}
        </div>

        <div class="arena-versus-mid" ${fmt ? `style="--fmt-c:${fmt.color};"` : ''}>
          ${fmt ? `<div class="arena-versus-icon">${window.iconForDuelFormat ? window.iconForDuelFormat(fmt.id) : ''}</div>` : ''}
          <div class="arena-versus-vs">VS</div>
          <div class="arena-versus-cap">${escapeHtml(centerLabel)}</div>
        </div>

        <div class="arena-versus-side ${winner && d.opponent && winner === d.opponent.id ? 'is-winner' : ''} ${!d.opponent ? 'is-empty' : ''}">
          ${d.opponent ? `
            <a href="/u/${escapeHtml(d.opponent.username)}" class="arena-versus-link">
              ${avatarFor(d.opponent, true)}
              <div>
                <div class="arena-versus-name">${escapeHtml(d.opponent.display_name || d.opponent.username)}</div>
                <div class="arena-versus-handle">@${escapeHtml(d.opponent.username)}</div>
              </div>
            </a>
          ` : `
            <div class="arena-versus-link">
              ${avatarFor(null, true)}
              <div><div class="arena-versus-name dim"><em>Awaiting acceptor</em></div></div>
            </div>
          `}
          ${winner && d.opponent && winner === d.opponent.id ? `<div class="arena-trophy">🏆 ${escapeHtml(winLbl)}</div>` : ''}
          ${winner && d.opponent && winner !== d.opponent.id ? `<div class="arena-loss">${escapeHtml(lossLbl)}</div>` : ''}
        </div>
      </div>
      ${d.message ? `<p class="arena-trash-talk">"${escapeHtml(d.message)}"</p>` : ''}
    `;
  }

  /* ---- Challenge spotlight ---- */
  function renderChallengeBox() {
    const d = state.duel;
    const v = state.viewer;
    const isDuelist = v && (v.id === d.challenger.id || (d.opponent && v.id === d.opponent.id));
    const showFlag = isDuelist && d.status === 'active';
    const box = $('#duelChallengeBox');
    const c = d.challenge;
    const src = SOURCE_LABELS[c.source || 'aysec'] || SOURCE_LABELS.aysec;

    if (showFlag || d.status !== 'active') {
      box.hidden = false;
      const externalCta = c.external_url
        ? `<a class="btn btn-primary arena-source-btn" href="${escapeHtml(c.external_url)}" target="_blank" rel="noopener" style="--src-c:${src.color};">
             ${sourceIcon(c.source, 14)} Open on ${escapeHtml(src.name)}
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="margin-left:0.2rem;"><path d="M7 17 17 7"/><polyline points="7 7 17 7 17 17"/></svg>
           </a>`
        : `<a class="btn btn-ghost btn-sm" href="/challenges/${escapeHtml(c.slug)}" target="_blank" rel="noopener">Open challenge ↗</a>`;
      box.innerHTML = `
        <div class="arena-challenge-head">
          <div class="arena-challenge-tags">
            <span class="arena-source-badge" style="--src-c:${src.color};">${sourceIcon(c.source, 12)} ${escapeHtml(src.name)}</span>
            <span class="arena-cat-pill">${escapeHtml(c.category)}</span>
            ${diffDot(c.difficulty)}
            <span class="dim mono" style="font-size:0.78rem;">${c.points} pts</span>
          </div>
        </div>
        <h2 class="arena-challenge-title">${escapeHtml(c.title)}</h2>
        ${c.description ? `<p class="arena-challenge-desc">${escapeHtml(c.description)}</p>` : ''}
        <div class="arena-challenge-actions">
          ${externalCta}
        </div>
      `;
    } else {
      box.hidden = true;
    }

    $('#duelFlagBox').hidden = !showFlag;
  }

  /* ---- Side rail ---- */
  function renderStats() {
    const d = state.duel;
    const c = d.challenge;
    const src = SOURCE_LABELS[c.source || 'aysec'] || SOURCE_LABELS.aysec;
    $('#duelStats').innerHTML = `
      <div class="stat"><span class="stat-key">status</span><span class="stat-val">${escapeHtml(d.status)}</span></div>
      ${d.format ? `<div class="stat"><span class="stat-key">format</span><span class="stat-val" style="color:${d.format.color};">${window.iconForDuelFormat ? window.iconForDuelFormat(d.format.id) : ''} ${escapeHtml(d.format.name)}</span></div>` : ''}
      <div class="stat"><span class="stat-key">source</span><span class="stat-val" style="color:${src.color};">${escapeHtml(src.name)}</span></div>
      <div class="stat"><span class="stat-key">category</span><span class="stat-val">${escapeHtml(c.category)}</span></div>
      <div class="stat"><span class="stat-key">difficulty</span><span class="stat-val">${escapeHtml(c.difficulty)}</span></div>
      <div class="stat"><span class="stat-key">points</span><span class="stat-val">${c.points}</span></div>
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
      if (!confirm('Forfeit? You drop rating and the duel ends.')) return;
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
    $('#timelineCount').textContent = `${subs.length} submission${subs.length === 1 ? '' : 's'}`;
    if (!subs.length) {
      box.innerHTML = `<p class="muted">No submissions yet — be the first to fire.</p>`;
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

  /* ---- Tickers ---- */
  function tickClocks() {
    const d = state?.duel;
    if (!d) return;
    const clock = $('#arenaClock');
    if (!clock) return;
    if (d.status === 'active' || d.status === 'open') {
      clock.textContent = fmtClock(d.expires_at);
      clock.classList.toggle('is-low', secsRemaining(d.expires_at) < 60);
      clock.classList.toggle('is-critical', secsRemaining(d.expires_at) < 15);
      // If we crossed expiry locally, force a refetch to flip status server-side
      if (d.status === 'active' && secsRemaining(d.expires_at) <= 0) {
        load();
      }
    } else if (d.status === 'finished' && d.started_at && d.finished_at) {
      clock.textContent = fmtElapsed(d.started_at, d.finished_at);
      clock.classList.remove('is-low', 'is-critical');
    } else {
      clock.textContent = '00:00';
    }
  }
  function secsRemaining(iso) {
    if (!iso) return 0;
    const target = new Date(iso.replace(' ', 'T') + 'Z').getTime();
    return Math.max(0, Math.floor((target - Date.now()) / 1000));
  }
  function startClocks() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tickClocks, 1000);
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!state?.duel) return;
      if (state.duel.status === 'open' || state.duel.status === 'active') load(true);
    }, 4000);
  }

  async function load(silent = false) {
    try {
      const data = await window.api.get(`/api/duels/${id}`);
      state = data;
      renderArenaBar();
      renderVersus();
      renderChallengeBox();
      renderStats();
      renderActions();
      renderTimeline();
    } catch (err) {
      if (!silent) {
        $('#duelArena').innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Duel not found')}</div>`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    startClocks();
    startPolling();

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
          const r = res.rating_delta;
          alertEl.textContent = r
            ? `🩸 First flag — you took the swing. +${r.win} rating${res.streak_bonus ? ` (+${res.streak_bonus} streak)` : ''}.`
            : `🩸 First flag — you took the pot. +${res.stake} XP.`;
        } else if (res.correct) {
          alertEl.hidden = false;
          alertEl.className = 'alert warn';
          alertEl.textContent = 'Correct flag — but the other side beat you to it. Solve credited anyway.';
        } else {
          alertEl.hidden = false;
          alertEl.className = 'alert warn';
          alertEl.textContent = 'Wrong flag. Keep trying — clock is ticking.';
          // Quick wiggle so the input visually rejects
          $('#duelFlagInput').classList.add('arena-flag-wrong');
          setTimeout(() => $('#duelFlagInput').classList.remove('arena-flag-wrong'), 380);
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
