(() => {
  const slug = location.pathname.split('/').filter(Boolean)[1];
  let user = null;
  let chal = null;
  let solved = false;

  const ICONS = {
    error: '<svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    ok:    '<svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    warn:  '<svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  };

  const CROWN_SVG = `<svg class="first-blood-crown" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 19h20l-2-9-5 4-5-8-5 8-5-4-2 9zm0 2h20v2H2v-2z"/></svg>`;

  function showAlert(el, kind, msg) {
    el.hidden = false;
    el.className = `alert ${kind}`;
    el.innerHTML = `${ICONS[kind] || ''}<div>${escapeHtml(msg)}</div>`;
  }

  function diffDots(diff) {
    const order = ['easy', 'medium', 'hard', 'insane'];
    const idx = order.indexOf((diff || '').toLowerCase());
    const lvl = idx >= 0 ? idx + 1 : 1;
    const dots = Array.from({ length: 4 }, (_, i) =>
      `<span class="dot${i < lvl ? ' on' : ''}"></span>`
    ).join('');
    return `<span class="diff-dots" data-diff="${escapeHtml((diff||'').toLowerCase())}">${dots}<span style="margin-left:6px">${escapeHtml(diff || '')}</span></span>`;
  }

  function renderHead() {
    document.title = `${chal.title} — aysec`;
    document.getElementById('crumbSlug').textContent = chal.slug;
    document.getElementById('detailHead').innerHTML = `
      <div class="detail-meta">
        <span class="card-type ${chal.category === 'ai' ? 'ai' : 'challenge'}">${escapeHtml(chal.category)}</span>
        ${diffDots(chal.difficulty)}
        <span class="card-meta-item">${chal.points} pts</span>
        ${solved ? '<span class="badge solved">✓ solved</span>' : ''}
      </div>
      <h1 class="detail-title">${escapeHtml(chal.title)}</h1>
      ${chal.author ? `<p class="muted">by <strong>${escapeHtml(chal.author)}</strong></p>` : ''}`;
  }

  function renderBody(data) {
    const body = document.getElementById('challengeBody');
    body.innerHTML = `
      <div class="prose">
        <p>${escapeHtml(chal.description || '')}</p>
        ${chal.attachment_url ? `<p><a href="${escapeHtml(chal.attachment_url)}" download>↓ Download attachment</a></p>` : ''}
        ${chal.remote_url ? `<p><strong>Target:</strong> <code>${escapeHtml(chal.remote_url)}</code></p>` : ''}
      </div>`;

    const stats = document.getElementById('challengeStats');
    const fb = (data.solvers || []).find((s) => s.first_blood);
    stats.innerHTML = `
      <div class="stat"><span class="stat-key">category</span><span class="stat-val">${escapeHtml(chal.category)}</span></div>
      <div class="stat"><span class="stat-key">difficulty</span><span class="stat-val">${escapeHtml(chal.difficulty)}</span></div>
      <div class="stat"><span class="stat-key">points</span><span class="stat-val">${chal.points}</span></div>
      <div class="stat"><span class="stat-key">solves</span><span class="stat-val">${data.solves}</span></div>
      ${fb ? `<div class="stat"><span class="stat-key">first blood</span><span class="stat-val" style="color:var(--challenge); display:inline-flex; align-items:center; gap:6px;">${CROWN_SVG} ${escapeHtml(fb.display_name || fb.username)}</span></div>` : ''}
      ${chal.author ? `<div class="stat"><span class="stat-key">author</span><span class="stat-val">${escapeHtml(chal.author)}</span></div>` : ''}
    `;

    renderSolvers(data.solvers || [], data.solves);
  }

  function renderSolvers(rows, total) {
    const box = document.getElementById('solversBox');
    const cnt = document.getElementById('solverCount');
    cnt.textContent = total ? `(showing ${rows.length} of ${total})` : '';
    if (!rows.length) {
      box.innerHTML = `<div class="empty"><h3>Unsolved</h3><p>Be the first to plant the flag.</p></div>`;
      return;
    }
    box.innerHTML = `
      <div class="solvers">
        <div class="solver-row head">
          <div>#</div>
          <div>User</div>
          <div style="text-align:right">When</div>
        </div>
        ${rows.map((s, i) => `
          <div class="solver-row ${s.first_blood ? 'first-blood' : ''}">
            <div class="solver-rank">
              ${s.first_blood ? CROWN_SVG : String(i + 1).padStart(2, '0')}
            </div>
            <div class="solver-name">${escapeHtml(s.display_name || s.username)}</div>
            <div class="solver-time">${escapeHtml(window.fmtRelative(s.solved_at))}</div>
          </div>`).join('')}
      </div>`;
  }

  function renderHints(hints) {
    if (!hints?.length) return;
    let host = document.getElementById('hintsBox');
    if (!host) {
      host = document.createElement('div');
      host.id = 'hintsBox';
      const flagForm = document.querySelector('.flag-form');
      flagForm?.parentNode?.insertBefore(host, flagForm.nextSibling);
    }
    const revealedKey = `hints:${slug}`;
    const revealed = new Set(JSON.parse(localStorage.getItem(revealedKey) || '[]'));
    const persist = () => localStorage.setItem(revealedKey, JSON.stringify([...revealed]));

    function rebuild() {
      host.className = 'hint-list';
      host.innerHTML = `
        <div class="hint-head">
          <span>// hints (${hints.length})</span>
          <span class="dim">click to reveal</span>
        </div>
        ${hints.map((h, i) => {
          const open = revealed.has(i);
          if (open) {
            return `<div class="hint-item hint-revealed">
              <span class="hint-num">#${String(i + 1).padStart(2, '0')}</span>
              <span class="hint-text">${escapeHtml(h)}</span>
            </div>`;
          }
          return `<div class="hint-item hint-locked">
            <span class="hint-num">#${String(i + 1).padStart(2, '0')}</span>
            <span class="hint-text">
              Hidden — try the challenge first.
              <button class="hint-reveal-btn" data-idx="${i}">Reveal hint #${i + 1}</button>
            </span>
          </div>`;
        }).join('')}`;
      host.querySelectorAll('.hint-reveal-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          revealed.add(Number(btn.dataset.idx));
          persist();
          rebuild();
        });
      });
    }
    rebuild();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    user = (await window.api.get('/api/auth/me').catch(() => null))?.user || null;
    try {
      const data = await window.api.get(`/api/challenges/${slug}`);
      chal = data.challenge;
      solved = data.solved;
      renderHead();
      renderBody(data);
      renderHints(data.hints);
    } catch (err) {
      document.getElementById('detailHead').innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Challenge not found')}</div>`;
    }

    const form = document.getElementById('flagForm');
    const alertEl = document.getElementById('flagAlert');
    const btn = document.getElementById('flagBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertEl.hidden = true;
      const flag = document.getElementById('flagInput').value.trim();
      if (!flag) {
        showAlert(alertEl, 'error', 'Enter a flag.');
        return;
      }
      if (!user) {
        location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      btn.disabled = true;
      const idle = btn.textContent;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const res = await window.api.post(`/api/challenges/${slug}/submit`, { flag });
        if (res.correct) {
          // Re-fetch to get fresh solver list incl. ourselves + first-blood (if no prior solves)
          const d = await window.api.get(`/api/challenges/${slug}`);
          const wasFirst = d.solvers?.[0]?.username === user.username;
          showAlert(alertEl, 'ok',
            wasFirst ? '🩸 First blood — flag accepted. Points credited.' : 'Correct flag — nice. Points credited.');
          solved = true;
          renderHead();
          renderBody(d);
        } else {
          showAlert(alertEl, 'warn', 'Incorrect flag. Try again.');
        }
      } catch (err) {
        showAlert(alertEl, 'error', err.message || 'Submit failed');
      } finally {
        btn.disabled = false;
        btn.textContent = idle;
      }
    });
  });
})();
