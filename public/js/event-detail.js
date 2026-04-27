(() => {
  const slug = location.pathname.split('/').filter(Boolean)[1];

  function fmtRange(s, e) {
    if (!e || e === s) return new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const a = new Date(s + 'T00:00:00Z');
    const b = new Date(e + 'T00:00:00Z');
    return a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' +
           b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function rel(s) {
    const d = new Date(s + 'T00:00:00Z').getTime();
    const diff = (d - Date.now()) / 1000;
    const days = Math.round(diff / 86400);
    if (days === 0) return 'today';
    if (days > 0)   return `in ${days} day${days === 1 ? '' : 's'}`;
    const past = -days;
    return `${past} day${past === 1 ? '' : 's'} ago`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('crumbSlug').textContent = slug;
    try {
      const { event: ev } = await window.api.get(`/api/events/${slug}`);
      document.title = `${ev.name} — aysec`;

      document.getElementById('eventHead').innerHTML = `
        <div class="detail-meta">
          <span class="event-kind" data-kind="${escapeHtml(ev.kind)}">${escapeHtml(ev.kind)}</span>
          ${ev.format ? `<span class="card-meta-item">${escapeHtml(ev.format)}</span>` : ''}
          <span class="card-meta-item">${escapeHtml(rel(ev.start_date))}</span>
        </div>
        <h1 class="detail-title">${escapeHtml(ev.name)}</h1>
        ${ev.organizer ? `<p class="muted">by <strong>${escapeHtml(ev.organizer)}</strong></p>` : ''}`;

      document.getElementById('eventDescription').innerHTML = ev.description
        ? `<p>${escapeHtml(ev.description)}</p>`
        : '<p class="muted">No description.</p>';

      document.getElementById('eventSide').innerHTML = `
        <div class="cert-hero-row"><span class="cert-hero-key">date</span><span class="cert-hero-val">${escapeHtml(fmtRange(ev.start_date, ev.end_date))}</span></div>
        ${ev.registration_deadline ? `<div class="cert-hero-row"><span class="cert-hero-key">register by</span><span class="cert-hero-val">${escapeHtml(fmtRange(ev.registration_deadline, ev.registration_deadline))}</span></div>` : ''}
        ${ev.location ? `<div class="cert-hero-row"><span class="cert-hero-key">location</span><span class="cert-hero-val">${escapeHtml(ev.location)}</span></div>` : ''}
        ${ev.region   ? `<div class="cert-hero-row"><span class="cert-hero-key">region</span><span class="cert-hero-val">${escapeHtml(ev.region)}</span></div>` : ''}
        ${ev.format   ? `<div class="cert-hero-row"><span class="cert-hero-key">format</span><span class="cert-hero-val">${escapeHtml(ev.format)}</span></div>` : ''}
        ${ev.prize_pool ? `<div class="cert-hero-row"><span class="cert-hero-key">prize pool</span><span class="cert-hero-val event-prize">${escapeHtml(ev.prize_pool)}</span></div>` : ''}
        ${ev.difficulty ? `<div class="cert-hero-row"><span class="cert-hero-key">difficulty</span><span class="cert-hero-val">${escapeHtml(ev.difficulty)}</span></div>` : ''}
        ${ev.url ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener" class="btn btn-primary btn-block">Official page →</a>` : ''}
        <a href="/api/events/${escapeHtml(ev.slug)}.ics" class="btn btn-ghost btn-block">↓ Add to calendar (.ics)</a>`;
    } catch (err) {
      document.getElementById('eventHead').innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Event not found')}</div>`;
    }
  });
})();
