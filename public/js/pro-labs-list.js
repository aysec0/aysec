(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  async function load() {
    try {
      const r = await window.api.get('/api/pro-labs');
      if (!r.labs.length) { $('plGrid').hidden = true; $('plEmpty').hidden = false; return; }
      $('plGrid').innerHTML = r.labs.map((l) => `
        <a class="tools-index-card" href="/pro-labs/${l.slug}">
          <div class="tools-index-card-head">
            <span class="tools-index-card-tag">${l.machine_count} hosts</span>
            <span class="tools-index-card-tag" data-difficulty="${l.difficulty || ''}">${l.difficulty || ''}</span>
          </div>
          <h3 class="tools-index-card-title">${escapeHtml(l.title)}</h3>
          <p class="tools-index-card-desc">${escapeHtml(l.scenario || l.description || '')}</p>
          <div class="dim mono" style="font-size:0.78rem; margin-top:0.4rem;">${l.players} players have engaged</div>
        </a>
      `).join('');
    } catch (e) {
      $('plGrid').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">${escapeHtml(e.message)}</p></div>`;
    }
  }
  document.addEventListener('DOMContentLoaded', load);
})();
