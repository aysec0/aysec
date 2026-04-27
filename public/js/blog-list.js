(() => {
  let all = [];
  let kind = 'all';
  let query = '';

  function card(p) {
    return `
      <a class="card" href="/blog/${escapeHtml(p.slug)}">
        <div class="card-accent blog"></div>
        <div class="card-body">
          <span class="card-type blog">${escapeHtml(p.kind || 'post')}</span>
          <h3 class="card-title">${escapeHtml(p.title)}</h3>
          <p class="card-desc">${escapeHtml(p.excerpt || '')}</p>
          <div class="card-meta">
            ${(p.tags || '').split(',').filter(Boolean).slice(0, 3)
              .map((t) => `<span class="card-meta-item">#${escapeHtml(t.trim())}</span>`).join('')}
            <span class="card-meta-item dim">${window.fmtRelative(p.published_at)}</span>
          </div>
          <span class="card-cta">Read</span>
        </div>
      </a>`;
  }

  function render() {
    const grid = document.getElementById('postsGrid');
    const empty = document.getElementById('emptyState');
    let items = all.slice();
    if (kind !== 'all') items = items.filter((p) => p.kind === kind);
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((p) =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
        (p.tags || '').toLowerCase().includes(q));
    }
    if (!items.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = `<div class="empty"><h3>No posts</h3><p>Try a different filter.</p></div>`;
    } else {
      empty.hidden = true;
      grid.innerHTML = items.map(card).join('');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('#kindChips .chip').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#kindChips .chip').forEach((x) => x.classList.toggle('active', x === b));
        kind = b.dataset.kind;
        render();
      });
    });
    const search = document.getElementById('searchInput');
    search.addEventListener('input', () => { query = search.value.trim(); render(); });

    try {
      const data = await window.api.get('/api/posts');
      all = data.posts || [];
      render();
    } catch {
      document.getElementById('postsGrid').innerHTML = `<div class="empty"><h3>Could not load posts</h3></div>`;
    }
  });
})();
