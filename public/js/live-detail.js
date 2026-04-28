(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop();

  function fmtCountdown(targetMs) {
    const diff = targetMs - Date.now();
    const abs = Math.abs(diff) / 1000;
    const d = Math.floor(abs / 86400);
    const h = Math.floor((abs % 86400) / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = Math.floor(abs % 60);
    const sign = diff > 0 ? '' : 'past ';
    if (d > 0) return `${sign}${d}d ${h}h ${m}m`;
    return `${sign}${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  let state = { ev: null, me: null };

  function renderHeader(ev) {
    document.title = ev.title + ' — aysec';
    $('evSlug').textContent = ev.slug;
    $('evEyebrow').textContent = '// /live/' + ev.slug;
    $('evTitle').textContent = ev.title;
    $('evDesc').textContent = ev.description || '';
    const start = new Date(ev.starts_at);
    const end   = new Date(ev.ends_at);
    $('evWindow').textContent =
      `${start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} → ${end.toLocaleString(undefined, { timeStyle: 'short' })}`;
  }

  function renderStatus() {
    const ev = state.ev;
    const t = Date.now();
    const starts = Date.parse(ev.starts_at);
    const ends   = Date.parse(ev.ends_at);
    let label, target, colour;
    if (t < starts)      { label = 'Upcoming';   target = starts; colour = 'var(--accent)'; }
    else if (t < ends)   { label = '🔴 Live now'; target = ends;   colour = 'var(--terminal,#39ff7a)'; }
    else                 { label = 'Ended';       target = ends;   colour = 'var(--text-dim)'; }
    $('evStatus').textContent = label;
    $('evStatus').style.color = colour;
    $('evCountdown').textContent = (t < starts ? 'starts in ' : t < ends ? 'ends in ' : 'ended ') + fmtCountdown(target);
  }

  function renderActions() {
    const ev = state.ev;
    const me = state.me;
    const t = Date.now();
    const starts = Date.parse(ev.starts_at);
    const ends   = Date.parse(ev.ends_at);
    if (t < starts) {
      $('evActions').innerHTML = `<div class="alert info"><div>Event hasn’t started — set a calendar reminder.</div></div>`;
      return;
    }
    if (t > ends) {
      $('evActions').innerHTML = `<div class="alert info"><div>Event ended. Final scoreboard ↓</div></div>`;
      return;
    }
    if (!me) {
      $('evActions').innerHTML = `<div class="alert info"><div>Sign in to join the event.</div></div>`;
      return;
    }
    if (me.joined) {
      $('evActions').innerHTML = `<div class="alert info"><div>✓ You’re in. Submit flags below.</div></div>`;
      return;
    }
    $('evActions').innerHTML = `<button class="btn btn-primary" id="joinBtn">Join event</button>`;
    $('joinBtn').addEventListener('click', async () => {
      try {
        await window.api.post(`/api/ctf-events/${slug}/join`, {});
        await load();
      } catch (e) { alert(e.message); }
    });
  }

  function renderChallenges(challenges) {
    const ev = state.ev;
    const me = state.me;
    const t = Date.now();
    const live = t >= Date.parse(ev.starts_at) && t <= Date.parse(ev.ends_at);
    const solved = new Set(me?.solved || []);
    if (!challenges.length) {
      $('evChallenges').innerHTML = '<div class="dim">No challenges configured for this event yet.</div>';
      return;
    }
    $('evChallenges').innerHTML = challenges.map((c) => {
      const have = solved.has(c.id);
      return `
        <div class="card" style="padding:1rem 1.2rem; border-left: 3px solid ${have ? 'var(--terminal,#39ff7a)' : 'var(--border)'};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
            <div>
              <div style="font-weight:600;">${escapeHtml(c.title)}</div>
              <div class="dim" style="font-size:0.78rem; margin-top:0.15rem;">${c.category} · ${c.difficulty} · ${c.points} pts</div>
            </div>
            ${have ? '<span class="tag" style="background: color-mix(in srgb, var(--terminal,#39ff7a) 18%, transparent); color: var(--terminal,#39ff7a);">solved</span>' : ''}
          </div>
          ${live && me?.joined && !have ? `
            <form data-slug="${c.slug}" class="ev-flag-form" style="margin-top:0.7rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
              <input class="input mono" name="flag" placeholder="aysec{...}" style="flex:1; min-width:180px;" required />
              <button class="btn btn-primary" type="submit">Submit</button>
            </form>
            <div class="ev-flag-feedback dim" style="font-size:0.8rem; margin-top:0.3rem;"></div>
          ` : ''}
        </div>`;
    }).join('');

    document.querySelectorAll('.ev-flag-form').forEach((f) => {
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fb = f.parentElement.querySelector('.ev-flag-feedback');
        try {
          const r = await window.api.post(`/api/ctf-events/${slug}/submit`, {
            challenge_slug: f.dataset.slug,
            flag: f.elements.flag.value.trim(),
          });
          if (r.correct) { fb.textContent = '✓ correct — refreshing'; fb.style.color = 'var(--terminal,#39ff7a)'; await load(); }
          else { fb.textContent = '✗ incorrect'; fb.style.color = 'var(--hard,#ff6b6b)'; }
        } catch (err) { fb.textContent = err.message; fb.style.color = 'var(--hard,#ff6b6b)'; }
      });
    });
  }

  function renderBoard(board) {
    if (!board.length) { $('evBoard').innerHTML = '<li class="dim">no solves yet</li>'; return; }
    $('evBoard').innerHTML = board.slice(0, 20).map((r, i) =>
      `<li style="margin-bottom:0.25rem;"><span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} ${escapeHtml(r.display_name || r.username)}</span> <span class="dim mono" style="float:right;">${r.score} · ${r.solves} chal</span></li>`
    ).join('');
  }

  async function load() {
    try {
      const r = await window.api.get(`/api/ctf-events/${slug}`);
      state.ev = r.event;
      state.me = r.me;
      renderHeader(r.event);
      renderStatus();
      renderActions();
      renderChallenges(r.challenges);
      renderBoard(r.board);
    } catch (e) {
      $('evTitle').textContent = 'Event not found';
      $('evDesc').textContent = e.message || '';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    setInterval(() => state.ev && renderStatus(), 1000);
    setInterval(load, 15000); // refresh scoreboard every 15s
  });
})();
