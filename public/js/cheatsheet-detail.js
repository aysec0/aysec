(() => {
  const slug = location.pathname.split('/').filter(Boolean)[1];

  function slugify(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function buildTOC(bodyEl) {
    const headings = bodyEl.querySelectorAll('h2, h3, h4');
    if (headings.length < 2) return null;
    const used = new Map();
    const items = [];
    headings.forEach((h) => {
      let id = slugify(h.textContent);
      if (used.has(id)) { used.set(id, used.get(id) + 1); id = `${id}-${used.get(id)}`; }
      else used.set(id, 1);
      h.id = id;
      const a = document.createElement('a');
      a.href = `#${id}`; a.className = 'heading-anchor'; a.textContent = '#';
      a.setAttribute('aria-hidden', 'true');
      h.prepend(a);
      items.push({ id, text: h.textContent.replace(/^#/, '').trim(), level: h.tagName.toLowerCase() });
    });
    return items;
  }

  function renderTOC(items) {
    if (!items?.length) return;
    const tocEl = document.getElementById('toc');
    const listEl = document.getElementById('tocList');
    tocEl.hidden = false;
    listEl.innerHTML = items.map((it) =>
      `<li class="${it.level}"><a href="#${it.id}" data-target="${it.id}">${escapeHtml(it.text)}</a></li>`
    ).join('');
    if ('IntersectionObserver' in window) {
      const links = new Map();
      listEl.querySelectorAll('a[data-target]').forEach((a) => links.set(a.dataset.target, a));
      const visible = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
        let active = null;
        for (const it of items) if (visible.has(it.id)) { active = it.id; break; }
        if (!active && items.length) active = items[0].id;
        links.forEach((a, id) => a.classList.toggle('is-active', id === active));
      }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 });
      items.forEach(({ id }) => { const el = document.getElementById(id); if (el) io.observe(el); });
    }
  }

  function addCopyButtons(bodyEl) {
    bodyEl.querySelectorAll('pre').forEach((pre) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'copy-btn';
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>`;
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(pre.textContent);
          btn.classList.add('copied'); btn.querySelector('span').textContent = 'Copied';
          setTimeout(() => { btn.classList.remove('copied'); btn.querySelector('span').textContent = 'Copy'; }, 1200);
        } catch {}
      });
      pre.appendChild(btn);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('crumbSlug').textContent = slug;
    const headEl = document.getElementById('cheatHead');
    const bodyEl = document.getElementById('cheatBody');
    try {
      const { cheatsheet } = await window.api.get(`/api/cheatsheets/${slug}`);
      document.title = `${cheatsheet.title} cheatsheet — aysec`;

      headEl.innerHTML = `
        <div class="detail-meta">
          <span class="cheatsheet-card-cat">${escapeHtml(cheatsheet.category || 'misc')}</span>
        </div>
        <h1 class="detail-title" style="font-family:var(--font-mono);">${escapeHtml(cheatsheet.title)}</h1>
        <p class="detail-subtitle">${escapeHtml(cheatsheet.subtitle || '')}</p>
        ${cheatsheet.tool_url ? `<p class="muted"><a href="${escapeHtml(cheatsheet.tool_url)}" target="_blank" rel="noopener">official site →</a></p>` : ''}
        <div style="margin-top:0.6rem;"><button type="button" data-bookmark-kind="cheatsheet" data-bookmark-slug="${escapeHtml(cheatsheet.slug)}">Save</button></div>`;

      bodyEl.innerHTML = cheatsheet.content_html || '<p class="muted">No content.</p>';
      renderTOC(buildTOC(bodyEl));
      addCopyButtons(bodyEl);

      bodyEl.querySelectorAll('pre code').forEach((el) => {
        if (![...el.classList].some((c) => c.startsWith('language-'))) el.classList.add('language-bash');
      });
      if (window.Prism?.plugins?.autoloader) {
        window.Prism.plugins.autoloader.languages_path = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
      }
      if (window.Prism) window.Prism.highlightAllUnder(bodyEl);
    } catch (err) {
      headEl.innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Cheatsheet not found')}</div>`;
      bodyEl.innerHTML = '';
    }
  });
})();
