/* /community/post/:id — single post + threaded comments. */
(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const md = (s) => {
    if (!window.marked) return escapeHtml(s);
    const raw = window.marked.parse(s || '', { gfm: true, breaks: true });
    return window.DOMPurify ? window.DOMPurify.sanitize(raw) : escapeHtml(s);
  };
  const postId = Number(location.pathname.replace(/\/+$/, '').split('/').pop());
  let me = null;
  let postAuthor = null;            // username of the post author (for OP badge)
  const collapsed = new Set();      // comment ids whose subtree is collapsed
  const SORT_KEY = 'forum.commentSort';
  const sortable = ['top', 'new', 'old'];
  let sort = sortable.includes(localStorage.getItem(SORT_KEY)) ? localStorage.getItem(SORT_KEY) : 'top';

  function relTime(s) {
    if (!s) return '';
    const t = new Date(s.replace(' ', 'T') + 'Z').getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60)        return 'just now';
    if (diff < 3600)      return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400)     return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderPost(p) {
    document.title = p.title + ' — community — aysec';
    $('postCrumb').textContent = p.id;
    $('postEyebrow').textContent = `// /community/${p.cat_slug}`;
    postAuthor = p.username;
    const isAdmin = me?.role === 'admin';
    const canDelete = me && (me.username === p.username || isAdmin);
    $('postBody').innerHTML = `
      <article class="forum-post forum-post-detail" data-id="${p.id}">
        <div class="forum-vote">
          <button class="forum-arrow ${p.my_vote === 1 ? 'is-up' : ''}" data-v="1">▲</button>
          <div class="forum-score">${p.score}</div>
          <button class="forum-arrow ${p.my_vote === -1 ? 'is-down' : ''}" data-v="-1">▼</button>
        </div>
        <div class="forum-body">
          <div class="forum-meta">
            <span class="forum-cat-pill" style="--cat: ${p.cat_color || 'var(--accent)'};">/${escapeHtml(p.cat_slug)}</span>
            <span class="dim">posted by <a href="/u/${escapeHtml(p.username)}">@${escapeHtml(p.username)}</a> ${relTime(p.created_at)}</span>
            ${p.is_live ? `<span class="forum-live-badge"><span class="forum-live-dot"></span> LIVE</span>` : ''}
            ${p.verified_writeup ? `<span class="forum-verified" title="Author solved ${escapeHtml(p.verified_writeup.challenge.title)}">✓ verified writeup</span>` : ''}
            ${p.pinned ? '<span class="tag" style="background: var(--accent-soft); color: var(--accent);">📌 pinned</span>' : ''}
            ${p.locked ? '<span class="tag">🔒 locked</span>' : ''}
            ${canDelete ? `<button class="forum-del" data-pdel="${p.id}">delete</button>` : ''}
            <span data-presence-scope="community-post" data-presence-id="${p.id}"></span>
          </div>
          <h1 class="forum-title-detail">${escapeHtml(p.title)}</h1>
          ${p.verified_writeup ? `
            <a class="forum-writeup-link" href="/challenges/${escapeHtml(p.verified_writeup.challenge.slug)}" target="_blank" rel="noopener">
              writeup of <strong>${escapeHtml(p.verified_writeup.challenge.title)}</strong> · ${escapeHtml(p.verified_writeup.challenge.category)} · ${escapeHtml(p.verified_writeup.challenge.difficulty)} ↗
            </a>` : ''}
          ${p.url ? `<a class="forum-url-pill" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)} ↗</a>` : ''}
          ${p.body_md ? `<div class="forum-md prose">${md(p.body_md)}</div>` : ''}
          ${isAdmin ? `
            <div class="forum-mod-row">
              <button class="forum-mod-btn ${p.pinned ? 'is-on' : ''}" data-mod="pinned">📌 ${p.pinned ? 'unpin' : 'pin'}</button>
              <button class="forum-mod-btn ${p.locked ? 'is-on' : ''}" data-mod="locked">🔒 ${p.locked ? 'unlock' : 'lock'}</button>
            </div>` : ''}
        </div>
      </article>`;
    wireVote($('postBody').querySelector('.forum-post'), `/api/forum/posts/${p.id}/vote`);
    $('postBody').querySelector('[data-pdel]')?.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      try { await window.api.del(`/api/forum/posts/${p.id}`); location.href = '/community'; }
      catch (e) { window.toast(e.message, 'error'); }
    });
    $('postBody').querySelectorAll('[data-mod]').forEach((b) => {
      b.addEventListener('click', async () => {
        const k = b.dataset.mod;
        try {
          await window.api.post(`/api/forum/posts/${p.id}/mod`, { [k]: !p[k] });
          window.toast(k + ' updated', 'success');
          await load();
        } catch (e) { window.toast(e.message, 'error'); }
      });
    });
  }

  // Count descendants for collapse-button label
  function descendantCount(id, kidsByParent) {
    const direct = kidsByParent.get(id) || [];
    return direct.length + direct.reduce((acc, k) => acc + descendantCount(k.id, kidsByParent), 0);
  }

  function commentNode(c, kidsByParent, depth = 0) {
    const isOp = postAuthor && c.username === postAuthor;
    const isCollapsed = collapsed.has(c.id);
    const kids = kidsByParent.get(c.id) || [];
    const totalDescendants = descendantCount(c.id, kidsByParent);
    const canDelete = me && (me.id === c.user_id || me.role === 'admin');

    const childrenHtml = isCollapsed
      ? ''
      : kids.map((k) => commentNode(k, kidsByParent, depth + 1)).join('');

    return `
      <div class="forum-comment ${isCollapsed ? 'is-collapsed' : ''}${isOp ? ' is-op' : ''}" data-id="${c.id}" id="c${c.id}">
        <div class="forum-vote">
          <button class="forum-arrow ${c.my_vote === 1 ? 'is-up' : ''}" data-v="1">▲</button>
          <div class="forum-score">${c.score}</div>
          <button class="forum-arrow ${c.my_vote === -1 ? 'is-down' : ''}" data-v="-1">▼</button>
        </div>
        <div class="forum-comment-body">
          <div class="forum-meta">
            <button class="forum-comment-collapse" data-collapse="${c.id}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'}" title="${isCollapsed ? 'Expand thread' : 'Collapse thread'}">${isCollapsed ? '[+]' : '[−]'}</button>
            <a class="forum-user" href="/u/${escapeHtml(c.username)}">@${escapeHtml(c.username)}</a>
            ${isOp ? '<span class="forum-op-badge" title="Original poster">OP</span>' : ''}
            <a class="forum-comment-time dim" href="#c${c.id}" title="Permalink">${relTime(c.created_at)}</a>
            ${isCollapsed && totalDescendants > 0 ? `<span class="forum-collapsed-info">+${totalDescendants} hidden</span>` : ''}
            ${canDelete ? `<button class="forum-del" data-cdel="${c.id}">delete</button>` : ''}
          </div>
          ${isCollapsed ? '' : `<div class="forum-md prose">${md(c.body_md)}</div>`}
          ${isCollapsed ? '' : `
            <div class="forum-actions">
              <button class="forum-reply-btn" data-reply="${c.id}">↩ reply</button>
            </div>
            <form class="forum-reply-form" data-rform="${c.id}" hidden style="margin-top:0.4rem;">
              <textarea class="textarea" rows="2" required></textarea>
              <div style="display:flex; gap:0.4rem; margin-top:0.3rem;">
                <button class="btn btn-primary btn-sm" type="submit">Post reply</button>
                <button class="btn btn-ghost btn-sm" type="button" data-rcancel="${c.id}">cancel</button>
              </div>
            </form>`}
        </div>
        ${childrenHtml}
      </div>`;
  }

  function sortComments(list, mode) {
    const arr = [...list];
    if (mode === 'top') arr.sort((a, b) => b.score - a.score || a.id - b.id);
    else if (mode === 'new') arr.sort((a, b) => b.id - a.id);
    else arr.sort((a, b) => a.id - b.id);
    return arr;
  }

  function renderComments(comments) {
    const container = $('commentsList');
    if (!comments.length) {
      container.innerHTML = '<p class="dim">No comments yet — say something useful.</p>';
      $('commentSortBar').hidden = true;
      return;
    }
    $('commentSortBar').hidden = false;

    // Group children by parent_id and sort each group consistently
    const kidsByParent = new Map();
    for (const c of comments) {
      const p = c.parent_id ?? 0;
      if (!kidsByParent.has(p)) kidsByParent.set(p, []);
      kidsByParent.get(p).push(c);
    }
    for (const [k, list] of kidsByParent) {
      kidsByParent.set(k, sortComments(list, k === 0 ? sort : 'old'));
    }
    const tops = kidsByParent.get(0) || [];
    container.innerHTML = tops.map((c) => commentNode(c, kidsByParent)).join('');
    wireCommentEvents(container);
  }

  function wireCommentEvents(container) {
    container.querySelectorAll('.forum-comment').forEach((cn) => {
      const id = Number(cn.dataset.id);
      wireVote(cn, `/api/forum/comments/${id}/vote`);
    });
    // Wire image upload onto every reply textarea (drag/drop + paste)
    container.querySelectorAll('.forum-reply-form textarea').forEach((ta) => {
      window.setupForumUpload?.(ta);
    });
    container.querySelectorAll('[data-collapse]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = Number(b.dataset.collapse);
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        load();
      });
    });
    container.querySelectorAll('[data-reply]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.reply;
        const f = container.querySelector(`[data-rform="${id}"]`);
        f.hidden = !f.hidden;
        if (!f.hidden) f.querySelector('textarea').focus();
      });
    });
    container.querySelectorAll('[data-rcancel]').forEach((b) => {
      b.addEventListener('click', () => {
        container.querySelector(`[data-rform="${b.dataset.rcancel}"]`).hidden = true;
      });
    });
    container.querySelectorAll('.forum-reply-form').forEach((f) => {
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = f.querySelector('textarea').value.trim();
        if (!body) return;
        try {
          await window.api.post(`/api/forum/posts/${postId}/comments`, { body_md: body, parent_id: Number(f.dataset.rform) });
          await load();
        } catch (err) {
          if (err.status === 401) location.href = '/login?next=' + encodeURIComponent(location.pathname);
          else window.toast(err.message, 'error');
        }
      });
    });
    container.querySelectorAll('[data-cdel]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete comment?')) return;
        try { await window.api.del(`/api/forum/comments/${b.dataset.cdel}`); await load(); }
        catch (err) { window.toast(err.message, 'error'); }
      })
    );
  }

  function wireVote(el, url) {
    el.querySelectorAll(':scope > .forum-vote .forum-arrow').forEach((b) => bindVote(b, el, url));
  }
  function bindVote(b, el, url) {
    b.addEventListener('click', async () => {
      const requested = Number(b.dataset.v);
      const already = b.classList.contains(requested === 1 ? 'is-up' : 'is-down');
      try {
        const r = await window.api.post(url, { vote: already ? 0 : requested });
        el.querySelector(':scope > .forum-vote .forum-score').textContent = r.score;
        el.querySelector(':scope > .forum-vote .forum-arrow[data-v="1"]').classList.toggle('is-up', r.my_vote === 1);
        el.querySelector(':scope > .forum-vote .forum-arrow[data-v="-1"]').classList.toggle('is-down', r.my_vote === -1);
      } catch (err) {
        if (err.status === 401) location.href = '/login?next=' + encodeURIComponent(location.pathname);
        else window.toast(err.message, 'error');
      }
    });
  }

  // Top-level comment form: wire image upload + attach button
  window.setupForumUpload?.($('commentBody'), { attachBtn: $('commentAttachBtn') });

  $('commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = e.target.elements.body_md.value.trim();
    if (!body) return;
    try {
      await window.api.post(`/api/forum/posts/${postId}/comments`, { body_md: body });
      e.target.reset();
      await load();
    } catch (err) {
      if (err.status === 401) location.href = '/login?next=' + encodeURIComponent(location.pathname);
      else window.toast(err.message, 'error');
    }
  });

  let liveStream = null;
  function maybeOpenLiveStream(post) {
    if (liveStream) { try { liveStream.close(); } catch {} liveStream = null; }
    if (!post?.is_live) return;
    try {
      liveStream = new EventSource(`/api/forum/posts/${post.id}/live`);
      liveStream.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === 'comment') {
            // Re-fetch comments so the existing render path handles sort,
            // threading, voting, and dedup. Cheaper than building a one-off
            // appender that mirrors all of renderComments().
            load(true);
          }
        } catch {}
      };
    } catch {}
  }

  async function load(silent) {
    try {
      if (!silent) me = (await window.api.get('/api/auth/me').catch(() => null))?.user || null;
      const r = await window.api.get(`/api/forum/posts/${postId}`);
      renderPost(r.post);
      $('commentsHead').textContent = `Comments (${r.comments.length})`;
      renderComments(r.comments);
      maybeOpenLiveStream(r.post);
      // If the URL has a #cN anchor, scroll to it after render
      if (!silent && location.hash && /^#c\d+$/.test(location.hash)) {
        const el = document.querySelector(location.hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('forum-comment-flash');
          setTimeout(() => el.classList.remove('forum-comment-flash'), 1600);
        }
      }
    } catch (e) {
      if (!silent) $('postBody').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">${escapeHtml(e.message)}</p></div>`;
    }
  }

  // Comment sort bar
  function wireSortBar() {
    const bar = $('commentSortBar');
    if (!bar) return;
    bar.querySelectorAll('[data-csort]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.csort === sort);
      b.addEventListener('click', () => {
        sort = b.dataset.csort;
        try { localStorage.setItem(SORT_KEY, sort); } catch {}
        bar.querySelectorAll('[data-csort]').forEach((x) => x.classList.toggle('is-active', x === b));
        load();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Inject the comment sort bar (above the list, below the heading)
    const head = $('commentsHead');
    if (head) {
      const bar = document.createElement('div');
      bar.id = 'commentSortBar';
      bar.className = 'forum-comment-sort';
      bar.hidden = true;
      bar.innerHTML = `
        <span class="forum-comment-sort-label">sort by</span>
        <button class="chip ${sort==='top'?'is-active':''}" data-csort="top">⭐ Top</button>
        <button class="chip ${sort==='new'?'is-active':''}" data-csort="new">🆕 New</button>
        <button class="chip ${sort==='old'?'is-active':''}" data-csort="old">⏱ Old</button>`;
      head.insertAdjacentElement('afterend', bar);
    }
    wireSortBar();
    load();
    // Auto-refresh every 12s when visible & no reply form open
    setInterval(() => {
      if (document.visibilityState === 'visible' && !document.querySelector('.forum-reply-form:not([hidden])')) {
        load();
      }
    }, 12000);
  });
})();
