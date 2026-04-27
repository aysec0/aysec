(() => {
  let all = [];
  let cat = 'all';
  let query = '';

  function card(c) {
    return `
      <a class="cheatsheet-card" href="/cheatsheets/${escapeHtml(c.slug)}" data-cat="${escapeHtml(c.category || 'misc')}">
        <span class="cheatsheet-card-cat">${escapeHtml(c.category || 'misc')}</span>
        <h3 class="cheatsheet-name">${escapeHtml(c.title)}</h3>
        <p class="cheatsheet-sub">${escapeHtml(c.subtitle || '')}</p>
        <div class="cheatsheet-card-foot">
          <span>${(c.body_size || 0).toLocaleString()} chars</span>
          <span>updated ${escapeHtml(window.fmtRelative(c.updated_at))}</span>
        </div>
      </a>`;
  }

  function render() {
    const grid = document.getElementById('cheatGrid');
    const empty = document.getElementById('emptyState');
    let items = all.slice();
    if (cat !== 'all') items = items.filter((c) => c.category === cat);
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((c) =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.subtitle || '').toLowerCase().includes(q));
    }
    if (!items.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = `<div class="empty"><h3>No cheatsheets match</h3><p>Try a different filter.</p></div>`;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = items.map(card).join('');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('#catChips .chip').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#catChips .chip').forEach((x) => x.classList.toggle('active', x === b));
        cat = b.dataset.cat;
        render();
      });
    });
    document.getElementById('searchInput').addEventListener('input', (e) => {
      query = e.target.value.trim();
      render();
    });
    try {
      const data = await window.api.get('/api/cheatsheets');
      all = data.cheatsheets || [];
      render();
    } catch {
      document.getElementById('cheatGrid').innerHTML = `<div class="empty"><h3>Could not load</h3></div>`;
    }
  });
})();
