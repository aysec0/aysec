(() => {
  const slug = location.pathname.split('/').filter(Boolean)[1];

  function slugify(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
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
      // Heading anchor
      const a = document.createElement('a');
      a.href = `#${id}`;
      a.className = 'heading-anchor';
      a.setAttribute('aria-hidden', 'true');
      a.textContent = '#';
      h.prepend(a);
      items.push({ id, text: h.textContent.replace(/^#/, '').trim(), level: h.tagName.toLowerCase() });
    });
    return items;
  }

  function renderTOC(items) {
    const tocEl = document.getElementById('toc');
    const listEl = document.getElementById('tocList');
    if (!items || !items.length || !tocEl || !listEl) return;
    tocEl.hidden = false;
    listEl.innerHTML = items.map((it) =>
      `<li class="${it.level}"><a href="#${it.id}" data-target="${it.id}">${escapeHtml(it.text)}</a></li>`
    ).join('');

    if ('IntersectionObserver' in window) {
      const links = new Map();
      listEl.querySelectorAll('a[data-target]').forEach((a) => links.set(a.dataset.target, a));
      const visible = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        });
        // Highlight the topmost visible heading
        let active = null;
        for (const it of items) if (visible.has(it.id)) { active = it.id; break; }
        if (!active && items.length) active = items[0].id;
        links.forEach((a, id) => a.classList.toggle('is-active', id === active));
      }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 });
      items.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el) io.observe(el);
      });
    }
  }

  function addCopyButtons(bodyEl) {
    bodyEl.querySelectorAll('pre').forEach((pre) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>`;
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(pre.textContent);
          btn.classList.add('copied');
          btn.querySelector('span').textContent = 'Copied';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.querySelector('span').textContent = 'Copy';
          }, 1400);
        } catch {}
      });
      pre.appendChild(btn);
    });
  }

  function relatedCard(p) {
    return `
      <a class="card" href="/blog/${escapeHtml(p.slug)}">
        <div class="card-accent blog"></div>
        <div class="card-body">
          <span class="card-type blog">${escapeHtml(p.kind || 'post')}</span>
          <h3 class="card-title">${escapeHtml(p.title)}</h3>
          <p class="card-desc">${escapeHtml(p.excerpt || '')}</p>
          <div class="card-meta">
            <span class="card-meta-item dim">${window.fmtRelative(p.published_at)}</span>
          </div>
          <span class="card-cta">Read</span>
        </div>
      </a>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('crumbSlug').textContent = slug;
    const headEl = document.getElementById('postHead');
    const bodyEl = document.getElementById('postBody');
    const shareRow = document.getElementById('shareRow');

    try {
      const { post, related } = await window.api.get(`/api/posts/${slug}`);
      document.title = `${post.title} — aysec`;

      const tags = (post.tags || '').split(',').filter(Boolean);
      headEl.innerHTML = `
        <div class="detail-meta">
          <span class="card-type blog">${escapeHtml(post.kind || 'post')}</span>
          ${tags.slice(0, 4).map((t) => `<span class="tag">${escapeHtml(t.trim())}</span>`).join('')}
        </div>
        <h1 class="detail-title">${escapeHtml(post.title)}</h1>
        <p class="muted">
          Published ${escapeHtml(window.fmtDate(post.published_at))} · ${post.reading_minutes || 1} min read
        </p>
        <div style="margin-top:0.6rem;"><button type="button" data-bookmark-kind="post" data-bookmark-slug="${escapeHtml(post.slug)}">Save</button></div>`;

      bodyEl.innerHTML = post.content_html || '<p class="muted">No content.</p>';

      const tocItems = buildTOC(bodyEl);
      renderTOC(tocItems);
      addCopyButtons(bodyEl);

      // Syntax highlighting via Prism (autoloader fetches needed grammars)
      bodyEl.querySelectorAll('pre code').forEach((el) => {
        // Try to infer language from class set by marked (e.g. `language-python`)
        if (![...el.classList].some((c) => c.startsWith('language-'))) {
          el.classList.add('language-text');
        }
      });
      if (window.Prism) {
        // Prism autoloader needs paths — set the CDN base
        if (window.Prism.plugins?.autoloader) {
          window.Prism.plugins.autoloader.languages_path = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
        }
        window.Prism.highlightAllUnder(bodyEl);
      }

      shareRow.innerHTML = `<button class="btn btn-ghost" id="copyLinkBtn">Copy link</button>`;
      document.getElementById('copyLinkBtn').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          const b = document.getElementById('copyLinkBtn');
          const idle = b.textContent;
          b.textContent = '✓ Copied';
          setTimeout(() => (b.textContent = idle), 1500);
        } catch {}
      });

      if (related && related.length) {
        document.getElementById('relatedSection').hidden = false;
        document.getElementById('relatedGrid').innerHTML = related.map(relatedCard).join('');
      }
    } catch (err) {
      headEl.innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Post not found')}</div>`;
      bodyEl.innerHTML = '';
    }
  });
})();
