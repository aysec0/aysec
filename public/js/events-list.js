(() => {
  let all = [];
  let kind = 'all';
  let region = 'all';
  let when = 'upcoming';
  let today = '';

  function fmtMonth(d) { return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
  function fmtDay(s)   { return new Date(s + 'T00:00:00Z').getUTCDate(); }
  function fmtMonthShort(s) { return new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short' }); }
  function fmtYear(s)  { return new Date(s + 'T00:00:00Z').getUTCFullYear(); }
  function fmtRange(s, e) {
    if (!e || e === s) return new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const a = new Date(s + 'T00:00:00Z');
    const b = new Date(e + 'T00:00:00Z');
    if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
      return a.toLocaleDateString(undefined, { month: 'short' }) + ` ${a.getUTCDate()}-${b.getUTCDate()}, ${a.getUTCFullYear()}`;
    }
    return a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function row(ev) {
    return `
      <a class="event-card" href="/events/${escapeHtml(ev.slug)}">
        <div class="event-date">
          <span class="event-date-month">${escapeHtml(fmtMonthShort(ev.start_date))}</span>
          <span class="event-date-day">${fmtDay(ev.start_date)}</span>
          <span class="event-date-year">${fmtYear(ev.start_date)}</span>
        </div>
        <div>
          <div class="event-info-title">${escapeHtml(ev.name)}</div>
          <div class="event-info-meta">
            <span class="event-kind" data-kind="${escapeHtml(ev.kind)}">${escapeHtml(ev.kind)}</span>
            ${ev.format    ? `<span>${escapeHtml(ev.format)}</span>` : ''}
            <span>${escapeHtml(fmtRange(ev.start_date, ev.end_date))}</span>
            ${ev.location  ? `<span class="event-region">📍 ${escapeHtml(ev.location)}</span>` : ''}
            ${ev.prize_pool ? `<span class="event-prize">${escapeHtml(ev.prize_pool)}</span>` : ''}
          </div>
          ${ev.description ? `<div class="event-info-desc">${escapeHtml(ev.description)}</div>` : ''}
        </div>
        <span class="event-cta">details</span>
      </a>`;
  }

  async function load() {
    const params = new URLSearchParams();
    if (kind   !== 'all') params.set('kind', kind);
    if (region !== 'all') params.set('region', region);
    params.set('when', when);
    const data = await window.api.get('/api/events?' + params.toString());
    all = data.events || [];
    today = data.today;
    render();
  }

  function render() {
    const list = document.getElementById('eventsList');
    const empty = document.getElementById('emptyState');
    if (!all.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = `<div class="empty"><h3>No events match</h3><p>Try a different filter or check back later.</p></div>`;
      return;
    }
    empty.hidden = true;

    // Group by month
    const groups = {};
    for (const ev of all) {
      const k = fmtMonth(new Date(ev.start_date + 'T00:00:00Z'));
      (groups[k] = groups[k] || []).push(ev);
    }
    list.innerHTML = Object.entries(groups).map(([m, evs]) =>
      `<div class="event-month-divider">${escapeHtml(m)}</div>` + evs.map(row).join('')
    ).join('');
  }

  function wireChips(id, set) {
    document.querySelectorAll(`#${id} .chip`).forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll(`#${id} .chip`).forEach((x) => x.classList.toggle('active', x === b));
        set(b.dataset.kind || b.dataset.region || b.dataset.when);
        load();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireChips('kindChips',   (v) => kind   = v);
    wireChips('regionChips', (v) => region = v);
    wireChips('whenChips',   (v) => when   = v);
    load();
  });
})();
