/* ⌘K command palette — global search across courses, challenges, posts, pages. */
(() => {
  let overlay = null;
  let inputEl = null;
  let resultsEl = null;
  let cache = null;
  let active = 0;
  let results = [];

  const STATIC_PAGES = [
    { type: 'page', title: 'Home',           url: '/' },
    { type: 'page', title: 'Courses',        url: '/courses' },
    { type: 'page', title: 'CTF Challenges', url: '/challenges' },
    { type: 'page', title: 'Duels',          url: '/duels' },
    { type: 'page', title: 'Community',      url: '/community' },
    { type: 'page', title: 'Writeups',       url: '/community?cat=writeups' },
    { type: 'page', title: 'Pricing',        url: '/pricing' },
    { type: 'page', title: 'About',          url: '/about' },
    { type: 'page', title: 'Talks',          url: '/talks' },
    { type: 'page', title: 'Hire me',        url: '/hire' },
    { type: 'page', title: 'Dashboard',      url: '/dashboard' },
    { type: 'page', title: 'Sign in',        url: '/login' },
    { type: 'page', title: 'Create account', url: '/signup' },
    { type: 'page', title: 'Terms',          url: '/terms' },
    { type: 'page', title: 'Privacy',        url: '/privacy' },
    { type: 'page', title: 'Refunds',        url: '/refunds' },
  ];

  const TYPE_ICON = {
    course:    '<svg class="cmdk-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    challenge: '<svg class="cmdk-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    post:      '<svg class="cmdk-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    page:      '<svg class="cmdk-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  };

  async function loadIndex() {
    if (cache) return cache;
    try {
      const [c, ch, p] = await Promise.all([
        window.api.get('/api/courses').catch(() => ({ courses: [] })),
        window.api.get('/api/challenges').catch(() => ({ challenges: [] })),
        window.api.get('/api/posts').catch(() => ({ posts: [] })),
      ]);
      cache = [
        ...STATIC_PAGES,
        ...(c.courses    || []).map((x) => ({ type: 'course',    title: x.title, sub: x.subtitle || '',   url: `/courses/${x.slug}` })),
        ...(ch.challenges|| []).map((x) => ({ type: 'challenge', title: x.title, sub: `${x.category} · ${x.difficulty} · ${x.points}pt`, url: `/challenges/${x.slug}` })),
        ...(p.posts      || []).map((x) => ({ type: 'post',      title: x.title, sub: x.excerpt || '',    url: x.migrated_to_forum_id ? `/community/post/${x.migrated_to_forum_id}` : `/blog/${x.slug}` })),
      ];
    } catch {
      cache = STATIC_PAGES.slice();
    }
    return cache;
  }

  function score(item, q) {
    if (!q) return 0;
    const hay = `${item.title} ${item.sub || ''} ${item.url}`.toLowerCase();
    if (hay.startsWith(q)) return 100;
    if (hay.includes(q)) return 50;
    // substring per word
    let ok = 0;
    for (const w of q.split(/\s+/)) {
      if (w && hay.includes(w)) ok++;
    }
    return ok ? 10 + ok : 0;
  }

  function render() {
    if (!resultsEl) return;
    if (!results.length) {
      resultsEl.innerHTML = `<div class="cmdk-empty">No matches.</div>`;
      return;
    }
    // Group by type
    const groups = {};
    results.forEach((r) => {
      (groups[r.type] = groups[r.type] || []).push(r);
    });
    const groupOrder = ['course', 'challenge', 'post', 'page'];
    const groupLabel = { course: 'Courses', challenge: 'CTF Challenges', post: 'Writeups', page: 'Pages' };

    let idx = -1;
    let html = '';
    for (const k of groupOrder) {
      if (!groups[k]) continue;
      html += `<div class="cmdk-group-title">${groupLabel[k]}</div>`;
      for (const item of groups[k]) {
        idx++;
        html += `
          <div class="cmdk-item${idx === active ? ' is-active' : ''}" data-idx="${idx}" data-url="${item.url}">
            ${TYPE_ICON[item.type] || ''}
            <div style="min-width:0; flex:1;">
              <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.title)}</div>
              ${item.sub ? `<div class="cmdk-item-meta" style="margin-left:0; font-size:0.74rem; color:var(--text-dim); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.sub)}</div>` : ''}
            </div>
            <span class="cmdk-item-meta">${item.url}</span>
          </div>`;
      }
    }
    resultsEl.innerHTML = html;
    resultsEl.querySelectorAll('.cmdk-item').forEach((el) => {
      el.addEventListener('mousemove', () => {
        const i = Number(el.dataset.idx);
        if (i !== active) { active = i; render(); }
      });
      el.addEventListener('click', () => navigateTo(el.dataset.url));
    });
  }

  async function search(q) {
    q = (q || '').trim().toLowerCase();
    const idx = await loadIndex();
    if (!q) {
      results = idx.slice(0, 30);
    } else {
      results = idx
        .map((it) => ({ it, s: score(it, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 40)
        .map((x) => x.it);
    }
    active = 0;
    render();
  }

  function navigateTo(url) {
    close();
    location.href = url;
  }

  function open() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk" role="dialog" aria-label="Search">
        <div class="cmdk-input-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="cmdk-input" id="cmdkInput" type="search" placeholder="Search courses, challenges, blog posts, pages…" autocomplete="off" />
          <kbd>esc</kbd>
        </div>
        <div class="cmdk-results" id="cmdkResults"></div>
        <div class="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>⏎</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    inputEl = document.getElementById('cmdkInput');
    resultsEl = document.getElementById('cmdkResults');

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    inputEl.addEventListener('input', () => search(inputEl.value));
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(results.length - 1, active + 1); render(); ensureVisible(); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); active = Math.max(0, active - 1); render(); ensureVisible(); }
      else if (e.key === 'Enter')      { e.preventDefault(); if (results[active]) navigateTo(results[active].url); }
    });

    setTimeout(() => inputEl.focus(), 30);
    search('');
  }

  function ensureVisible() {
    const el = resultsEl?.querySelector('.cmdk-item.is-active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    inputEl = null;
    resultsEl = null;
    results = [];
  }

  function isTypingTarget(t) {
    const tag = (t?.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      overlay ? close() : open();
      return;
    }
    if (overlay && e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (!overlay && e.key === '/' && !isTypingTarget(e.target)) {
      e.preventDefault();
      open();
    }
  });

  // Wire up the navbar trigger button (rendered by layout.js)
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('#cmdkTrigger');
    if (t) { e.preventDefault(); open(); }
  });
})();
