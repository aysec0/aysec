/* /search — global FTS5-backed search page.
 * Reflects ?q=… in the URL so results link out cleanly; debounces input
 * so typing doesn't fire 5 queries a second.
 */
(() => {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  const filters = document.getElementById('searchFilters');
  const results = document.getElementById('searchResults');

  const TYPE_LABEL = {
    course: 'Course', lesson: 'Lesson', post: 'Post',
    challenge: 'Challenge', cheatsheet: 'Cheatsheet', cert: 'Cert prep',
  };
  const TYPE_COLOR = {
    course: 'var(--course)', lesson: 'var(--accent)', post: 'var(--blog)',
    challenge: 'var(--challenge)', cheatsheet: 'var(--medium)', cert: 'var(--ai)',
  };

  let activeType = '';
  let queryTimer = null;

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return escapeHtml(text);
    let out = escapeHtml(text);
    for (const t of tokens) {
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    }
    return out;
  }

  async function runSearch() {
    const q = input.value.trim();
    const url = new URL(location.href);
    if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    if (activeType) url.searchParams.set('type', activeType); else url.searchParams.delete('type');
    history.replaceState(null, '', url.toString());

    if (q.length < 2) {
      results.innerHTML = `<div class="empty"><p class="dim">Type at least 2 characters.</p></div>`;
      filters.hidden = true;
      return;
    }
    results.innerHTML = `<div class="search-loading"><div class="spinner"></div> Searching…</div>`;
    filters.hidden = false;
    try {
      const params = new URLSearchParams({ q });
      if (activeType) params.set('type', activeType);
      const r = await window.api.get('/api/search?' + params);
      renderResults(r, q);
    } catch (err) {
      results.innerHTML = `<div class="alert error">${escapeHtml(err.message || 'search failed')}</div>`;
    }
  }

  function renderResults(r, q) {
    if (!r.results.length) {
      results.innerHTML = `<div class="empty"><h3>No matches</h3><p class="dim">Try fewer or different keywords.</p></div>`;
      return;
    }
    if (activeType) {
      results.innerHTML = renderGroup(activeType, r.results, q);
      return;
    }
    // Render groups in a fixed order
    const order = ['course', 'lesson', 'post', 'challenge', 'cheatsheet', 'cert'];
    const html = order
      .filter((t) => r.grouped[t]?.length)
      .map((t) => renderGroup(t, r.grouped[t], q))
      .join('');
    results.innerHTML = html;
  }

  function renderGroup(type, items, q) {
    return `
      <section class="search-group">
        <header class="search-group-head">
          <span class="search-group-tag" style="--type-color: ${TYPE_COLOR[type] || 'var(--accent)'};">${TYPE_LABEL[type] || type}</span>
          <span class="search-group-count">${items.length} match${items.length === 1 ? '' : 'es'}</span>
        </header>
        <ul class="search-group-list">
          ${items.map((it) => `
            <li class="search-result">
              <a href="${escapeHtml(it.url)}" class="search-result-link">
                <h3 class="search-result-title">${highlight(it.title, q)}</h3>
                <p class="search-result-snippet">${highlight(it.snippet, q)}</p>
                <span class="search-result-url mono">${escapeHtml(it.url)}</span>
              </a>
            </li>`).join('')}
        </ul>
      </section>`;
  }

  // ---- Wiring ----
  form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(queryTimer); runSearch(); });
  input.addEventListener('input', () => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(runSearch, 320);
  });
  filters.querySelectorAll('[data-type]').forEach((b) => {
    b.addEventListener('click', () => {
      activeType = b.dataset.type;
      filters.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('is-active', x === b));
      runSearch();
    });
  });

  // Pre-fill from ?q= and ?type=
  const params = new URLSearchParams(location.search);
  if (params.get('type')) {
    activeType = params.get('type');
    filters.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('is-active', b.dataset.type === activeType));
  }
  if (params.get('q')) {
    input.value = params.get('q');
    runSearch();
  }
})();
