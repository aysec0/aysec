(() => {
  let allCourses = [];
  let filter = 'all';
  let query = '';

  function card(c) {
    const priceLabel = c.is_paid ? window.fmtPrice(c.price_cents, c.currency) : 'Free';
    const priceClass = c.is_paid ? 'paid' : 'free';
    return `
      <a class="card" href="/courses/${escapeHtml(c.slug)}">
        <div class="card-accent course"></div>
        <div class="card-body">
          <span class="card-type course">course</span>
          <h3 class="card-title">${escapeHtml(c.title)}</h3>
          <p class="card-desc">${escapeHtml(c.subtitle || '')}</p>
          <div class="card-meta">
            <span class="card-meta-item">${escapeHtml(c.difficulty || '')}</span>
            ${c.lesson_count != null ? `<span class="card-meta-item">${c.lesson_count} lessons</span>` : ''}
            <span class="badge ${priceClass}">${priceLabel}</span>
          </div>
          <span class="card-cta">Open course</span>
        </div>
      </a>`;
  }

  function applyFilter() {
    const grid = document.getElementById('coursesGrid');
    const emptyEl = document.getElementById('emptyState');
    if (!grid) return;

    let items = allCourses.slice();

    if (filter === 'free')                       items = items.filter((c) => !c.is_paid);
    else if (filter === 'paid')                  items = items.filter((c) => c.is_paid);
    else if (['beginner','intermediate','advanced'].includes(filter)) {
      items = items.filter((c) => (c.difficulty || '').toLowerCase() === filter);
    }

    if (query) {
      const q = query.toLowerCase();
      items = items.filter((c) =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.subtitle || '').toLowerCase().includes(q));
    }

    if (!items.length) {
      grid.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.innerHTML = `
        <div class="empty">
          <h3>No matches</h3>
          <p>Try a different filter or clear your search.</p>
        </div>`;
    } else {
      emptyEl.hidden = true;
      grid.innerHTML = items.map(card).join('');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('#filterChips .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#filterChips .chip').forEach((b) => b.classList.toggle('active', b === btn));
        filter = btn.dataset.filter;
        applyFilter();
      });
    });

    const search = document.getElementById('searchInput');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value.trim();
        applyFilter();
      });
    }

    try {
      const data = await window.api.get('/api/courses');
      allCourses = data.courses || [];
      applyFilter();
    } catch {
      const grid = document.getElementById('coursesGrid');
      grid.innerHTML = `<div class="empty"><h3>Could not load courses</h3><p>The server returned an error.</p></div>`;
    }
  });
})();
