(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function fmtTime(min) {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  async function load() {
    try {
      const r = await window.api.get('/api/assessments');
      if (!r.assessments.length) { $('aGrid').hidden = true; $('aEmpty').hidden = false; return; }
      $('aGrid').innerHTML = r.assessments.map((a) => `
        <a class="tools-index-card" href="/assessments/${a.slug}">
          <div class="tools-index-card-head">
            <span class="tools-index-card-tag">${a.cert_code || 'exam'}</span>
            <span class="tools-index-card-tag" data-difficulty="${a.difficulty || ''}">${a.difficulty || ''}</span>
          </div>
          <h3 class="tools-index-card-title">${escapeHtml(a.title)}</h3>
          <p class="tools-index-card-desc">${escapeHtml(a.description || '')}</p>
          <div class="dim mono" style="font-size:0.78rem; margin-top:0.4rem;">${a.machine_count} machines · ${fmtTime(a.time_limit_minutes)} limit · ${a.passing_points} pts to pass</div>
        </a>
      `).join('');
    } catch (e) {
      $('aGrid').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">${escapeHtml(e.message)}</p></div>`;
    }
  }
  document.addEventListener('DOMContentLoaded', load);
})();
