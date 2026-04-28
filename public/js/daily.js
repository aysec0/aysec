/* /daily — fetch today's challenge, run a stopwatch, submit flag, refresh leaderboard. */
(() => {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function fmtSeconds(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h ? `${h}h ` : '') + (m ? `${m}m ` : '') + `${sec}s`;
  }

  let state = { startedAt: null, stopwatchTimer: null, ch: null };

  function tickResetCountdown() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const remaining = Math.max(0, Math.floor((next - now) / 1000));
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    $('resetCountdown').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function startStopwatch() {
    if (state.stopwatchTimer) return;
    state.stopwatchTimer = setInterval(() => {
      const el = $('dailyStopwatch');
      if (!el || !state.startedAt) return;
      const sec = Math.max(0, Math.floor((Date.now() - Date.parse(state.startedAt)) / 1000));
      el.textContent = fmtSeconds(sec);
    }, 250);
  }
  function stopStopwatch() { clearInterval(state.stopwatchTimer); state.stopwatchTimer = null; }

  function renderEmpty() {
    $('dailyShell').innerHTML = `<div class="card" style="padding:1.5rem;">
      <h2 style="margin:0 0 0.5rem;">No challenge today</h2>
      <p class="dim">Check back later — admins haven’t published a daily yet.</p>
    </div>`;
  }

  function renderSolved(data) {
    const ch = data.challenge;
    $('dailyShell').innerHTML = `
      <div class="card" style="padding:1.5rem;">
        <div class="tool-out-label">// today · ${escapeHtml(data.date)}</div>
        <h2 style="margin:0.4rem 0;">${escapeHtml(ch.title)} <span class="tag" style="margin-left:0.5rem;">${ch.category}</span></h2>
        <p class="dim" style="font-size:0.9rem;">${escapeHtml(ch.description || '')}</p>
        <div style="background:color-mix(in srgb, var(--terminal,#39ff7a) 14%, transparent); border:1px solid color-mix(in srgb, var(--terminal,#39ff7a) 35%, transparent); border-radius: var(--radius-sm); padding:0.7rem 0.85rem; margin-top:0.8rem;">
          <div style="font-weight:600; color: var(--terminal,#39ff7a);">✓ Solved in ${fmtSeconds(data.me.time_seconds)}</div>
          <div class="dim" style="font-size:0.8rem; margin-top:0.2rem;">Come back tomorrow to keep your streak going.</div>
        </div>
        <a class="btn btn-ghost" href="/challenges/${ch.slug}" style="margin-top:1rem;">Open full challenge page →</a>
      </div>`;
  }

  function renderActive(data) {
    const ch = data.challenge;
    $('dailyShell').innerHTML = `
      <div class="card" style="padding:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
          <div>
            <div class="tool-out-label">// today · ${escapeHtml(data.date)}</div>
            <h2 style="margin:0.4rem 0;">${escapeHtml(ch.title)}</h2>
            <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
              <span class="tag">${ch.category}</span>
              <span class="tag" data-difficulty="${ch.difficulty}">${ch.difficulty}</span>
              <span class="tag">${ch.points} pts +${data.bonus_points} daily</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="tool-out-label">stopwatch</div>
            <div class="mono" id="dailyStopwatch" style="font-size:1.5rem; font-weight:600; color: var(--accent);">0s</div>
          </div>
        </div>
        <p style="margin-top:1rem; font-size:0.95rem;">${escapeHtml(ch.description || '')}</p>
        <form id="flagForm" style="margin-top:1rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
          <input class="input mono" id="flagInput" placeholder="aysec{...}" style="flex:1; min-width:200px;" required />
          <button class="btn btn-primary" type="submit" id="flagSubmit">Submit flag</button>
        </form>
        <div id="flagFeedback" style="margin-top:0.5rem; font-size:0.85rem;"></div>
        <div class="dim" style="font-size:0.78rem; margin-top:0.8rem;">Your stopwatch starts the moment you load this page; submit the correct flag to lock in your time.</div>
      </div>`;
    state.startedAt = state.startedAt || new Date().toISOString();
    startStopwatch();

    $('flagForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const flag = $('flagInput').value.trim();
      if (!flag) return;
      $('flagSubmit').disabled = true;
      $('flagFeedback').textContent = '';
      try {
        const r = await window.api.post('/api/daily/submit', { flag, startedAt: state.startedAt });
        if (r.correct) {
          stopStopwatch();
          await load(); // re-render as solved + refresh leaderboards
        } else {
          $('flagFeedback').textContent = '✗ Incorrect flag';
          $('flagFeedback').style.color = 'var(--hard,#ff6b6b)';
        }
      } catch (err) {
        $('flagFeedback').textContent = err.message || 'Submit failed';
        $('flagFeedback').style.color = 'var(--hard,#ff6b6b)';
      } finally {
        $('flagSubmit').disabled = false;
      }
    });
  }

  function renderSidebar(data) {
    if (data.me) {
      $('streakCurrent').textContent = data.me.streak.current;
      $('streakLongest').textContent = data.me.streak.longest;
      $('streakNote').textContent = data.me.solved
        ? '✓ today’s solve locked in — streak +1'
        : 'solve today before 00:00 UTC to keep it going';
    } else {
      $('streakCurrent').textContent = '0';
      $('streakLongest').textContent = '0';
    }
    if (data.top?.length) {
      $('dailyLeaderboard').innerHTML = data.top.map((r) =>
        `<li style="margin-bottom:0.25rem;"><span>${escapeHtml(r.display_name || r.username)}</span> <span class="dim mono" style="float:right;">${fmtSeconds(r.time_seconds)}</span></li>`
      ).join('');
    } else {
      $('dailyLeaderboard').innerHTML = '<li class="dim">no solves yet — be first</li>';
    }
  }

  async function loadStreaks() {
    try {
      const r = await window.api.get('/api/daily/streaks/top');
      $('streakLeaderboard').innerHTML = r.top.length
        ? r.top.slice(0, 10).map((u) =>
            `<li style="margin-bottom:0.25rem;"><span>${escapeHtml(u.display_name || u.username)}</span> <span class="dim mono" style="float:right;">${u.current}d / ${u.longest}d</span></li>`
          ).join('')
        : '<li class="dim">no streaks yet</li>';
    } catch {
      $('streakLeaderboard').innerHTML = '<li class="dim">offline</li>';
    }
  }

  async function load() {
    try {
      const data = await window.api.get('/api/daily/today');
      if (!data.challenge) { renderEmpty(); return; }
      state.ch = data.challenge;
      if (data.me?.solved) renderSolved(data);
      else renderActive(data);
      renderSidebar(data);
    } catch (err) {
      $('dailyShell').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">Couldn’t load today’s challenge: ${escapeHtml(err.message || 'unknown error')}</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    tickResetCountdown();
    setInterval(tickResetCountdown, 1000);
    load();
    loadStreaks();
  });
})();
