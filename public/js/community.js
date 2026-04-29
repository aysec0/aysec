/* /community — Reddit-style forum (post list + sidebar). */
(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // Honor ?cat=<slug> in the URL so deep links (and the /blog redirect)
  // land directly in the right category. Sort persists across cat changes.
  const _qs = new URLSearchParams(location.search);
  let state = {
    sort: _qs.get('sort') || 'hot',
    cat:  _qs.get('cat')  || null,
    categories: [],
  };

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.sort !== 'hot') p.set('sort', state.sort);
    if (state.cat)            p.set('cat', state.cat);
    const qs = p.toString();
    history.replaceState(null, '', '/community' + (qs ? '?' + qs : ''));
  }

  function renderCats() {
    const list = $('forumCats');
    list.innerHTML = `
      <li><button class="forum-cat ${state.cat == null ? 'is-active' : ''}" data-cat="">All</button></li>
      ${state.categories.map((c) => `
        <li><button class="forum-cat ${state.cat === c.slug ? 'is-active' : ''}" data-cat="${c.slug}" style="--cat: ${c.color || 'var(--accent)'};">
          ${escapeHtml(c.name)} <span class="dim mono" style="font-size:0.74rem;">${c.post_count}</span>
        </button></li>`).join('')}`;
    list.querySelectorAll('.forum-cat').forEach((b) => {
      b.addEventListener('click', () => {
        state.cat = b.dataset.cat || null;
        syncUrl();
        renderCats(); loadPosts();
      });
    });
  }

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

  function postCard(p) {
    const my = p.my_vote;
    const hostFromUrl = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
    return `
      <article class="forum-post" data-id="${p.id}">
        <div class="forum-vote">
          <button class="forum-arrow ${my === 1 ? 'is-up' : ''}" data-v="1" aria-label="upvote">▲</button>
          <div class="forum-score">${p.score}</div>
          <button class="forum-arrow ${my === -1 ? 'is-down' : ''}" data-v="-1" aria-label="downvote">▼</button>
        </div>
        <div class="forum-body">
          <div class="forum-meta">
            <span class="forum-cat-pill" style="--cat: ${p.cat_color || 'var(--accent)'};">/${escapeHtml(p.cat_slug)}</span>
            <span class="dim">posted by <a href="/u/${escapeHtml(p.username)}">@${escapeHtml(p.username)}</a> ${escapeHtml(relTime(p.created_at))}</span>
            ${p.pinned ? '<span class="tag" style="background: var(--accent-soft); color: var(--accent);">pinned</span>' : ''}
            ${p.locked ? '<span class="tag">locked</span>' : ''}
          </div>
          <h3 class="forum-title"><a href="/community/post/${p.id}">${escapeHtml(p.title)}</a></h3>
          ${p.url ? `<a class="forum-url-pill" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(hostFromUrl(p.url))} ↗</a>` : ''}
          ${p.body_md ? `<div class="forum-excerpt">${escapeHtml((p.body_md || '').slice(0, 240))}${p.body_md.length > 240 ? '…' : ''}</div>` : ''}
          <div class="forum-actions">
            <a href="/community/post/${p.id}" class="dim">💬 ${p.comment_count} comments</a>
          </div>
        </div>
      </article>`;
  }

  async function loadPosts() {
    const params = new URLSearchParams({ sort: state.sort });
    if (state.cat) params.set('cat', state.cat);
    try {
      const r = await window.api.get('/api/forum/posts?' + params);
      $('forumPosts').innerHTML = r.posts.length
        ? r.posts.map(postCard).join('')
        : '<div class="card" style="padding:1.5rem;"><p class="dim">Nothing here yet — be the first to post.</p></div>';
      $('forumPosts').querySelectorAll('.forum-post').forEach(wireVotes);
    } catch (e) {
      $('forumPosts').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">${escapeHtml(e.message)}</p></div>`;
    }
  }

  function wireVotes(article) {
    const id = Number(article.dataset.id);
    article.querySelectorAll('.forum-arrow').forEach((b) => {
      b.addEventListener('click', async () => {
        const requested = Number(b.dataset.v);
        const already = b.classList.contains(requested === 1 ? 'is-up' : 'is-down');
        try {
          const r = await window.api.post(`/api/forum/posts/${id}/vote`, { vote: already ? 0 : requested });
          article.querySelector('.forum-score').textContent = r.score;
          const upBtn = article.querySelector('.forum-arrow[data-v="1"]');
          const dnBtn = article.querySelector('.forum-arrow[data-v="-1"]');
          upBtn.classList.toggle('is-up', r.my_vote === 1);
          dnBtn.classList.toggle('is-down', r.my_vote === -1);
        } catch (err) {
          if (err.status === 401) location.href = '/login?next=' + encodeURIComponent(location.pathname);
          else alert(err.message);
        }
      });
    });
  }

  async function init() {
    try {
      const cr = await window.api.get('/api/forum/categories');
      state.categories = cr.categories;
      renderCats();
      loadPosts();
    } catch (e) {
      $('forumPosts').innerHTML = `<div class="card" style="padding:1.5rem;"><p class="dim">Couldn’t load: ${escapeHtml(e.message)}</p></div>`;
    }
    // Reflect URL-driven sort in the chip row
    document.querySelectorAll('#forumSort .chip').forEach((c) => {
      c.classList.toggle('is-active', c.dataset.sort === state.sort);
    });
    document.querySelectorAll('#forumSort .chip').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#forumSort .chip').forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        state.sort = b.dataset.sort;
        syncUrl();
        loadPosts();
      });
    });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
