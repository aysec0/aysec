/* /community/post/:id — single post + threaded comments. */
(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const md = (s) => window.marked ? window.marked.parse(s || '', { gfm: true, breaks: true }) : escapeHtml(s);
  const postId = Number(location.pathname.replace(/\/+$/, '').split('/').pop());
  let me = null;

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
            ${p.pinned ? '<span class="tag" style="background: var(--accent-soft); color: var(--accent);">📌 pinned</span>' : ''}
            ${p.locked ? '<span class="tag">🔒 locked</span>' : ''}
            ${canDelete ? `<button class="forum-del" data-pdel="${p.id}">delete</button>` : ''}
          </div>
          <h1 class="forum-title-detail">${escapeHtml(p.title)}</h1>
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

  function commentNode(c, allById, depth = 0) {
    const childIds = [...allById.values()].filter((x) => x.parent_id === c.id).map((x) => x.id);
    return `
      <div class="forum-comment" data-id="${c.id}" style="margin-left:${depth * 16}px;">
        <div class="forum-vote">
          <button class="forum-arrow ${c.my_vote === 1 ? 'is-up' : ''}" data-v="1">▲</button>
          <div class="forum-score">${c.score}</div>
          <button class="forum-arrow ${c.my_vote === -1 ? 'is-down' : ''}" data-v="-1">▼</button>
        </div>
        <div class="forum-comment-body">
          <div class="forum-meta">
            <a class="forum-user" href="/u/${escapeHtml(c.username)}">@${escapeHtml(c.username)}</a>
            <span class="dim">${relTime(c.created_at)}</span>
            ${(me && (me.id === c.user_id || me.role === 'admin')) ? `<button class="forum-del" data-cdel="${c.id}">delete</button>` : ''}
          </div>
          <div class="forum-md prose">${md(c.body_md)}</div>
          <div class="forum-actions">
            <button class="forum-reply-btn" data-reply="${c.id}">↩ reply</button>
          </div>
          <form class="forum-reply-form" data-rform="${c.id}" hidden style="margin-top:0.4rem;">
            <textarea class="textarea" rows="2" required></textarea>
            <div style="display:flex; gap:0.4rem; margin-top:0.3rem;">
              <button class="btn btn-primary btn-sm" type="submit">Post reply</button>
              <button class="btn btn-ghost btn-sm" type="button" data-rcancel="${c.id}">cancel</button>
            </div>
          </form>
        </div>
        ${childIds.map((cid) => commentNode(allById.get(cid), allById, depth + 1)).join('')}
      </div>`;
  }

  function renderComments(comments) {
    if (!comments.length) {
      $('commentsList').innerHTML = '<p class="dim">No comments yet — say something useful.</p>';
      return;
    }
    const byId = new Map(comments.map((c) => [c.id, c]));
    const tops = comments.filter((c) => !c.parent_id);
    $('commentsList').innerHTML = tops.map((c) => commentNode(c, byId)).join('');
    // Wire votes
    $('commentsList').querySelectorAll('.forum-comment').forEach((cn) => {
      const id = Number(cn.dataset.id);
      wireVote(cn, `/api/forum/comments/${id}/vote`);
    });
    // Wire reply toggles
    $('commentsList').querySelectorAll('[data-reply]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.reply;
        const f = $('commentsList').querySelector(`[data-rform="${id}"]`);
        f.hidden = !f.hidden;
        if (!f.hidden) f.querySelector('textarea').focus();
      });
    });
    $('commentsList').querySelectorAll('[data-rcancel]').forEach((b) => {
      b.addEventListener('click', () => {
        $('commentsList').querySelector(`[data-rform="${b.dataset.rcancel}"]`).hidden = true;
      });
    });
    $('commentsList').querySelectorAll('.forum-reply-form').forEach((f) => {
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
    $('commentsList').querySelectorAll('[data-cdel]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete comment?')) return;
        try { await window.api.del(`/api/forum/comments/${b.dataset.cdel}`); await load(); }
        catch (err) { alert(err.message); }
      })
    );
  }

  function wireVote(el, url) {
    el.querySelectorAll(':scope > .forum-vote .forum-arrow, :scope > .forum-comment-body .forum-vote .forum-arrow, :scope > .forum-vote .forum-arrow').forEach(() => {});
    // simpler: only top-level vote buttons of this element (not descendants)
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

  async function load() {
    try {
      me = (await window.api.get('/api/auth/me').catch(() => null))?.user || null;
      const r = await window.api.get(`/api/forum/posts/${postId}`);
      renderPost(r.post);
      $('commentsHead').textContent = `Comments (${r.comments.length})`;
      renderComments(r.comments);
    } catch (e) {
      $('postBody').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">${escapeHtml(e.message)}</p></div>`;
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    load();
    // Auto-refresh comments every 12s, but only when the tab is visible
    setInterval(() => {
      if (document.visibilityState === 'visible' && !document.querySelector('.forum-reply-form:not([hidden])')) {
        load();
      }
    }, 12000);
  });
})();
