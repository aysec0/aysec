(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function fmt(ev) {
    const start = new Date(ev.starts_at);
    const end   = new Date(ev.ends_at);
    return `${start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} → ${end.toLocaleString(undefined, { timeStyle: 'short' })}`;
  }

  function relCountdown(target) {
    const diff = target - Date.now();
    const abs = Math.abs(diff) / 1000;
    const d = Math.floor(abs / 86400);
    const h = Math.floor((abs % 86400) / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const sign = diff > 0 ? 'in ' : '';
    if (d > 0) return `${sign}${d}d ${h}h`;
    if (h > 0) return `${sign}${h}h ${m}m`;
    return `${sign}${m}m`;
  }

  function card(ev) {
    const status = ev.status;
    const colour = status === 'live' ? 'var(--terminal,#39ff7a)' : status === 'upcoming' ? 'var(--accent)' : 'var(--text-dim)';
    const starts = Date.parse(ev.starts_at);
    const ends   = Date.parse(ev.ends_at);
    let when;
    if (status === 'live')      when = `🔴 live · ends ${relCountdown(ends)}`;
    else if (status === 'upcoming') when = `starts ${relCountdown(starts)}`;
    else                            when = `ended ${relCountdown(ends)} ago`;
    return `
      <a class="tools-index-card" href="/live/${ev.slug}" style="border-left: 3px solid ${colour};">
        <div class="tools-index-card-head">
          <span style="font-family:var(--font-mono); font-size:0.72rem; color:${colour}; font-weight:600; text-transform:uppercase;">${status}</span>
          <span class="tools-index-card-tag">${ev.challenge_count} chals · ${ev.participants} in</span>
        </div>
        <h3 class="tools-index-card-title">${escapeHtml(ev.title)}</h3>
        <p class="tools-index-card-desc">${escapeHtml(ev.description || '')}</p>
        <div class="dim mono" style="font-size:0.78rem; margin-top:0.4rem;">${escapeHtml(fmt(ev))}</div>
        <div class="dim mono" style="font-size:0.78rem;">${when}</div>
      </a>`;
  }

  let allEvents = [];
  function render(tab) {
    const filtered = allEvents.filter((e) => e.status === tab);
    if (!filtered.length) {
      $('liveGrid').hidden = true;
      $('liveEmpty').hidden = false;
      return;
    }
    $('liveGrid').hidden = false;
    $('liveEmpty').hidden = true;
    $('liveGrid').innerHTML = filtered.map(card).join('');
  }

  async function load() {
    try {
      const r = await window.api.get('/api/ctf-events');
      allEvents = r.events;
      render('live');
      // Auto-default tab to whichever has content
      const counts = { live: 0, upcoming: 0, ended: 0 };
      allEvents.forEach((e) => counts[e.status]++);
      const best = ['live','upcoming','ended'].find((t) => counts[t] > 0) || 'live';
      [...document.querySelectorAll('#liveTabs .chip')].forEach((c) => c.classList.toggle('active', c.dataset.tab === best));
      render(best);
    } catch (e) {
      $('liveGrid').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">Couldn't load events: ${escapeHtml(e.message)}</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    document.querySelectorAll('#liveTabs .chip').forEach((c) => {
      c.addEventListener('click', () => {
        document.querySelectorAll('#liveTabs .chip').forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
        render(c.dataset.tab);
      });
    });
  });
})();
