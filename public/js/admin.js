/* /admin — admin-only CRUD for the major content tables.
   Single-page tabbed UI. Every section fetches its own data, renders a
   table, and surfaces inline create/edit/delete forms. */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmtDate = (s) => s ? new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z')).toLocaleString() : '—';
  const main = () => $('#adminMain');
  const api = window.api;

  // ----------------------- Boot -----------------------
  document.addEventListener('DOMContentLoaded', async () => {
    // Gate the page on /api/auth/me — if not admin, kick out.
    const me = await api.get('/api/auth/me').catch(() => null);
    if (!me?.user || me.user.role !== 'admin') {
      main().innerHTML = `
        <div class="card" style="padding:1.5rem;">
          <h2 style="margin:0 0 0.5rem;">Forbidden</h2>
          <p>You need an admin account to access /admin.</p>
          <a class="btn btn-primary" href="/login?next=${encodeURIComponent('/admin')}">Sign in</a>
        </div>`;
      document.querySelectorAll('.admin-tab').forEach((b) => b.disabled = true);
      return;
    }
    document.querySelectorAll('.admin-tab').forEach((btn) => {
      btn.addEventListener('click', () => loadTab(btn.dataset.tab, btn));
    });
    loadTab('overview', document.querySelector('.admin-tab.is-active'));
  });

  function loadTab(tab, btn) {
    document.querySelectorAll('.admin-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
    main().innerHTML = `
      <div class="card" style="padding:1.5rem;">
        <div class="admin-skel">
          <div class="admin-skel-row" style="width: 40%;"></div>
          <div class="admin-skel-row" style="width: 90%;"></div>
          <div class="admin-skel-row" style="width: 75%;"></div>
          <div class="admin-skel-row" style="width: 60%;"></div>
        </div>
      </div>`;
    if (tab === 'overview')     return overview();
    if (tab === 'site')         return siteSettings();
    if (tab === 'users')        return users();
    if (tab === 'challenges')   return challenges();
    if (tab === 'daily')        return daily();
    if (tab === 'ctf-events')   return ctfEvents();
    if (tab === 'assessments')  return assessments();
    if (tab === 'pro-labs')     return proLabs();
    if (tab === 'courses')      return courses();
    if (tab === 'tracks')       return tracks();
    if (tab === 'cert-prep')    return certPrep();
    if (tab === 'cheatsheets')  return cheatsheets();
    if (tab === 'posts')        return posts();
    if (tab === 'calendar')     return calendar();
    if (tab === 'talks')        return talks();
    if (tab === 'testimonials') return testimonials();
    if (tab === 'faqs')         return faqs();
    if (tab === 'forum')        return forumModeration();
  }

  async function forumModeration() {
    try {
      const r = await api.get('/api/forum/categories');
      main().innerHTML = `
        <h2 style="margin-top:0;">Forum</h2>
        <p class="dim">Categories live in <code>db/init.js</code> seeds. Posts &amp; comments are moderated by deleting from the public page (admin badge can delete anything).</p>
        <div class="admin-table" style="margin-top:1rem;">
          <div class="admin-row admin-head"><div>slug</div><div>name</div><div>posts</div></div>
          ${r.categories.map((c) => `
            <div class="admin-row">
              <div class="mono">/${c.slug}</div>
              <div>${escapeHtml(c.name)}</div>
              <div>${c.post_count}</div>
            </div>`).join('')}
        </div>
        <a class="btn btn-ghost" href="/community" target="_blank" style="margin-top:1rem;">Open community forum →</a>`;
    } catch (e) { main().innerHTML = err(e); }
  }

  // Markdown live-preview: turn a textarea[data-md] into editor + preview
  function wireMarkdownPreview(scope = document) {
    scope.querySelectorAll('textarea[data-md]:not([data-md-wired])').forEach((ta) => {
      ta.dataset.mdWired = '1';
      const wrap = document.createElement('div');
      wrap.className = 'admin-md-wrap';
      ta.parentNode.insertBefore(wrap, ta);
      wrap.appendChild(ta);
      const preview = document.createElement('div');
      preview.className = 'admin-md-preview prose';
      wrap.appendChild(preview);
      const render = () => {
        preview.innerHTML = window.marked
          ? window.marked.parse(ta.value || '*nothing yet*', { gfm: true, breaks: true })
          : escapeHtml(ta.value);
      };
      ta.addEventListener('input', render);
      render();
    });
  }

  function err(e) {
    return `<div class="alert error" style="margin-top:0.7rem;">${escapeHtml(e.message || 'Request failed')}</div>`;
  }

  function table(headers, rows, opts = {}) {
    const showSearch = opts.search !== false && rows.length >= 5;
    const search = showSearch ? `
      <div class="admin-table-search">
        <svg class="admin-table-search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="input" data-table-filter placeholder="${escapeHtml(opts.placeholder || `Filter ${rows.length} rows…`)}" />
        <span class="admin-table-count" data-table-count>${rows.length} rows</span>
      </div>` : '';
    const bulk = opts.bulk;
    const bulkBar = bulk ? `
      <div class="admin-bulk-bar" data-bulk-bar data-bulk-table="${escapeHtml(bulk.table)}" hidden>
        <span data-bulk-count>0 selected</span>
        <button class="btn btn-sm" data-bulk-clear>Clear</button>
        <button class="btn btn-sm btn-danger" data-bulk-delete>🗑 Delete selected</button>
      </div>` : '';
    let renderedRows = rows;
    if (bulk && Array.isArray(bulk.ids) && bulk.ids.length === rows.length) {
      renderedRows = rows.map((r, i) => {
        const id = bulk.ids[i];
        // Inject the checkbox right after the opening <div class="admin-row...">
        const checkbox = `<input type="checkbox" class="admin-bulk-checkbox" data-bulk-id="${id}" aria-label="Select row" />`;
        return r.replace(/(<div class="admin-row[^>]*>)/, `$1${checkbox}`);
      });
    }
    return `
      ${search}
      ${bulkBar}
      <div class="admin-table${bulk ? ' has-bulk' : ''}" data-table>
        <div class="admin-row admin-head">${headers.map((h) => `<div>${h}</div>`).join('')}</div>
        ${renderedRows.length ? renderedRows.join('') : '<div class="admin-empty-state"><strong>No rows yet</strong>Use the button above to create the first one.</div>'}
      </div>`;
  }

  // Live filter for any [data-table] right after a [data-table-filter] input.
  document.addEventListener('input', (e) => {
    const input = e.target.closest('[data-table-filter]');
    if (!input) return;
    const wrap = input.closest('.admin-table-search');
    // Skip past optional bulk bar to find the next .admin-table sibling
    let cursor = wrap?.nextElementSibling;
    while (cursor && !cursor.matches('[data-table]')) cursor = cursor.nextElementSibling;
    const tbl = cursor;
    if (!tbl) return;
    const q = input.value.trim().toLowerCase();
    let shown = 0, total = 0;
    tbl.querySelectorAll('.admin-row:not(.admin-head)').forEach((row) => {
      total++;
      const hit = !q || row.textContent.toLowerCase().includes(q);
      row.hidden = !hit;
      if (hit) shown++;
    });
    const counter = wrap.querySelector('[data-table-count]');
    if (counter) counter.textContent = q ? `${shown} of ${total}` : `${total} rows`;
  });

  // Bulk-select handlers: track checked rows, show/hide the floating bar,
  // wire Clear + Delete buttons.
  document.addEventListener('change', (e) => {
    if (!e.target.matches('.admin-bulk-checkbox')) return;
    refreshBulkBar(e.target);
  });

  document.addEventListener('click', async (e) => {
    const clearBtn = e.target.closest('[data-bulk-clear]');
    if (clearBtn) {
      const bar = clearBtn.closest('[data-bulk-bar]');
      const tbl = bar?.nextElementSibling;
      tbl?.querySelectorAll('.admin-bulk-checkbox:checked').forEach((cb) => { cb.checked = false; });
      refreshBulkBar(tbl?.querySelector('.admin-bulk-checkbox'));
      return;
    }
    const delBtn = e.target.closest('[data-bulk-delete]');
    if (delBtn) {
      const bar = delBtn.closest('[data-bulk-bar]');
      const tbl = bar?.nextElementSibling;
      const tableName = bar.dataset.bulkTable;
      const ids = [...(tbl?.querySelectorAll('.admin-bulk-checkbox:checked') || [])].map((cb) => Number(cb.dataset.bulkId)).filter(Boolean);
      if (!ids.length) return;
      if (!confirm(`Delete ${ids.length} ${tableName}? This can't be undone.`)) return;
      delBtn.disabled = true;
      try {
        const r = await api.post('/api/admin/bulk-delete', { table: tableName, ids });
        window.toast?.(`Deleted ${r.deleted}`, 'success');
        // Refresh the active tab
        document.querySelector('.admin-tab.is-active')?.click();
      } catch (err) {
        window.toast?.(err.message || 'bulk delete failed', 'error');
      } finally {
        delBtn.disabled = false;
      }
    }
  });

  function refreshBulkBar(anyCheckbox) {
    const tbl = anyCheckbox?.closest('[data-table]');
    if (!tbl) return;
    const bar = tbl.previousElementSibling?.matches('[data-bulk-bar]') ? tbl.previousElementSibling : null;
    if (!bar) return;
    const checked = tbl.querySelectorAll('.admin-bulk-checkbox:checked').length;
    bar.hidden = checked === 0;
    const counter = bar.querySelector('[data-bulk-count]');
    if (counter) counter.textContent = `${checked} selected`;
    const delBtn = bar.querySelector('[data-bulk-delete]');
    if (delBtn) delBtn.textContent = `🗑 Delete ${checked}`;
  }

  // ----------------------- Overview -----------------------
  // Stat groups — every admin-tracked table in /api/admin/overview.counts
  // belongs to a domain so the overview reads like a dashboard.
  const STAT_GROUPS = [
    { title: 'Site',    icon: '◎', keys: ['users', 'newsletter_subscribers', 'notifications', 'certificates'] },
    { title: 'Learn',   icon: '📚', keys: ['courses', 'lessons', 'tracks', 'cert_prep', 'cheatsheets'] },
    { title: 'Compete', icon: '⚔', keys: ['challenges', 'solves', 'submissions', 'daily_challenges', 'daily_solves', 'ctf_events', 'ctf_event_solves', 'assessments', 'assessment_attempts', 'pro_labs', 'pro_lab_solves', 'teams', 'vault_solves'] },
    { title: 'Content', icon: '✎', keys: ['posts', 'events', 'forum_posts', 'forum_comments'] },
  ];
  const STAT_LABEL = {
    users: 'Users', courses: 'Courses', lessons: 'Lessons', challenges: 'Challenges',
    solves: 'Solves', submissions: 'Submissions', posts: 'Blog posts', cheatsheets: 'Cheatsheets',
    events: 'Cal. events', tracks: 'Paths', cert_prep: 'Cert prep', certificates: 'Certificates',
    daily_challenges: 'Daily', daily_solves: 'Daily solves',
    ctf_events: 'CTF events', ctf_event_solves: 'Event solves',
    assessments: 'Assessments', assessment_attempts: 'Attempts',
    pro_labs: 'Pro Labs', pro_lab_solves: 'Pro Lab solves',
    teams: 'Teams', newsletter_subscribers: 'Newsletter',
    forum_posts: 'Forum posts', forum_comments: 'Forum comments',
    vault_solves: 'Vault solves', notifications: 'Notifications',
  };
  const STAT_TAB = {
    users: 'users', courses: 'courses', lessons: 'courses', challenges: 'challenges',
    solves: 'challenges', submissions: 'challenges', posts: 'posts', cheatsheets: 'cheatsheets',
    events: 'calendar', tracks: 'tracks', cert_prep: 'cert-prep', certificates: 'users',
    daily_challenges: 'daily', daily_solves: 'daily',
    ctf_events: 'ctf-events', ctf_event_solves: 'ctf-events',
    assessments: 'assessments', assessment_attempts: 'assessments',
    pro_labs: 'pro-labs', pro_lab_solves: 'pro-labs',
    teams: 'forum',
    forum_posts: 'forum', forum_comments: 'forum',
  };

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

  function statCard(k, v, opts = {}) {
    const tab = STAT_TAB[k];
    const label = STAT_LABEL[k] || k;
    const tag = tab ? 'button' : 'div';
    const tabAttr = tab ? `data-go-tab="${tab}"` : '';
    return `<${tag} class="admin-stat-card${tab ? ' is-clickable' : ''}" ${tabAttr}>
      <div class="admin-stat-label">${escapeHtml(label)}</div>
      <div class="admin-stat-value">${v ?? '—'}</div>
      ${opts.spark ? sparklineSvg(opts.spark) : ''}
      ${opts.delta != null ? `<div class="admin-stat-delta ${opts.delta > 0 ? 'is-up' : ''}">${opts.delta > 0 ? '+' : ''}${opts.delta} 7d</div>` : ''}
    </${tag}>`;
  }

  // Render a tiny inline SVG sparkline from a number[] series.
  // Stretches to 100% width; height is fixed at 28px.
  function sparklineSvg(values) {
    if (!Array.isArray(values) || values.length < 2) return '';
    const w = 100, h = 28, pad = 2;
    const max = Math.max(1, ...values);
    const stepX = (w - pad * 2) / (values.length - 1);
    const points = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - (v / max) * (h - pad * 2);
      return [x, y];
    });
    const line = points.map((p, i) => (i === 0 ? `M${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`)).join(' ');
    const fill = `${line} L${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L${pad} ${(h - pad).toFixed(1)} Z`;
    const last = points[points.length - 1];
    return `
      <svg class="admin-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <path d="${fill}" fill="currentColor" fill-opacity="0.13"/>
        <path d="${line}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="1.6" fill="currentColor"/>
      </svg>`;
  }

  async function overview() {
    try {
      const [r, t] = await Promise.all([
        api.get('/api/admin/overview'),
        api.get('/api/admin/timeline?days=7').catch(() => ({ series: {} })),
      ]);
      const counts = r.counts || {};
      const d = r.deltas_7d || {};
      const series = t.series || {};

      const hero = `
        <div class="admin-overview-hero">
          ${statCard('users',       counts.users,       { delta: d.signups,     spark: series.signups })}
          ${statCard('solves',      counts.solves,      { delta: d.solves,      spark: series.solves })}
          ${statCard('forum_posts', counts.forum_posts, { delta: d.forum_posts, spark: series.forum_posts })}
        </div>`;

      const quickActions = `
        <div class="admin-quick-actions">
          <span class="admin-quick-eyebrow">Quick actions</span>
          <button class="btn btn-primary btn-sm" data-go-tab="challenges" data-go-action="new">+ Challenge</button>
          <button class="btn btn-ghost btn-sm" data-go-tab="posts" data-go-action="new">+ Post</button>
          <button class="btn btn-ghost btn-sm" data-go-tab="courses" data-go-action="new">+ Course</button>
          <button class="btn btn-ghost btn-sm" data-go-tab="daily">+ Daily</button>
          <a class="btn btn-ghost btn-sm" href="/site-editor">✎ Visual editor</a>
        </div>`;

      const groups = STAT_GROUPS.map((g) => `
        <section class="admin-stat-group">
          <div class="admin-stat-group-head">
            <span class="admin-stat-group-icon">${g.icon}</span>
            <h3 class="admin-stat-group-title">${g.title}</h3>
          </div>
          <div class="admin-stat-grid">
            ${g.keys.map((k) => statCard(k, counts[k])).join('')}
          </div>
        </section>`).join('');

      const userItems = (r.recent_users || []).map((u) => `
        <li class="admin-feed-item">
          <a class="admin-feed-link" href="/u/${escapeHtml(u.username)}" target="_blank">@${escapeHtml(u.username)}</a>
          ${u.role === 'admin' ? '<span class="admin-feed-tag">admin</span>' : ''}
          <span class="admin-feed-time">${relTime(u.created_at)}</span>
        </li>`).join('') || '<li class="admin-feed-empty">No signups yet.</li>';

      const postItems = (r.recent_posts || []).map((p) => `
        <li class="admin-feed-item">
          <a class="admin-feed-link" href="/community/post/${p.id}" target="_blank">${escapeHtml(p.title)}</a>
          <span class="admin-feed-tag" style="--cat:${p.cat_color || 'var(--accent)'};">/${escapeHtml(p.cat_slug)}</span>
          <span class="admin-feed-time">@${escapeHtml(p.username)} · ${relTime(p.created_at)}</span>
        </li>`).join('') || '<li class="admin-feed-empty">No posts yet.</li>';

      const solveItems = (r.recent_solves || []).map((s) => `
        <li class="admin-feed-item">
          <a class="admin-feed-link" href="/challenges/${escapeHtml(s.challenge_slug)}" target="_blank">${escapeHtml(s.challenge_title)}</a>
          <span class="admin-feed-tag">+${s.points}</span>
          <span class="admin-feed-time">@${escapeHtml(s.username)} · ${relTime(s.solved_at)}</span>
        </li>`).join('') || '<li class="admin-feed-empty">No solves yet.</li>';

      main().innerHTML = `
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:1rem; margin-bottom:1rem;">
          <h2 style="margin:0;">Overview</h2>
          <span class="dim mono" style="font-size:0.78rem;">last 7 days</span>
        </div>
        ${hero}
        ${quickActions}
        <div class="admin-stat-groups">${groups}</div>
        <div class="admin-activity-feeds">
          <section class="admin-activity-col">
            <h3 class="admin-activity-head">Recent users</h3>
            <ul class="admin-feed">${userItems}</ul>
          </section>
          <section class="admin-activity-col">
            <h3 class="admin-activity-head">Recent forum posts</h3>
            <ul class="admin-feed">${postItems}</ul>
          </section>
          <section class="admin-activity-col">
            <h3 class="admin-activity-head">Recent solves</h3>
            <ul class="admin-feed">${solveItems}</ul>
          </section>
        </div>`;
    } catch (e) { main().innerHTML = err(e); }
  }

  // Click a [data-go-tab="..."] anywhere to switch tabs (used in overview).
  // If the source also has [data-go-action="new"], poll briefly for the
  // tab's "+ New X" button (id starts with "new", ends with "Btn") and
  // click it once it appears, so the form opens in one motion.
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-go-tab]');
    if (!target) return;
    const tabName = target.dataset.goTab;
    const action = target.dataset.goAction;
    const btn = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
    if (!btn) return;
    btn.click();
    if (action === 'new') {
      let tries = 0;
      const tryClick = () => {
        const newBtn = document.querySelector('#adminMain button[id^="new"][id$="Btn"]');
        if (newBtn) {
          newBtn.click();
          newBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
        if (++tries < 20) setTimeout(tryClick, 100);
      };
      setTimeout(tryClick, 100);
    }
  });

  // ----------------------- Users -----------------------
  async function users() {
    try {
      const r = await api.get('/api/admin/users');
      const rows = r.users.map((u) => `
        <div class="admin-row">
          <div><a href="/u/${escapeHtml(u.username)}">@${escapeHtml(u.username)}</a></div>
          <div class="dim">${escapeHtml(u.email)}</div>
          <div>${escapeHtml(u.display_name || '')}</div>
          <div>${u.solves}</div>
          <div>
            <select class="input" data-uid="${u.id}" style="padding:0.3rem 0.5rem; font-size:0.8rem;">
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
            </select>
          </div>
          <div class="dim mono" style="font-size:0.78rem;">${fmtDate(u.created_at)}</div>
        </div>`);
      main().innerHTML = `
        <h2 style="margin-top:0;">Users (${r.users.length})</h2>
        ${table(['user', 'email', 'name', 'solves', 'role', 'joined'], rows)}`;
      main().querySelectorAll('select[data-uid]').forEach((s) => {
        s.addEventListener('change', async () => {
          if (!confirm(`Set @${s.closest('.admin-row').querySelector('a').textContent.slice(1)} to ${s.value}?`)) return;
          try { await api.req('PATCH', `/api/admin/users/${s.dataset.uid}`, { role: s.value }); }
          catch (e) { window.toast(e.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  // ----------------------- Challenges -----------------------
  let chCache = [];
  async function challenges() {
    try {
      const r = await api.get('/api/admin/challenges');
      chCache = r.challenges;
      const rows = r.challenges.map((c) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(c.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(c.slug)}</span></div>
          <div>${c.category} · ${c.difficulty}</div>
          <div>${c.points}</div>
          <div>${c.solves}</div>
          <div>${c.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${c.id}">edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${c.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Challenges (${r.challenges.length})</h2>
          <button class="btn btn-primary" id="newChalBtn">+ New challenge</button>
        </div>
        ${table(['title / slug','cat·diff','pts','solves','pub','actions'], rows, { bulk: { table: 'challenges', ids: r.challenges.map((c) => c.id) } })}
        <div id="chalForm"></div>`;
      $('#newChalBtn').addEventListener('click', () => renderChalForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) => {
        b.addEventListener('click', () => {
          const c = chCache.find((x) => x.id === Number(b.dataset.edit));
          if (c) renderChalForm(c);
        });
      });
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete challenge?')) return;
          try { await api.req('DELETE', `/api/admin/challenges/${b.dataset.del}`); challenges(); }
          catch (e) { window.toast(e.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderChalForm(c) {
    $('#chalForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${c.id ? 'Edit' : 'New'} challenge</h3>
        <form id="chForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(c.slug || '')}" required /></label>
          <label>title     <input class="input" name="title" value="${escapeHtml(c.title || '')}" required /></label>
          <label>category  <select class="input" name="category">${['web','crypto','pwn','rev','forensics','ai','misc'].map((x) => `<option ${x===c.category?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>difficulty<select class="input" name="difficulty">${['easy','medium','hard','insane'].map((x) => `<option ${x===c.difficulty?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>points    <input class="input mono" type="number" name="points" value="${c.points || 100}" /></label>
          <label>author    <input class="input" name="author" value="${escapeHtml(c.author || '')}" /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3">${escapeHtml(c.description || '')}</textarea></label>
          <label class="full">flag (leave blank to keep current) <input class="input mono" name="flag" placeholder="aysec{...}" ${c.id ? '' : 'required'} /></label>
          <label>published <input type="checkbox" name="published" ${c.published ? 'checked' : ''} /></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${c.id ? 'Save changes' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="chCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#chCancel').addEventListener('click', () => { $('#chalForm').innerHTML = ''; });
    $('#chForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'),
        category: fd.get('category'), difficulty: fd.get('difficulty'),
        points: Number(fd.get('points')) || 100,
        author: fd.get('author') || null,
        description: fd.get('description') || null,
        flag: fd.get('flag') || undefined,
        published: fd.get('published') === 'on',
      };
      try {
        if (c.id) await api.req('PATCH', `/api/admin/challenges/${c.id}`, body);
        else      await api.post('/api/admin/challenges', body);
        challenges();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
  }

  // ----------------------- Daily -----------------------
  async function daily() {
    try {
      const [dr, cr] = await Promise.all([api.get('/api/admin/daily'), api.get('/api/admin/challenges')]);
      const rows = dr.daily.map((d) => `
        <div class="admin-row">
          <div class="mono">${d.date}</div>
          <div>${escapeHtml(d.title)} <span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(d.slug)}</span></div>
          <div>+${d.bonus_points}</div>
          <div>${d.solves} solves</div>
          <div><button class="btn btn-ghost btn-sm" data-del="${d.date}">remove</button></div>
        </div>`);
      const today = new Date().toISOString().slice(0, 10);
      main().innerHTML = `
        <h2 style="margin-top:0;">Daily challenge</h2>
        <div class="card" style="padding:1.25rem; margin-bottom:1rem;">
          <h3 style="margin-top:0;">Assign</h3>
          <form id="dailyForm" class="admin-form">
            <label>date <input class="input mono" type="date" name="date" value="${today}" required /></label>
            <label>challenge
              <select class="input" name="challenge_id" required>
                <option value="">— pick a challenge —</option>
                ${cr.challenges.map((c) => `<option value="${c.id}">${escapeHtml(c.title)} (${c.category}·${c.difficulty})</option>`).join('')}
              </select>
            </label>
            <label>bonus pts <input class="input mono" type="number" name="bonus_points" value="50" /></label>
            <div class="full"><button class="btn btn-primary" type="submit">Save assignment</button></div>
          </form>
        </div>
        ${table(['date','challenge','bonus','solves','actions'], rows)}`;
      $('#dailyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.req('PUT', `/api/admin/daily/${fd.get('date')}`, {
            challenge_id: Number(fd.get('challenge_id')),
            bonus_points: Number(fd.get('bonus_points')) || 50,
          });
          daily();
        } catch (err2) { window.toast(err2.message, 'error'); }
      });
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm(`Remove daily for ${b.dataset.del}?`)) return;
          try { await api.req('DELETE', `/api/admin/daily/${b.dataset.del}`); daily(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  // ----------------------- CTF Events -----------------------
  async function ctfEvents() {
    try {
      const r = await api.get('/api/admin/ctf-events');
      const rows = r.events.map((ev) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(ev.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(ev.slug)}</span></div>
          <div class="dim mono" style="font-size:0.78rem;">${fmtDate(ev.starts_at)} → ${fmtDate(ev.ends_at)}</div>
          <div>${ev.chal_count} chals · ${ev.participants} in</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-chals="${ev.id}">manage chals</button>
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(ev).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${ev.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">CTF events (${r.events.length})</h2>
          <button class="btn btn-primary" id="newEvBtn">+ New event</button>
        </div>
        ${table(['title / slug','window','stats','actions'], rows)}
        <div id="evForm"></div>`;
      $('#newEvBtn').addEventListener('click', () => renderEvForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderEvForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete event?')) return;
          try { await api.req('DELETE', `/api/admin/ctf-events/${b.dataset.del}`); ctfEvents(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
      main().querySelectorAll('[data-chals]').forEach((b) =>
        b.addEventListener('click', () => manageEventChallenges(Number(b.dataset.chals)))
      );
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderEvForm(ev) {
    const dtVal = (s) => {
      if (!s) return '';
      const d = new Date(s);
      const tzOff = d.getTimezoneOffset() * 60000;
      return new Date(d - tzOff).toISOString().slice(0, 16);
    };
    $('#evForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${ev.id ? 'Edit' : 'New'} CTF event</h3>
        <form id="eForm" class="admin-form">
          <label>slug   <input class="input mono" name="slug" value="${escapeHtml(ev.slug || '')}" required /></label>
          <label>title  <input class="input" name="title" value="${escapeHtml(ev.title || '')}" required /></label>
          <label>starts <input class="input mono" type="datetime-local" name="starts_at" value="${dtVal(ev.starts_at)}" required /></label>
          <label>ends   <input class="input mono" type="datetime-local" name="ends_at"   value="${dtVal(ev.ends_at)}"   required /></label>
          <label>prize  <input class="input" name="prize" value="${escapeHtml(ev.prize || '')}" /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3">${escapeHtml(ev.description || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${ev.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="evCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#evCancel').addEventListener('click', () => { $('#evForm').innerHTML = ''; });
    $('#eForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'),
        starts_at: new Date(fd.get('starts_at')).toISOString(),
        ends_at:   new Date(fd.get('ends_at')).toISOString(),
        prize: fd.get('prize') || null,
        description: fd.get('description') || null,
      };
      try {
        if (ev.id) await api.req('PATCH', `/api/admin/ctf-events/${ev.id}`, body);
        else       await api.post('/api/admin/ctf-events', body);
        ctfEvents();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
  }

  async function manageEventChallenges(eventId) {
    try {
      const [cur, all] = await Promise.all([
        api.get(`/api/admin/ctf-events/${eventId}/challenges`),
        api.get('/api/admin/challenges'),
      ]);
      const inSet = new Set(cur.challenges.map((c) => c.id));
      const rows = cur.challenges.map((c) => `
        <div class="admin-row">
          <div>${escapeHtml(c.title)} <span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(c.slug)}</span></div>
          <div>${c.event_points ?? '(default)'}</div>
          <div>${c.position}</div>
          <div><button class="btn btn-ghost btn-sm" data-rm="${c.id}">remove</button></div>
        </div>`);
      const opts = all.challenges.filter((c) => !inSet.has(c.id))
        .map((c) => `<option value="${c.id}">${escapeHtml(c.title)} (${c.category}·${c.difficulty})</option>`).join('');
      main().innerHTML = `
        <button class="btn btn-ghost" id="evBack">← back to events</button>
        <h2 style="margin-top:0.7rem;">Event #${eventId} — challenges (${cur.challenges.length})</h2>
        <div class="card" style="padding:1.25rem; margin-bottom:1rem;">
          <h3 style="margin-top:0;">Add challenge</h3>
          <form id="addCh" class="admin-form">
            <label>challenge <select class="input" name="challenge_id" required>${opts}</select></label>
            <label>points override <input class="input mono" type="number" name="points" placeholder="default" /></label>
            <label>position <input class="input mono" type="number" name="position" value="0" /></label>
            <div class="full"><button class="btn btn-primary" type="submit">Add</button></div>
          </form>
        </div>
        ${table(['challenge','event pts','position','actions'], rows)}`;
      $('#evBack').addEventListener('click', ctfEvents);
      $('#addCh').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.post(`/api/admin/ctf-events/${eventId}/challenges`, {
            challenge_id: Number(fd.get('challenge_id')),
            points: fd.get('points') ? Number(fd.get('points')) : null,
            position: Number(fd.get('position')) || 0,
          });
          manageEventChallenges(eventId);
        } catch (err2) { window.toast(err2.message, 'error'); }
      });
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Remove challenge from event?')) return;
          try { await api.req('DELETE', `/api/admin/ctf-events/${eventId}/challenges/${b.dataset.rm}`); manageEventChallenges(eventId); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  // ----------------------- Assessments -----------------------
  async function assessments() {
    try {
      const r = await api.get('/api/admin/assessments');
      const rows = r.assessments.map((a) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(a.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(a.slug)}</span></div>
          <div>${a.cert_code || ''} · ${a.difficulty || ''}</div>
          <div>${a.machine_count} machines</div>
          <div>${a.passing_points} pts · ${a.time_limit_minutes}m</div>
          <div>${a.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-machines='${a.id}'>machines</button>
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(a).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${a.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Assessments (${r.assessments.length})</h2>
          <button class="btn btn-primary" id="newABtn">+ New assessment</button>
        </div>
        ${table(['title / slug','cert · diff','machines','passing','pub','actions'], rows)}
        <div id="aForm"></div>`;
      $('#newABtn').addEventListener('click', () => renderAForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderAForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete assessment?')) return;
          try { await api.req('DELETE', `/api/admin/assessments/${b.dataset.del}`); assessments(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
      main().querySelectorAll('[data-machines]').forEach((b) =>
        b.addEventListener('click', () => manageAssessmentMachines(Number(b.dataset.machines)))
      );
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderAForm(a) {
    $('#aForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${a.id ? 'Edit' : 'New'} assessment</h3>
        <form id="aSubForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(a.slug || '')}" required /></label>
          <label>title     <input class="input" name="title" value="${escapeHtml(a.title || '')}" required /></label>
          <label>cert code <input class="input mono" name="cert_code" value="${escapeHtml(a.cert_code || '')}" placeholder="OSCP" /></label>
          <label>difficulty<select class="input" name="difficulty">${['easy','medium','hard','insane'].map((x) => `<option ${x===a.difficulty?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>time limit (min) <input class="input mono" type="number" name="time_limit_minutes" value="${a.time_limit_minutes || 1440}" /></label>
          <label>passing pts      <input class="input mono" type="number" name="passing_points" value="${a.passing_points || 70}" /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3">${escapeHtml(a.description || '')}</textarea></label>
          <label>published <input type="checkbox" name="published" ${a.published ? 'checked' : ''} /></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${a.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="aCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#aCancel').addEventListener('click', () => { $('#aForm').innerHTML = ''; });
    $('#aSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'),
        cert_code: fd.get('cert_code') || null,
        difficulty: fd.get('difficulty'),
        time_limit_minutes: Number(fd.get('time_limit_minutes')) || 1440,
        passing_points: Number(fd.get('passing_points')) || 70,
        description: fd.get('description') || null,
        published: fd.get('published') === 'on',
      };
      try {
        if (a.id) await api.req('PATCH', `/api/admin/assessments/${a.id}`, body);
        else      await api.post('/api/admin/assessments', body);
        assessments();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
  }

  async function manageAssessmentMachines(aid) {
    try {
      const r = await api.get(`/api/admin/assessments/${aid}/machines`);
      const rows = r.machines.map((m) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(m.name)}</strong> <span class="dim mono">${escapeHtml(m.ip || '')}</span></div>
          <div>${escapeHtml(m.role || '')}</div>
          <div>${m.points} pts</div>
          <div>${m.position}</div>
          <div><button class="btn btn-ghost btn-sm" data-rm="${m.id}">remove</button></div>
        </div>`);
      main().innerHTML = `
        <button class="btn btn-ghost" id="aBack">← back to assessments</button>
        <h2 style="margin-top:0.7rem;">Assessment #${aid} machines (${r.machines.length})</h2>
        <div class="card" style="padding:1.25rem; margin-bottom:1rem;">
          <h3 style="margin-top:0;">Add machine</h3>
          <form id="addMc" class="admin-form">
            <label>name     <input class="input mono" name="name" required /></label>
            <label>ip       <input class="input mono" name="ip" placeholder="10.10.10.5" /></label>
            <label>role     <input class="input" name="role" placeholder="web app" /></label>
            <label>points   <input class="input mono" type="number" name="points" value="20" /></label>
            <label>position <input class="input mono" type="number" name="position" value="0" /></label>
            <label class="full">flag (sha256'd server-side) <input class="input mono" name="flag" placeholder="aysec{...}" required /></label>
            <label class="full">hint <input class="input" name="hint" /></label>
            <div class="full"><button class="btn btn-primary" type="submit">Add</button></div>
          </form>
        </div>
        ${table(['name','role','pts','pos','actions'], rows)}`;
      $('#aBack').addEventListener('click', assessments);
      $('#addMc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.post(`/api/admin/assessments/${aid}/machines`, {
            name: fd.get('name'), ip: fd.get('ip'), role: fd.get('role'),
            points: Number(fd.get('points')) || 20, position: Number(fd.get('position')) || 0,
            flag: fd.get('flag'), hint: fd.get('hint') || null,
          });
          manageAssessmentMachines(aid);
        } catch (err2) { window.toast(err2.message, 'error'); }
      });
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Remove machine?')) return;
          try { await api.req('DELETE', `/api/admin/assessments/${aid}/machines/${b.dataset.rm}`); manageAssessmentMachines(aid); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  // ----------------------- Pro Labs -----------------------
  async function proLabs() {
    try {
      const r = await api.get('/api/admin/pro-labs');
      const rows = r.labs.map((l) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(l.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(l.slug)}</span></div>
          <div>${l.difficulty || ''}</div>
          <div>${l.machine_count} hosts</div>
          <div>${l.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-machines="${l.id}">machines</button>
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(l).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${l.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Pro Labs (${r.labs.length})</h2>
          <button class="btn btn-primary" id="newLBtn">+ New lab</button>
        </div>
        ${table(['title / slug','diff','hosts','pub','actions'], rows)}
        <div id="lForm"></div>`;
      $('#newLBtn').addEventListener('click', () => renderLForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderLForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete lab?')) return;
          try { await api.req('DELETE', `/api/admin/pro-labs/${b.dataset.del}`); proLabs(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
      main().querySelectorAll('[data-machines]').forEach((b) =>
        b.addEventListener('click', () => manageProLabMachines(Number(b.dataset.machines)))
      );
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderLForm(l) {
    $('#lForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${l.id ? 'Edit' : 'New'} pro lab</h3>
        <form id="lSubForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(l.slug || '')}" required /></label>
          <label>title     <input class="input" name="title" value="${escapeHtml(l.title || '')}" required /></label>
          <label>difficulty<select class="input" name="difficulty">${['easy','medium','hard','insane'].map((x) => `<option ${x===l.difficulty?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>published <input type="checkbox" name="published" ${l.published ? 'checked' : ''} /></label>
          <label class="full">scenario <textarea class="textarea" name="scenario" rows="2">${escapeHtml(l.scenario || '')}</textarea></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3">${escapeHtml(l.description || '')}</textarea></label>
          <label class="full">network diagram (ascii) <textarea class="textarea mono" name="network_diagram" rows="3">${escapeHtml(l.network_diagram || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${l.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="lCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#lCancel').addEventListener('click', () => { $('#lForm').innerHTML = ''; });
    $('#lSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'),
        difficulty: fd.get('difficulty'),
        scenario: fd.get('scenario') || null,
        description: fd.get('description') || null,
        network_diagram: fd.get('network_diagram') || null,
        published: fd.get('published') === 'on',
      };
      try {
        if (l.id) await api.req('PATCH', `/api/admin/pro-labs/${l.id}`, body);
        else      await api.post('/api/admin/pro-labs', body);
        proLabs();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
  }

  async function manageProLabMachines(lid) {
    try {
      const r = await api.get(`/api/admin/pro-labs/${lid}/machines`);
      const rows = r.machines.map((m) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(m.name)}</strong> <span class="dim mono">${escapeHtml(m.ip || '')}</span></div>
          <div>${escapeHtml(m.role || '')}</div>
          <div>user ${m.user_points} · root ${m.root_points}</div>
          <div>${m.position}</div>
          <div><button class="btn btn-ghost btn-sm" data-rm="${m.id}">remove</button></div>
        </div>`);
      main().innerHTML = `
        <button class="btn btn-ghost" id="lBack">← back to labs</button>
        <h2 style="margin-top:0.7rem;">Pro Lab #${lid} machines (${r.machines.length})</h2>
        <div class="card" style="padding:1.25rem; margin-bottom:1rem;">
          <h3 style="margin-top:0;">Add machine</h3>
          <form id="addPm" class="admin-form">
            <label>name <input class="input mono" name="name" required /></label>
            <label>ip   <input class="input mono" name="ip" placeholder="10.10.10.5" /></label>
            <label>role <input class="input" name="role" placeholder="web app" /></label>
            <label>position    <input class="input mono" type="number" name="position" value="0" /></label>
            <label>user pts    <input class="input mono" type="number" name="user_points" value="10" /></label>
            <label>root pts    <input class="input mono" type="number" name="root_points" value="20" /></label>
            <label class="full">user flag <input class="input mono" name="user_flag" placeholder="aysec{...}" /></label>
            <label class="full">root flag <input class="input mono" name="root_flag" placeholder="aysec{...}" /></label>
            <label class="full">hint <input class="input" name="hint" /></label>
            <div class="full"><button class="btn btn-primary" type="submit">Add</button></div>
          </form>
        </div>
        ${table(['name','role','points','pos','actions'], rows)}`;
      $('#lBack').addEventListener('click', proLabs);
      $('#addPm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.post(`/api/admin/pro-labs/${lid}/machines`, {
            name: fd.get('name'), ip: fd.get('ip'), role: fd.get('role'),
            position: Number(fd.get('position')) || 0,
            user_points: Number(fd.get('user_points')) || 10,
            root_points: Number(fd.get('root_points')) || 20,
            user_flag: fd.get('user_flag') || null,
            root_flag: fd.get('root_flag') || null,
            hint: fd.get('hint') || null,
          });
          manageProLabMachines(lid);
        } catch (err2) { window.toast(err2.message, 'error'); }
      });
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Remove machine?')) return;
          try { await api.req('DELETE', `/api/admin/pro-labs/${lid}/machines/${b.dataset.rm}`); manageProLabMachines(lid); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  // ----------------------- Courses (basic; lessons hand-edited) -----------------------
  async function courses() {
    try {
      const r = await api.get('/api/admin/courses');
      const rows = r.courses.map((c) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(c.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(c.slug)}</span></div>
          <div>${c.difficulty}</div>
          <div>${c.is_paid ? '$' + (c.price_cents / 100).toFixed(2) : 'free'}</div>
          <div>${c.lesson_count} lessons</div>
          <div>${c.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-lessons='${c.id}|${escapeHtml(c.title)}'>lessons</button>
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(c).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${c.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Courses (${r.courses.length})</h2>
          <button class="btn btn-primary" id="newCBtn">+ New course</button>
        </div>
        <p class="dim" style="font-size:0.85rem;">Course meta is editable here; lessons are hand-edited via the DB / seed for now.</p>
        ${table(['title / slug','diff','price','lessons','pub','actions'], rows)}
        <div id="cForm"></div>`;
      $('#newCBtn').addEventListener('click', () => renderCForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderCForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete course (and all lessons + access records)?')) return;
          try { await api.req('DELETE', `/api/admin/courses/${b.dataset.del}`); courses(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
      main().querySelectorAll('[data-lessons]').forEach((b) => {
        b.addEventListener('click', () => {
          const [id, title] = b.dataset.lessons.split('|');
          manageLessons(Number(id), title);
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderCForm(c) {
    const isEdit = !!c.id;
    const dollars = ((c.price_cents || 0) / 100).toFixed(2);
    $('#cForm').innerHTML = `
      <div class="card admin-form-card" style="margin-top:1rem;">
        <header class="admin-form-head">
          <div>
            <span class="admin-form-eyebrow">${isEdit ? 'Editing' : 'New'}</span>
            <h3 class="admin-form-title">${isEdit ? escapeHtml(c.title || 'course') : 'Add a course'}</h3>
          </div>
          <button class="admin-form-close" type="button" id="cCancel" aria-label="Close" title="Close">×</button>
        </header>

        <form id="cSubForm" class="admin-form admin-form-sectioned">
          <section class="admin-form-section">
            <div class="admin-form-section-head">
              <h4 class="admin-form-section-title">Identity</h4>
              <p class="admin-form-section-hint">How the course shows up in URLs, lists, and search.</p>
            </div>
            <div class="admin-form-grid">
              <label class="admin-field full">
                <span class="admin-field-label">Title <em>required</em></span>
                <input class="input" name="title" value="${escapeHtml(c.title || '')}" required placeholder="Web Hacking 101" />
              </label>
              <label class="admin-field">
                <span class="admin-field-label">Slug <em>required</em></span>
                <input class="input mono" name="slug" value="${escapeHtml(c.slug || '')}" required placeholder="web-hacking-101" pattern="[a-z0-9-]+" />
                <span class="admin-field-hint">Lowercase, hyphens only · used in /courses/&lt;slug&gt;</span>
              </label>
              <label class="admin-field">
                <span class="admin-field-label">Difficulty</span>
                <select class="input" name="difficulty">
                  ${['beginner','intermediate','advanced'].map((x) => `<option ${x===(c.difficulty||'beginner')?'selected':''}>${x}</option>`).join('')}
                </select>
              </label>
              <label class="admin-field full">
                <span class="admin-field-label">Subtitle</span>
                <input class="input" name="subtitle" value="${escapeHtml(c.subtitle || '')}" placeholder="A practical intro to web app pentesting" />
              </label>
            </div>
          </section>

          <section class="admin-form-section">
            <div class="admin-form-section-head">
              <h4 class="admin-form-section-title">Description</h4>
              <p class="admin-form-section-hint">Markdown supported. This is what shows on the course detail page.</p>
            </div>
            <label class="admin-field full">
              <textarea class="textarea" name="description" rows="6" data-md placeholder="What learners will be able to do after this course…">${escapeHtml(c.description || '')}</textarea>
            </label>
          </section>

          <section class="admin-form-section">
            <div class="admin-form-section-head">
              <h4 class="admin-form-section-title">Pricing</h4>
              <p class="admin-form-section-hint">Free courses are open to anyone signed in.</p>
            </div>
            <div class="admin-form-grid">
              <label class="admin-toggle full">
                <input type="checkbox" name="is_paid" id="cIsPaid" ${c.is_paid ? 'checked' : ''} />
                <span class="admin-toggle-track" aria-hidden="true"><span class="admin-toggle-thumb"></span></span>
                <span class="admin-toggle-label">
                  <strong>Paid course</strong>
                  <span class="dim">Charges via Stripe checkout. Toggle off for free.</span>
                </span>
              </label>
              <label class="admin-field" id="cPriceField">
                <span class="admin-field-label">Price (USD)</span>
                <span class="admin-field-prefixed">
                  <span class="admin-field-prefix">$</span>
                  <input class="input mono" type="number" step="0.01" min="0" name="price_dollars" value="${dollars}" />
                </span>
              </label>
              <label class="admin-field" id="cCurrencyField">
                <span class="admin-field-label">Currency</span>
                <select class="input mono" name="currency">
                  ${['USD','EUR','GBP','CAD','AUD'].map((x) => `<option ${x===(c.currency||'USD')?'selected':''}>${x}</option>`).join('')}
                </select>
              </label>
            </div>
          </section>

          <section class="admin-form-section">
            <div class="admin-form-section-head">
              <h4 class="admin-form-section-title">Visibility</h4>
              <p class="admin-form-section-hint">Unpublished courses stay hidden from the catalog.</p>
            </div>
            <label class="admin-toggle full">
              <input type="checkbox" name="published" ${c.published ? 'checked' : ''} />
              <span class="admin-toggle-track" aria-hidden="true"><span class="admin-toggle-thumb"></span></span>
              <span class="admin-toggle-label">
                <strong>Published</strong>
                <span class="dim">Shows on /courses and is searchable.</span>
              </span>
            </label>
          </section>

          <footer class="admin-form-foot">
            <button class="btn btn-ghost" type="button" id="cCancel2">Cancel</button>
            <button class="btn btn-primary" type="submit">${isEdit ? 'Save changes' : 'Create course'}</button>
          </footer>
        </form>
      </div>`;
    const close = () => { $('#cForm').innerHTML = ''; };
    $('#cCancel').addEventListener('click', close);
    $('#cCancel2').addEventListener('click', close);

    // Toggle the price/currency block based on is_paid
    const isPaid = $('#cIsPaid');
    const priceField = $('#cPriceField');
    const currencyField = $('#cCurrencyField');
    function syncPaidUI() {
      const on = isPaid.checked;
      priceField.classList.toggle('is-disabled', !on);
      currencyField.classList.toggle('is-disabled', !on);
      priceField.querySelector('input').disabled = !on;
      currencyField.querySelector('select').disabled = !on;
    }
    isPaid.addEventListener('change', syncPaidUI);
    syncPaidUI();

    wireMarkdownPreview($('#cForm'));

    $('#cSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const isPaidVal = fd.get('is_paid') === 'on';
      const dollarsVal = Number(fd.get('price_dollars')) || 0;
      const body = {
        slug: fd.get('slug'),
        title: fd.get('title'),
        subtitle: fd.get('subtitle') || null,
        description: fd.get('description') || null,
        difficulty: fd.get('difficulty'),
        is_paid: isPaidVal,
        price_cents: isPaidVal ? Math.round(dollarsVal * 100) : 0,
        currency: fd.get('currency') || 'USD',
        published: fd.get('published') === 'on',
      };
      try {
        if (c.id) await api.req('PATCH', `/api/admin/courses/${c.id}`, body);
        else      await api.post('/api/admin/courses', body);
        window.toast?.(c.id ? 'Course updated' : 'Course created', 'success');
        courses();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
  }

  // ----------------------- Posts -----------------------
  async function posts() {
    try {
      const r = await api.get('/api/admin/posts');
      const rows = r.posts.map((p) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(p.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(p.slug)}</span></div>
          <div>${escapeHtml(p.kind)}</div>
          <div>${p.published ? '✓' : '—'}</div>
          <div class="dim mono" style="font-size:0.78rem;">${fmtDate(p.created_at)}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${p.id}">edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${p.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Posts (${r.posts.length})</h2>
          <button class="btn btn-primary" id="newPBtn">+ New post</button>
        </div>
        ${table(['title / slug','kind','pub','created','actions'], rows, { bulk: { table: 'posts', ids: r.posts.map((p) => p.id) } })}
        <div id="pForm"></div>`;
      $('#newPBtn').addEventListener('click', () => renderPForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', async () => {
          try { const r2 = await api.get(`/api/admin/posts/${b.dataset.edit}`); renderPForm(r2.post); }
          catch (err2) { window.toast(err2.message, 'error'); }
        })
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete post?')) return;
          try { await api.req('DELETE', `/api/admin/posts/${b.dataset.del}`); posts(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderPForm(p) {
    $('#pForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${p.id ? 'Edit' : 'New'} post</h3>
        <form id="pSubForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(p.slug || '')}" required /></label>
          <label>title     <input class="input" name="title" value="${escapeHtml(p.title || '')}" required /></label>
          <label>kind      <select class="input" name="kind">${['note','writeup','tutorial','rant','update'].map((x) => `<option ${x===p.kind?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>tags      <input class="input mono" name="tags" value="${escapeHtml(p.tags || '')}" placeholder="comma,separated" /></label>
          <label>published <input type="checkbox" name="published" ${p.published ? 'checked' : ''} /></label>
          <label class="full">excerpt <textarea class="textarea" name="excerpt" rows="2">${escapeHtml(p.excerpt || '')}</textarea></label>
          <label class="full">content (markdown) <textarea class="textarea mono" name="content_md" rows="10" data-md>${escapeHtml(p.content_md || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${p.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="pCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#pCancel').addEventListener('click', () => { $('#pForm').innerHTML = ''; });
    $('#pSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'), kind: fd.get('kind'),
        excerpt: fd.get('excerpt') || null, content_md: fd.get('content_md') || '',
        tags: fd.get('tags') || null,
        published: fd.get('published') === 'on',
      };
      try {
        if (p.id) await api.req('PATCH', `/api/admin/posts/${p.id}`, body);
        else      await api.post('/api/admin/posts', body);
        posts();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#pForm'));
  }

  // ----------------------- Site settings -----------------------
  async function siteSettings() {
    try {
      const r = await api.get('/api/admin/site-settings');
      const s = r.settings;
      const field = (k, label, type = 'input') => `
        <label class="full"><span class="admin-key">${label} <span class="dim mono" style="font-size:0.7rem;">${k}</span></span>
          ${type === 'textarea'
            ? `<textarea class="textarea" name="${k}" rows="2">${escapeHtml(s[k] || '')}</textarea>`
            : `<input class="input" name="${k}" value="${escapeHtml(s[k] || '')}" />`}
        </label>`;
      main().innerHTML = `
        <h2 style="margin-top:0;">Site settings</h2>
        <p class="dim">Live values surface on the homepage hero, footer, and About snippets. Saved instantly.</p>
        <form id="siteForm" class="card" style="padding:1.25rem; display:grid; gap:0.7rem;">
          ${field('hero_eyebrow', 'Hero eyebrow')}
          ${field('hero_title',   'Hero title (line 1)')}
          ${field('hero_subtitle','Hero subtitle (line 2)')}
          ${field('hero_tagline', 'Hero tagline (paragraph)', 'textarea')}
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;">
            ${field('cta_primary_label',   'Primary CTA label')}
            ${field('cta_primary_href',    'Primary CTA href')}
            ${field('cta_secondary_label', 'Secondary CTA label')}
            ${field('cta_secondary_href',  'Secondary CTA href')}
          </div>
          ${field('about_short',     'About snippet', 'textarea')}
          ${field('footer_tagline',  'Footer tagline', 'textarea')}
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:0.5rem;">
            ${field('social_github',  'GitHub URL')}
            ${field('social_twitter', 'X / Twitter URL')}
            ${field('social_discord', 'Discord URL')}
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-primary" type="submit">Save changes</button>
            <span id="siteFeedback" class="dim" style="font-size:0.85rem; align-self:center;"></span>
          </div>
        </form>`;
      $('#siteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = Object.fromEntries(fd.entries());
        try {
          await api.req('PUT', '/api/admin/site-settings', body);
          $('#siteFeedback').textContent = '✓ saved';
          $('#siteFeedback').style.color = 'var(--terminal,#39ff7a)';
        } catch (err2) {
          $('#siteFeedback').textContent = err2.message;
          $('#siteFeedback').style.color = 'var(--hard,#ff6b6b)';
        }
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  // ----------------------- Lessons editor (sub-view of a course) -----------------------
  // Hook: extend courses() to add a "lessons" button per row.
  // We hijack the courses() output by adding a Manage-lessons link.
  // Already done via the renderCForm section flow; add a sub-handler here.
  async function manageLessons(courseId, courseTitle) {
    try {
      const r = await api.get(`/api/admin/courses/${courseId}/lessons`);
      const rows = r.lessons.map((l) => `
        <div class="admin-row">
          <div>${l.position}</div>
          <div><strong>${escapeHtml(l.title)}</strong> <span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(l.slug)}</span></div>
          <div>${l.estimated_minutes}m</div>
          <div>${l.is_preview ? '✓ free preview' : ''}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${l.id}">edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${l.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <button class="btn btn-ghost" id="lBackC">← back to courses</button>
        <h2 style="margin-top:0.7rem;">${escapeHtml(courseTitle)} — lessons (${r.lessons.length})</h2>
        <button class="btn btn-primary" id="newLesBtn" style="margin-bottom:0.7rem;">+ New lesson</button>
        ${table(['#','title / slug','min','preview','actions'], rows)}
        <div id="lesForm"></div>`;
      $('#lBackC').addEventListener('click', courses);
      $('#newLesBtn').addEventListener('click', () => renderLesForm({ course_id: courseId }, courseId));
      main().querySelectorAll('[data-edit]').forEach((b) => {
        b.addEventListener('click', async () => {
          try { const r2 = await api.get(`/api/admin/lessons/${b.dataset.edit}`); renderLesForm(r2.lesson, courseId, courseTitle); }
          catch (e) { window.toast(e.message, 'error'); }
        });
      });
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete lesson?')) return;
          try { await api.req('DELETE', `/api/admin/lessons/${b.dataset.del}`); manageLessons(courseId, courseTitle); }
          catch (e) { window.toast(e.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderLesForm(l, courseId, courseTitle) {
    $('#lesForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${l.id ? 'Edit' : 'New'} lesson</h3>
        <form id="lesSubForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(l.slug || '')}" required /></label>
          <label>title     <input class="input" name="title" value="${escapeHtml(l.title || '')}" required /></label>
          <label>position  <input class="input mono" type="number" name="position" value="${l.position || 0}" /></label>
          <label>estimated min <input class="input mono" type="number" name="estimated_minutes" value="${l.estimated_minutes || 10}" /></label>
          <label>video url <input class="input mono" name="video_url" value="${escapeHtml(l.video_url || '')}" /></label>
          <label>free preview <input type="checkbox" name="is_preview" ${l.is_preview ? 'checked' : ''} /></label>
          <label class="full">content (markdown) <textarea class="textarea mono" name="content_md" rows="14" data-md>${escapeHtml(l.content_md || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${l.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="lesCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#lesCancel').addEventListener('click', () => { $('#lesForm').innerHTML = ''; });
    $('#lesSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'),
        position: Number(fd.get('position')) || 0,
        estimated_minutes: Number(fd.get('estimated_minutes')) || 10,
        video_url: fd.get('video_url') || null,
        is_preview: fd.get('is_preview') === 'on',
        content_md: fd.get('content_md') || '',
      };
      try {
        if (l.id) await api.req('PATCH', `/api/admin/lessons/${l.id}`, body);
        else      await api.post(`/api/admin/courses/${courseId}/lessons`, body);
        manageLessons(courseId, courseTitle || '(course)');
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#lesForm'));
  }


  // ----------------------- Tracks (paths) -----------------------
  async function tracks() {
    try {
      const r = await api.get('/api/admin/tracks');
      const rows = r.tracks.map((t) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(t.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(t.slug)}</span></div>
          <div>${t.course_count} courses</div>
          <div>${t.bundle_price_cents ? '$' + (t.bundle_price_cents/100).toFixed(2) : 'à la carte'}</div>
          <div>${t.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-courses="${t.id}">courses</button>
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(t).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${t.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Paths / tracks (${r.tracks.length})</h2>
          <button class="btn btn-primary" id="newTBtn">+ New path</button>
        </div>
        ${table(['title / slug','courses','price','pub','actions'], rows)}
        <div id="tForm"></div>`;
      $('#newTBtn').addEventListener('click', () => renderTForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderTForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete path?')) return;
          try { await api.req('DELETE', `/api/admin/tracks/${b.dataset.del}`); tracks(); }
          catch (e) { window.toast(e.message, 'error'); }
        });
      });
      main().querySelectorAll('[data-courses]').forEach((b) =>
        b.addEventListener('click', () => manageTrackCourses(Number(b.dataset.courses)))
      );
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderTForm(t) {
    $('#tForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${t.id ? 'Edit' : 'New'} path</h3>
        <form id="tSubForm" class="admin-form">
          <label>slug     <input class="input mono" name="slug" value="${escapeHtml(t.slug || '')}" required /></label>
          <label>title    <input class="input" name="title" value="${escapeHtml(t.title || '')}" required /></label>
          <label>subtitle <input class="input" name="subtitle" value="${escapeHtml(t.subtitle || '')}" /></label>
          <label>bundle price (¢) <input class="input mono" type="number" name="bundle_price_cents" value="${t.bundle_price_cents || 0}" /></label>
          <label>position <input class="input mono" type="number" name="position" value="${t.position || 0}" /></label>
          <label>published <input type="checkbox" name="published" ${t.published ? 'checked' : ''} /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3" data-md>${escapeHtml(t.description || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${t.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="tCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#tCancel').addEventListener('click', () => { $('#tForm').innerHTML = ''; });
    $('#tSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'), subtitle: fd.get('subtitle') || null,
        description: fd.get('description') || null,
        bundle_price_cents: Number(fd.get('bundle_price_cents')) || 0,
        position: Number(fd.get('position')) || 0,
        published: fd.get('published') === 'on',
      };
      try {
        if (t.id) await api.req('PATCH', `/api/admin/tracks/${t.id}`, body);
        else      await api.post('/api/admin/tracks', body);
        tracks();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#tForm'));
  }

  async function manageTrackCourses(trackId) {
    try {
      const [cur, all] = await Promise.all([
        api.get(`/api/admin/tracks/${trackId}/courses`),
        api.get('/api/admin/courses'),
      ]);
      const inSet = new Set(cur.courses.map((c) => c.id));
      const opts = all.courses.filter((c) => !inSet.has(c.id))
        .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
      const rows = cur.courses.map((c) => `
        <div class="admin-row">
          <div>${c.position}</div>
          <div>${escapeHtml(c.title)} <span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(c.slug)}</span></div>
          <div><button class="btn btn-ghost btn-sm" data-rm="${c.id}">remove</button></div>
        </div>`);
      main().innerHTML = `
        <button class="btn btn-ghost" id="tBack">← back to paths</button>
        <h2 style="margin-top:0.7rem;">Path #${trackId} courses (${cur.courses.length})</h2>
        <div class="card" style="padding:1.25rem; margin-bottom:1rem;">
          <h3 style="margin-top:0;">Add course</h3>
          <form id="addTC" class="admin-form">
            <label>course <select class="input" name="course_id" required>${opts}</select></label>
            <label>position <input class="input mono" type="number" name="position" value="${cur.courses.length}" /></label>
            <div class="full"><button class="btn btn-primary" type="submit">Add</button></div>
          </form>
        </div>
        ${table(['#','course','actions'], rows)}`;
      $('#tBack').addEventListener('click', tracks);
      $('#addTC').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.post(`/api/admin/tracks/${trackId}/courses`, {
            course_id: Number(fd.get('course_id')),
            position: Number(fd.get('position')) || 0,
          });
          manageTrackCourses(trackId);
        } catch (err2) { window.toast(err2.message, 'error'); }
      });
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Remove course from path?')) return;
          try { await api.req('DELETE', `/api/admin/tracks/${trackId}/courses/${b.dataset.rm}`); manageTrackCourses(trackId); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  // ----------------------- Cert prep -----------------------
  async function certPrep() {
    try {
      const r = await api.get('/api/admin/cert-prep');
      const rows = r.certs.map((c) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(c.cert_name)}</strong> <span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(c.slug)}</span><br><span class="dim" style="font-size:0.78rem;">${escapeHtml(c.cert_issuer)}</span></div>
          <div>${escapeHtml(c.difficulty || '')}</div>
          <div>${c.course_count} courses · ${c.chal_count} chals</div>
          <div>${c.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(c).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${c.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Cert prep (${r.certs.length})</h2>
          <button class="btn btn-primary" id="newCpBtn">+ New cert</button>
        </div>
        ${table(['cert','diff','content','pub','actions'], rows)}
        <div id="cpForm"></div>`;
      $('#newCpBtn').addEventListener('click', () => renderCpForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderCpForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete cert prep entry?')) return;
          try { await api.req('DELETE', `/api/admin/cert-prep/${b.dataset.del}`); certPrep(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderCpForm(c) {
    $('#cpForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${c.id ? 'Edit' : 'New'} cert prep</h3>
        <form id="cpSubForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(c.slug || '')}" required /></label>
          <label>cert name <input class="input" name="cert_name" value="${escapeHtml(c.cert_name || '')}" placeholder="OSCP" required /></label>
          <label>full name <input class="input" name="cert_full_name" value="${escapeHtml(c.cert_full_name || '')}" /></label>
          <label>issuer    <input class="input" name="cert_issuer" value="${escapeHtml(c.cert_issuer || '')}" placeholder="Offensive Security" required /></label>
          <label>difficulty<select class="input" name="difficulty">${['','entry','intermediate','advanced','expert'].map((x) => `<option value="${x}" ${x===(c.difficulty||'')?'selected':''}>${x||'—'}</option>`).join('')}</select></label>
          <label>duration  <input class="input" name="duration_estimate" value="${escapeHtml(c.duration_estimate || '')}" placeholder="3-4 months" /></label>
          <label>exam cost (¢) <input class="input mono" type="number" name="exam_cost_cents" value="${c.exam_cost_cents || ''}" /></label>
          <label>exam URL  <input class="input mono" name="exam_url" value="${escapeHtml(c.exam_url || '')}" /></label>
          <label>position  <input class="input mono" type="number" name="position" value="${c.position || 0}" /></label>
          <label>published <input type="checkbox" name="published" ${c.published ? 'checked' : ''} /></label>
          <label class="full">tagline <input class="input" name="tagline" value="${escapeHtml(c.tagline || '')}" /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3" data-md>${escapeHtml(c.description || '')}</textarea></label>
          <label class="full">what covered <textarea class="textarea" name="what_covered" rows="3" data-md>${escapeHtml(c.what_covered || '')}</textarea></label>
          <label class="full">what NOT covered <textarea class="textarea" name="what_not_covered" rows="2" data-md>${escapeHtml(c.what_not_covered || '')}</textarea></label>
          <label class="full">exam tips <textarea class="textarea" name="exam_tips" rows="3" data-md>${escapeHtml(c.exam_tips || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${c.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="cpCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#cpCancel').addEventListener('click', () => { $('#cpForm').innerHTML = ''; });
    $('#cpSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), cert_name: fd.get('cert_name'),
        cert_full_name: fd.get('cert_full_name') || null,
        cert_issuer: fd.get('cert_issuer'),
        difficulty: fd.get('difficulty') || null,
        duration_estimate: fd.get('duration_estimate') || null,
        exam_cost_cents: fd.get('exam_cost_cents') ? Number(fd.get('exam_cost_cents')) : null,
        exam_url: fd.get('exam_url') || null,
        position: Number(fd.get('position')) || 0,
        published: fd.get('published') === 'on',
        tagline: fd.get('tagline') || null,
        description: fd.get('description') || null,
        what_covered: fd.get('what_covered') || null,
        what_not_covered: fd.get('what_not_covered') || null,
        exam_tips: fd.get('exam_tips') || null,
      };
      try {
        if (c.id) await api.req('PATCH', `/api/admin/cert-prep/${c.id}`, body);
        else      await api.post('/api/admin/cert-prep', body);
        certPrep();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#cpForm'));
  }

  // ----------------------- Cheatsheets -----------------------
  async function cheatsheets() {
    try {
      const r = await api.get('/api/admin/cheatsheets');
      const rows = r.cheatsheets.map((c) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(c.title)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(c.slug)}</span></div>
          <div>${escapeHtml(c.category || '')}</div>
          <div>${c.position}</div>
          <div>${c.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${c.id}">edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${c.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Cheatsheets (${r.cheatsheets.length})</h2>
          <button class="btn btn-primary" id="newChBtn">+ New cheatsheet</button>
        </div>
        ${table(['title / slug','category','pos','pub','actions'], rows, { bulk: { table: 'cheatsheets', ids: r.cheatsheets.map((c) => c.id) } })}
        <div id="chForm"></div>`;
      $('#newChBtn').addEventListener('click', () => renderChForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', async () => {
          try { const r2 = await api.get(`/api/admin/cheatsheets/${b.dataset.edit}`); renderChForm(r2.cheatsheet); }
          catch (e) { window.toast(e.message, 'error'); }
        })
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete cheatsheet?')) return;
          try { await api.req('DELETE', `/api/admin/cheatsheets/${b.dataset.del}`); cheatsheets(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderChForm(c) {
    $('#chForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${c.id ? 'Edit' : 'New'} cheatsheet</h3>
        <form id="chSubForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(c.slug || '')}" required /></label>
          <label>title     <input class="input" name="title" value="${escapeHtml(c.title || '')}" required /></label>
          <label>subtitle  <input class="input" name="subtitle" value="${escapeHtml(c.subtitle || '')}" /></label>
          <label>category  <select class="input" name="category">${['','recon','exploitation','post-ex','crypto','reversing','forensics','cloud','web','tools'].map((x) => `<option value="${x}" ${x===(c.category||'')?'selected':''}>${x||'—'}</option>`).join('')}</select></label>
          <label>tool URL  <input class="input mono" name="tool_url" value="${escapeHtml(c.tool_url || '')}" /></label>
          <label>position  <input class="input mono" type="number" name="position" value="${c.position || 0}" /></label>
          <label>published <input type="checkbox" name="published" ${c.published ? 'checked' : ''} /></label>
          <label class="full">content (markdown) <textarea class="textarea mono" name="content_md" rows="14" data-md>${escapeHtml(c.content_md || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${c.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="chCancel2">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#chCancel2').addEventListener('click', () => { $('#chForm').innerHTML = ''; });
    $('#chSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'),
        subtitle: fd.get('subtitle') || null,
        category: fd.get('category') || null,
        tool_url: fd.get('tool_url') || null,
        content_md: fd.get('content_md') || '',
        position: Number(fd.get('position')) || 0,
        published: fd.get('published') === 'on',
      };
      try {
        if (c.id) await api.req('PATCH', `/api/admin/cheatsheets/${c.id}`, body);
        else      await api.post('/api/admin/cheatsheets', body);
        cheatsheets();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#chForm'));
  }

  // ----------------------- Calendar events (community-listing kind) -----------------------
  async function calendar() {
    try {
      const r = await api.get('/api/admin/calendar-events');
      const rows = r.events.map((e) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(e.name)}</strong><br><span class="dim mono" style="font-size:0.75rem;">/${escapeHtml(e.slug)}</span></div>
          <div>${escapeHtml(e.kind)} · ${escapeHtml(e.format || '')}</div>
          <div>${escapeHtml(e.start_date)}</div>
          <div>${escapeHtml(e.region || '')}</div>
          <div>${e.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(e).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${e.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Calendar events (${r.events.length})</h2>
          <button class="btn btn-primary" id="newCalBtn">+ New event</button>
        </div>
        ${table(['name / slug','kind','date','region','pub','actions'], rows)}
        <div id="calForm"></div>`;
      $('#newCalBtn').addEventListener('click', () => renderCalForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderCalForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete event?')) return;
          try { await api.req('DELETE', `/api/admin/calendar-events/${b.dataset.del}`); calendar(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderCalForm(e) {
    $('#calForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${e.id ? 'Edit' : 'New'} calendar event</h3>
        <form id="calSubForm" class="admin-form">
          <label>slug    <input class="input mono" name="slug" value="${escapeHtml(e.slug || '')}" required /></label>
          <label>name    <input class="input" name="name" value="${escapeHtml(e.name || '')}" required /></label>
          <label>kind    <select class="input" name="kind">${['ctf','conference','bugbounty','awareness','workshop'].map((x) => `<option ${x===e.kind?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>format  <select class="input" name="format">${['','jeopardy','attack-defense','in-person','virtual','hybrid'].map((x) => `<option value="${x}" ${x===(e.format||'')?'selected':''}>${x||'—'}</option>`).join('')}</select></label>
          <label>start   <input class="input mono" type="date" name="start_date" value="${escapeHtml(e.start_date || '')}" required /></label>
          <label>end     <input class="input mono" type="date" name="end_date"   value="${escapeHtml(e.end_date || '')}" /></label>
          <label>region  <select class="input" name="region">${['','global','mena','us','eu','apac'].map((x) => `<option value="${x}" ${x===(e.region||'')?'selected':''}>${x||'—'}</option>`).join('')}</select></label>
          <label>difficulty<select class="input" name="difficulty">${['','beginner','intermediate','advanced','mixed'].map((x) => `<option value="${x}" ${x===(e.difficulty||'')?'selected':''}>${x||'—'}</option>`).join('')}</select></label>
          <label>location<input class="input" name="location" value="${escapeHtml(e.location || '')}" /></label>
          <label>URL     <input class="input mono" name="url" value="${escapeHtml(e.url || '')}" /></label>
          <label>prize   <input class="input" name="prize_pool" value="${escapeHtml(e.prize_pool || '')}" /></label>
          <label>organizer <input class="input" name="organizer" value="${escapeHtml(e.organizer || '')}" /></label>
          <label>position <input class="input mono" type="number" name="position" value="${e.position || 0}" /></label>
          <label>published <input type="checkbox" name="published" ${e.published ? 'checked' : ''} /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3" data-md>${escapeHtml(e.description || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${e.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="calCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#calCancel').addEventListener('click', () => { $('#calForm').innerHTML = ''; });
    $('#calSubForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = {};
      for (const [k, v] of fd.entries()) body[k] = v || null;
      body.published = fd.get('published') === 'on';
      body.position = Number(body.position) || 0;
      try {
        if (e.id) await api.req('PATCH', `/api/admin/calendar-events/${e.id}`, body);
        else      await api.post('/api/admin/calendar-events', body);
        calendar();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#calForm'));
  }

  // ----------------------- Talks -----------------------
  async function talks() {
    try {
      const r = await api.get('/api/admin/talks');
      const rows = r.talks.map((t) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(t.title)}</strong></div>
          <div>${escapeHtml(t.venue)}</div>
          <div>${escapeHtml(t.date)}</div>
          <div>${escapeHtml(t.kind)}</div>
          <div>${t.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(t).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${t.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Talks (${r.talks.length})</h2>
          <button class="btn btn-primary" id="newTkBtn">+ New talk</button>
        </div>
        ${table(['title','venue','date','kind','pub','actions'], rows)}
        <div id="tkForm"></div>`;
      $('#newTkBtn').addEventListener('click', () => renderTkForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderTkForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete talk?')) return;
          try { await api.req('DELETE', `/api/admin/talks/${b.dataset.del}`); talks(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderTkForm(t) {
    $('#tkForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${t.id ? 'Edit' : 'New'} talk</h3>
        <form id="tkSubForm" class="admin-form">
          <label>title    <input class="input" name="title" value="${escapeHtml(t.title || '')}" required /></label>
          <label>venue    <input class="input" name="venue" value="${escapeHtml(t.venue || '')}" required /></label>
          <label>date     <input class="input mono" type="date" name="date" value="${escapeHtml(t.date || '')}" required /></label>
          <label>kind     <select class="input" name="kind">${['talk','keynote','workshop','podcast'].map((x) => `<option ${x===(t.kind||'talk')?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>URL      <input class="input mono" name="url" value="${escapeHtml(t.url || '')}" /></label>
          <label>position <input class="input mono" type="number" name="position" value="${t.position || 0}" /></label>
          <label>published <input type="checkbox" name="published" ${t.published ? 'checked' : ''} /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3" data-md>${escapeHtml(t.description || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${t.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="tkCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#tkCancel').addEventListener('click', () => { $('#tkForm').innerHTML = ''; });
    $('#tkSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        title: fd.get('title'), venue: fd.get('venue'), date: fd.get('date'),
        kind: fd.get('kind'), url: fd.get('url') || null,
        description: fd.get('description') || null,
        position: Number(fd.get('position')) || 0,
        published: fd.get('published') === 'on',
      };
      try {
        if (t.id) await api.req('PATCH', `/api/admin/talks/${t.id}`, body);
        else      await api.post('/api/admin/talks', body);
        talks();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#tkForm'));
  }

  // ----------------------- Testimonials -----------------------
  async function testimonials() {
    try {
      const r = await api.get('/api/admin/testimonials');
      const rows = r.testimonials.map((t) => `
        <div class="admin-row">
          <div><strong>${escapeHtml(t.author_name)}</strong><br><span class="dim" style="font-size:0.78rem;">${escapeHtml(t.author_title || '')} ${t.author_company ? '· ' + escapeHtml(t.author_company) : ''}</span></div>
          <div>${escapeHtml((t.quote || '').slice(0, 100))}…</div>
          <div>${t.rating ? '★'.repeat(t.rating) : ''}</div>
          <div>${escapeHtml(t.course_title || '(generic)')}</div>
          <div>${t.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(t).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${t.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Testimonials (${r.testimonials.length})</h2>
          <button class="btn btn-primary" id="newTmBtn">+ New testimonial</button>
        </div>
        ${table(['author','quote','rating','course','pub','actions'], rows)}
        <div id="tmForm"></div>`;
      $('#newTmBtn').addEventListener('click', () => renderTmForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderTmForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete testimonial?')) return;
          try { await api.req('DELETE', `/api/admin/testimonials/${b.dataset.del}`); testimonials(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderTmForm(t) {
    $('#tmForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${t.id ? 'Edit' : 'New'} testimonial</h3>
        <form id="tmSubForm" class="admin-form">
          <label>author name    <input class="input" name="author_name" value="${escapeHtml(t.author_name || '')}" required /></label>
          <label>author title   <input class="input" name="author_title" value="${escapeHtml(t.author_title || '')}" /></label>
          <label>author company <input class="input" name="author_company" value="${escapeHtml(t.author_company || '')}" /></label>
          <label>rating         <input class="input mono" type="number" name="rating" min="1" max="5" value="${t.rating || ''}" /></label>
          <label>course id (optional) <input class="input mono" type="number" name="course_id" value="${t.course_id || ''}" /></label>
          <label>position       <input class="input mono" type="number" name="position" value="${t.position || 0}" /></label>
          <label>published      <input type="checkbox" name="published" ${t.published ? 'checked' : ''} /></label>
          <label class="full">quote <textarea class="textarea" name="quote" rows="4" required>${escapeHtml(t.quote || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${t.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="tmCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#tmCancel').addEventListener('click', () => { $('#tmForm').innerHTML = ''; });
    $('#tmSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        author_name: fd.get('author_name'),
        author_title: fd.get('author_title') || null,
        author_company: fd.get('author_company') || null,
        rating: fd.get('rating') ? Number(fd.get('rating')) : null,
        course_id: fd.get('course_id') ? Number(fd.get('course_id')) : null,
        quote: fd.get('quote'),
        position: Number(fd.get('position')) || 0,
        published: fd.get('published') === 'on',
      };
      try {
        if (t.id) await api.req('PATCH', `/api/admin/testimonials/${t.id}`, body);
        else      await api.post('/api/admin/testimonials', body);
        testimonials();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
  }

  // ----------------------- FAQs -----------------------
  async function faqs() {
    try {
      const r = await api.get('/api/admin/faqs');
      const rows = r.faqs.map((f) => `
        <div class="admin-row">
          <div>${escapeHtml(f.scope)}${f.course_title ? ' · ' + escapeHtml(f.course_title) : ''}</div>
          <div><strong>${escapeHtml(f.question)}</strong></div>
          <div>${f.position}</div>
          <div>${f.published ? '✓' : '—'}</div>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-sm" data-edit='${JSON.stringify(f).replace(/'/g, "&apos;")}'>edit</button>
            <button class="btn btn-ghost btn-sm" data-del="${f.id}">delete</button>
          </div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">FAQs (${r.faqs.length})</h2>
          <button class="btn btn-primary" id="newFqBtn">+ New FAQ</button>
        </div>
        ${table(['scope','question','pos','pub','actions'], rows)}
        <div id="fqForm"></div>`;
      $('#newFqBtn').addEventListener('click', () => renderFqForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => renderFqForm(JSON.parse(b.dataset.edit.replace(/&apos;/g, "'"))))
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete FAQ?')) return;
          try { await api.req('DELETE', `/api/admin/faqs/${b.dataset.del}`); faqs(); }
          catch (err2) { window.toast(err2.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderFqForm(f) {
    $('#fqForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${f.id ? 'Edit' : 'New'} FAQ</h3>
        <form id="fqSubForm" class="admin-form">
          <label>scope     <select class="input" name="scope">${['general','course','pricing','hire'].map((x) => `<option ${x===(f.scope||'general')?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>course id <input class="input mono" type="number" name="course_id" value="${f.course_id || ''}" /></label>
          <label>position  <input class="input mono" type="number" name="position" value="${f.position || 0}" /></label>
          <label>published <input type="checkbox" name="published" ${f.published ? 'checked' : ''} /></label>
          <label class="full">question <input class="input" name="question" value="${escapeHtml(f.question || '')}" required /></label>
          <label class="full">answer   <textarea class="textarea" name="answer" rows="4" required data-md>${escapeHtml(f.answer || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${f.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="fqCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#fqCancel').addEventListener('click', () => { $('#fqForm').innerHTML = ''; });
    $('#fqSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        scope: fd.get('scope'),
        course_id: fd.get('course_id') ? Number(fd.get('course_id')) : null,
        question: fd.get('question'), answer: fd.get('answer'),
        position: Number(fd.get('position')) || 0,
        published: fd.get('published') === 'on',
      };
      try {
        if (f.id) await api.req('PATCH', `/api/admin/faqs/${f.id}`, body);
        else      await api.post('/api/admin/faqs', body);
        faqs();
      } catch (err2) { window.toast(err2.message, 'error'); }
    });
    wireMarkdownPreview($('#fqForm'));
  }

  // ----------------------- Newsletter (read-only + CSV) -----------------------
  async function newsletter() {
    try {
      const r = await api.get('/api/admin/newsletter');
      const rows = r.subscribers.map((s) => `
        <div class="admin-row">
          <div class="mono">${escapeHtml(s.email)}</div>
          <div>${escapeHtml(s.source || '')}</div>
          <div>${s.confirmed ? '✓' : '—'}</div>
          <div class="dim mono" style="font-size:0.78rem;">${fmtDate(s.subscribed_at)}</div>
          <div>${s.unsubscribed_at ? '✗ unsubbed' : ''}</div>
          <div><button class="btn btn-ghost btn-sm" data-rm="${s.id}" ${s.unsubscribed_at ? 'disabled' : ''}>unsub</button></div>
        </div>`);
      main().innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Newsletter (${r.subscribers.length})</h2>
          <a class="btn btn-ghost" href="/api/admin/newsletter.csv" download>Export CSV</a>
        </div>
        ${table(['email','source','conf','subbed','unsubbed','actions'], rows)}`;
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Mark unsubscribed?')) return;
          try { await api.req('DELETE', `/api/admin/newsletter/${b.dataset.rm}`); newsletter(); }
          catch (e) { window.toast(e.message, 'error'); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }
})();
