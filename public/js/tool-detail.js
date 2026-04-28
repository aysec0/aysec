/* Renders one tool panel into tool-detail.html based on the URL slug.
   Must run BEFORE lab.js so that lab.js's element queries find the
   freshly-rendered panel and bind their listeners. */
(() => {
  const parts = location.pathname.replace(/\/+$/, '').split('/');
  const slug  = parts[parts.length - 1];
  const tools = window.AYSEC_TOOLS || [];
  const tool  = tools.find((t) => t.slug === slug);

  const $ = (id) => document.getElementById(id);

  if (!tool) {
    // Unknown tool slug — show a small not-found state and offer the index.
    $('toolTitle').textContent = 'Unknown tool';
    $('toolDesc').textContent  = 'No tool matches /tools/' + slug + '. Browse the full list.';
    $('toolEyebrow').textContent = '// /tools/' + slug;
    $('crumbSlug').textContent = slug;
    $('toolMount').innerHTML =
      '<div class="empty"><h3>Not found</h3><p>That tool doesn’t exist.</p>' +
      '<a class="btn btn-primary" href="/tools">← Back to all tools</a></div>';
    document.title = 'Tool not found — aysec';
    return;
  }

  // Header
  $('toolTitle').textContent = tool.title;
  $('toolDesc').textContent  = tool.desc;
  $('toolEyebrow').textContent = '// /tools/' + tool.slug;
  $('crumbSlug').textContent = tool.slug;
  document.title = tool.title + ' — aysec tools';

  // Panel
  const wrap = document.createElement('div');
  wrap.className = 'tool-panel';
  wrap.id = 'tool-' + tool.slug;
  wrap.innerHTML = tool.html;
  $('toolMount').appendChild(wrap);

  $('toolFooter').hidden = false;
})();
