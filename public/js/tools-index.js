/* Builds the tool-card grid on the /tools index page from the manifest.
   Each card links to /tools/<slug>. */
(() => {
  const grid = document.getElementById('toolsIndexGrid');
  const tools = window.AYSEC_TOOLS || [];
  if (!grid || !tools.length) return;

  grid.innerHTML = tools.map((t) => `
    <a class="tools-index-card" href="/tools/${t.slug}">
      <div class="tools-index-card-head">
        <span class="tools-index-card-icon">${t.icon}</span>
        <span class="tools-index-card-tag">${t.tag}</span>
      </div>
      <h3 class="tools-index-card-title">${t.title}</h3>
      <p class="tools-index-card-desc">${t.shortDesc}</p>
    </a>
  `).join('');
})();
