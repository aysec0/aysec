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
    main().innerHTML = '<div class="card" style="padding:1.5rem;">loading…</div>';
    if (tab === 'overview')   return overview();
    if (tab === 'users')      return users();
    if (tab === 'challenges') return challenges();
    if (tab === 'daily')      return daily();
    if (tab === 'ctf-events') return ctfEvents();
    if (tab === 'assessments')return assessments();
    if (tab === 'pro-labs')   return proLabs();
    if (tab === 'courses')    return courses();
    if (tab === 'posts')      return posts();
  }

  function err(e) {
    return `<div class="alert error" style="margin-top:0.7rem;">${escapeHtml(e.message || 'Request failed')}</div>`;
  }

  function table(headers, rows) {
    return `
      <div class="admin-table">
        <div class="admin-row admin-head">${headers.map((h) => `<div>${h}</div>`).join('')}</div>
        ${rows.length ? rows.join('') : '<div class="admin-empty">no rows</div>'}
      </div>`;
  }

  // ----------------------- Overview -----------------------
  async function overview() {
    try {
      const r = await api.get('/api/admin/overview');
      const items = Object.entries(r.counts).map(([k, v]) =>
        `<div class="admin-stat-card">
          <div class="admin-stat-label">${k}</div>
          <div class="admin-stat-value">${v ?? '—'}</div>
        </div>`).join('');
      main().innerHTML = `
        <h2 style="margin-top:0;">Overview</h2>
        <div class="admin-stat-grid">${items}</div>`;
    } catch (e) { main().innerHTML = err(e); }
  }

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
          catch (e) { alert(e.message); }
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
        ${table(['title / slug','cat·diff','pts','solves','pub','actions'], rows)}
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
          catch (e) { alert(e.message); }
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
      } catch (err2) { alert(err2.message); }
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
        } catch (err2) { alert(err2.message); }
      });
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm(`Remove daily for ${b.dataset.del}?`)) return;
          try { await api.req('DELETE', `/api/admin/daily/${b.dataset.del}`); daily(); }
          catch (err2) { alert(err2.message); }
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
          catch (err2) { alert(err2.message); }
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
      } catch (err2) { alert(err2.message); }
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
        } catch (err2) { alert(err2.message); }
      });
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Remove challenge from event?')) return;
          try { await api.req('DELETE', `/api/admin/ctf-events/${eventId}/challenges/${b.dataset.rm}`); manageEventChallenges(eventId); }
          catch (err2) { alert(err2.message); }
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
          catch (err2) { alert(err2.message); }
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
      } catch (err2) { alert(err2.message); }
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
        } catch (err2) { alert(err2.message); }
      });
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Remove machine?')) return;
          try { await api.req('DELETE', `/api/admin/assessments/${aid}/machines/${b.dataset.rm}`); manageAssessmentMachines(aid); }
          catch (err2) { alert(err2.message); }
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
          catch (err2) { alert(err2.message); }
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
      } catch (err2) { alert(err2.message); }
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
        } catch (err2) { alert(err2.message); }
      });
      main().querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Remove machine?')) return;
          try { await api.req('DELETE', `/api/admin/pro-labs/${lid}/machines/${b.dataset.rm}`); manageProLabMachines(lid); }
          catch (err2) { alert(err2.message); }
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
          catch (err2) { alert(err2.message); }
        });
      });
    } catch (e) { main().innerHTML = err(e); }
  }

  function renderCForm(c) {
    $('#cForm').innerHTML = `
      <div class="card" style="padding:1.25rem; margin-top:1rem;">
        <h3 style="margin-top:0;">${c.id ? 'Edit' : 'New'} course</h3>
        <form id="cSubForm" class="admin-form">
          <label>slug      <input class="input mono" name="slug" value="${escapeHtml(c.slug || '')}" required /></label>
          <label>title     <input class="input" name="title" value="${escapeHtml(c.title || '')}" required /></label>
          <label>subtitle  <input class="input" name="subtitle" value="${escapeHtml(c.subtitle || '')}" /></label>
          <label>difficulty<select class="input" name="difficulty">${['beginner','intermediate','advanced'].map((x) => `<option ${x===c.difficulty?'selected':''}>${x}</option>`).join('')}</select></label>
          <label>is paid   <input type="checkbox" name="is_paid" ${c.is_paid ? 'checked' : ''} /></label>
          <label>price (¢) <input class="input mono" type="number" name="price_cents" value="${c.price_cents || 0}" /></label>
          <label>currency  <input class="input mono" name="currency" value="${escapeHtml(c.currency || 'USD')}" /></label>
          <label>published <input type="checkbox" name="published" ${c.published ? 'checked' : ''} /></label>
          <label class="full">description <textarea class="textarea" name="description" rows="3">${escapeHtml(c.description || '')}</textarea></label>
          <div class="full" style="display:flex; gap:0.4rem;">
            <button class="btn btn-primary" type="submit">${c.id ? 'Save' : 'Create'}</button>
            <button class="btn btn-ghost" type="button" id="cCancel">Cancel</button>
          </div>
        </form>
      </div>`;
    $('#cCancel').addEventListener('click', () => { $('#cForm').innerHTML = ''; });
    $('#cSubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        slug: fd.get('slug'), title: fd.get('title'), subtitle: fd.get('subtitle') || null,
        description: fd.get('description') || null, difficulty: fd.get('difficulty'),
        is_paid: fd.get('is_paid') === 'on',
        price_cents: Number(fd.get('price_cents')) || 0,
        currency: fd.get('currency') || 'USD',
        published: fd.get('published') === 'on',
      };
      try {
        if (c.id) await api.req('PATCH', `/api/admin/courses/${c.id}`, body);
        else      await api.post('/api/admin/courses', body);
        courses();
      } catch (err2) { alert(err2.message); }
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
        ${table(['title / slug','kind','pub','created','actions'], rows)}
        <div id="pForm"></div>`;
      $('#newPBtn').addEventListener('click', () => renderPForm({}));
      main().querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', async () => {
          try { const r2 = await api.get(`/api/admin/posts/${b.dataset.edit}`); renderPForm(r2.post); }
          catch (err2) { alert(err2.message); }
        })
      );
      main().querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete post?')) return;
          try { await api.req('DELETE', `/api/admin/posts/${b.dataset.del}`); posts(); }
          catch (err2) { alert(err2.message); }
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
          <label class="full">content (markdown) <textarea class="textarea mono" name="content_md" rows="10">${escapeHtml(p.content_md || '')}</textarea></label>
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
      } catch (err2) { alert(err2.message); }
    });
  }
})();
