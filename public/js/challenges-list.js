(() => {
  let all = [];
  let user = null;
  let totalChallenges = 0;
  let cat = 'all';
  let diff = 'all';
  let status = 'all';
  let query = '';

  const CATEGORY_ORDER = ['web', 'crypto', 'pwn', 'rev', 'forensics', 'ai', 'misc'];

  const CATEGORY_META = {
    web: {
      label: 'Web Exploitation',
      blurb: 'Modern web vulns: injection, auth bugs, SSRF, deserialization, supply-chain.',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    },
    crypto: {
      label: 'Cryptography',
      blurb: 'Classical ciphers, RSA, AES modes, ECDSA bugs, real-world misuse.',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    },
    pwn: {
      label: 'Binary Exploitation',
      blurb: 'Stack/heap overflows, format strings, ROP, mitigations bypass.',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v3m8-3v3"/><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M9 9l6 6m0-6l-6 6"/></svg>',
    },
    rev: {
      label: 'Reverse Engineering',
      blurb: 'Static + dynamic analysis: Ghidra, GDB, anti-debug bypass, packers.',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    },
    forensics: {
      label: 'Forensics',
      blurb: 'Memory dumps, packet captures, file carving, malware triage.',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    },
    ai: {
      label: 'AI / LLM Security',
      blurb: 'Prompt injection, indirect injection, training data extraction, tool abuse.',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
    },
    misc: {
      label: 'Miscellaneous',
      blurb: 'OSINT, steganography, esoteric, anything else worth a flag.',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
    },
  };

  const CHECK_SVG = `<svg class="ctf-solved-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  // ---------- Stat strip ----------
  function animateNum(el, target, dur = 900) {
    if (!el || target == null) return;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = String(Math.round(ease(t) * target));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderStatStrip(stats) {
    const row = document.getElementById('statRow');
    if (!row) return;
    if (stats.signedIn) {
      row.innerHTML = `
        <div class="ctf-stat purple">
          <span class="ctf-stat-label">Your score</span>
          <span class="ctf-stat-num counter" id="ssScore">0</span>
          <span class="ctf-stat-foot">CTF points earned</span>
        </div>
        <div class="ctf-stat lime">
          <span class="ctf-stat-label">Solves</span>
          <span class="ctf-stat-num counter" id="ssSolves">0</span>
          <span class="ctf-stat-foot">${escapeHtml(String(totalChallenges))} total available</span>
        </div>
        <div class="ctf-stat">
          <span class="ctf-stat-label">Rank</span>
          <span class="ctf-stat-num" id="ssRank">${stats.solves ? '#' + stats.rank : '—'}</span>
          <span class="ctf-stat-foot">${stats.firstBloods ? stats.firstBloods + ' first-blood' + (stats.firstBloods === 1 ? '' : 's') : 'No first bloods yet'}</span>
        </div>
        <div class="ctf-stat">
          <span class="ctf-stat-label">Streak</span>
          <span class="ctf-stat-num" id="ssStreak">${stats.streak || 0}<span style="font-size:0.95rem; color:var(--text-muted); font-weight:500; margin-left:4px;">d</span></span>
          <span class="ctf-stat-foot">${stats.streak ? '🔥 Keep it up' : 'Start a streak today'}</span>
        </div>`;
      animateNum(document.getElementById('ssScore'),  stats.score);
      animateNum(document.getElementById('ssSolves'), stats.solves);
    } else {
      row.innerHTML = `
        <div class="ctf-stat purple">
          <span class="ctf-stat-label">Challenges</span>
          <span class="ctf-stat-num counter" id="ssTotal">0</span>
          <span class="ctf-stat-foot">Original, hand-built</span>
        </div>
        <div class="ctf-stat">
          <span class="ctf-stat-label">Categories</span>
          <span class="ctf-stat-num counter" id="ssCats">0</span>
          <span class="ctf-stat-foot">Web, AI, pwn, &amp; more</span>
        </div>
        <div class="ctf-stat lime">
          <span class="ctf-stat-label">Total solves</span>
          <span class="ctf-stat-num counter" id="ssAggSolves">0</span>
          <span class="ctf-stat-foot">By the community</span>
        </div>
        <div class="ctf-stat ctf-stat-cta">
          <a href="/signup?next=${encodeURIComponent('/challenges')}" class="btn btn-primary">Sign up to track →</a>
        </div>`;
      const cats = new Set(all.map((c) => c.category)).size;
      const aggSolves = all.reduce((s, c) => s + (c.solves || 0), 0);
      animateNum(document.getElementById('ssTotal'),     totalChallenges);
      animateNum(document.getElementById('ssCats'),      cats);
      animateNum(document.getElementById('ssAggSolves'), aggSolves);
    }
  }

  // ---------- Cards / sections ----------
  function card(c) {
    const d = (c.difficulty || 'easy').toLowerCase();
    const solved = !!c.solved;
    const cls = `ctf-card${solved ? ' solved' : ''}`;
    return `
      <a class="${cls}" href="/challenges/${escapeHtml(c.slug)}" data-cat="${escapeHtml(c.category)}">
        ${solved ? CHECK_SVG : ''}
        <div class="ctf-card-top">
          <h3 class="ctf-card-title">${escapeHtml(c.title)}</h3>
          <div class="ctf-card-points">${c.points}<span class="pts">pts</span></div>
        </div>
        <div class="ctf-card-foot">
          <span class="ctf-diff" data-d="${escapeHtml(d)}">${escapeHtml(c.difficulty)}</span>
          <span class="ctf-card-solves">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18z"/></svg>
            ${c.solves || 0} solve${c.solves === 1 ? '' : 's'}
          </span>
        </div>
      </a>`;
  }

  function categorySection(catKey, items, totalInCat, solvedInCat) {
    const meta = CATEGORY_META[catKey] || { label: catKey, blurb: '', icon: '' };
    const pct = totalInCat ? Math.round((solvedInCat / totalInCat) * 100) : 0;

    const body = items.length
      ? `<div class="ctf-grid">${items.map(card).join('')}</div>`
      : `<div class="ctf-cat-empty">No challenges in this category match your filters.</div>`;

    return `
      <section class="ctf-cat-section ctf-cat" data-cat="${escapeHtml(catKey)}">
        <div class="ctf-cat-head">
          <div class="ctf-cat-icon">${meta.icon}</div>
          <div>
            <div class="ctf-cat-name">${escapeHtml(meta.label)}</div>
            <div class="dim" style="font-size:0.85rem; color:var(--text-muted); margin-top:1px;">${escapeHtml(meta.blurb)}</div>
          </div>
          <span class="ctf-cat-count">${items.length} of ${totalInCat}</span>
          ${user ? `
            <div class="ctf-cat-progress" title="${solvedInCat} of ${totalInCat} solved">
              <span>${solvedInCat}/${totalInCat}</span>
              <div class="ctf-cat-progress-bar"><div class="ctf-cat-progress-fill" style="width:${pct}%"></div></div>
              <span>${pct}%</span>
            </div>` : ''}
        </div>
        ${body}
      </section>`;
  }

  function flatGrid(items) {
    if (!items.length) return '';
    return `
      <section class="ctf-cat-section">
        <div class="ctf-cat-head">
          <div class="ctf-cat-icon" style="background:var(--ctf-purple-soft); color:var(--ctf-purple);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <div>
            <div class="ctf-cat-name">Search results</div>
            <div class="dim" style="font-size:0.85rem; color:var(--text-muted); margin-top:1px;">Across all categories</div>
          </div>
          <span class="ctf-cat-count">${items.length} match${items.length === 1 ? '' : 'es'}</span>
        </div>
        <div class="ctf-grid">${items.map(card).join('')}</div>
      </section>`;
  }

  function applyFilters(item) {
    if (cat !== 'all'  && item.category !== cat) return false;
    if (diff !== 'all' && item.difficulty !== diff) return false;
    if (status === 'solved'   && !item.solved) return false;
    if (status === 'unsolved' && item.solved)  return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(item.title.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q) ||
            (item.author || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }

  function render() {
    const stack = document.getElementById('categoryStack');
    const empty = document.getElementById('emptyState');
    const meta  = document.getElementById('resultsMeta');
    if (!stack) return;

    const filtered = all.filter(applyFilters);
    const filtersActive = cat !== 'all' || diff !== 'all' || status !== 'all' || !!query;

    meta.textContent = filtersActive
      ? `${filtered.length} of ${all.length} challenge${all.length === 1 ? '' : 's'}`
      : `${all.length} challenge${all.length === 1 ? '' : 's'}`;

    if (!filtered.length) {
      stack.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = `
        <div class="empty">
          <h3>No challenges match</h3>
          <p>Try clearing a filter or searching for something different.</p>
        </div>`;
      return;
    }
    empty.hidden = true;

    // When user is text-searching OR cat is "all" but other filters active → flat grid
    if (query) {
      stack.innerHTML = flatGrid(filtered);
      return;
    }

    // Group by category in predefined order
    const groups = {};
    for (const c of filtered) {
      (groups[c.category] = groups[c.category] || []).push(c);
    }
    // Per-category totals computed against the FULL list (so progress is global, not filtered)
    const totalsByCat   = {};
    const solvedByCat   = {};
    for (const c of all) {
      totalsByCat[c.category]   = (totalsByCat[c.category] || 0) + 1;
      if (c.solved) solvedByCat[c.category] = (solvedByCat[c.category] || 0) + 1;
    }

    const orderedCats = [
      ...CATEGORY_ORDER.filter((k) => groups[k]),
      ...Object.keys(groups).filter((k) => !CATEGORY_ORDER.includes(k)),
    ];
    stack.innerHTML = orderedCats
      .map((k) => categorySection(k, groups[k], totalsByCat[k] || 0, solvedByCat[k] || 0))
      .join('');
  }

  function wireChips(id, set) {
    document.querySelectorAll(`#${id} .chip`).forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll(`#${id} .chip`).forEach((x) => x.classList.toggle('active', x === b));
        set(b.dataset.cat || b.dataset.diff);
        render();
      });
    });
  }

  async function loadLeaderboard() {
    const lb = document.getElementById('lbBox');
    try {
      const data = await window.api.get('/api/challenges/leaderboard/top');
      const rows = data?.leaderboard || [];
      const head = lb.querySelector('.lb-row.head');
      lb.innerHTML = '';
      if (head) lb.appendChild(head);
      if (!rows.length) {
        lb.insertAdjacentHTML('beforeend',
          `<div class="lb-row"><div class="lb-rank">—</div><div class="lb-user muted">No solves yet. Be the first.</div><div class="lb-solves">—</div><div class="lb-score">—</div></div>`);
        return;
      }
      rows.forEach((r, i) => {
        const lvl = r.level || {};
        const isRainbow = lvl.color === 'rainbow';
        const cls = `tier-pill ${isRainbow ? 'tier-rainbow' : ''}`;
        const style = isRainbow ? '' : `style="--tier-c: ${lvl.color};"`;
        const iconHTML = (window.tierIcon && lvl.icon) ? `<span class="tier-icon">${window.tierIcon(lvl.icon)}</span>` : '';
        const tierHTML = lvl.name
          ? `<a href="/levels" class="${cls}" ${style}>${iconHTML} Lv ${(lvl.idx ?? 0) + 1}</a>`
          : '';
        lb.insertAdjacentHTML('beforeend', `
          <div class="lb-row">
            <div class="lb-rank">${String(i + 1).padStart(2, '0')}</div>
            <div class="lb-user" style="display:flex; align-items:center; gap:0.5rem;">
              <a href="/u/${escapeHtml(r.username)}" style="color:var(--text); font-weight:500;">${escapeHtml(r.display_name || r.username)}</a>
              ${tierHTML}
            </div>
            <div class="lb-solves">${r.solves}</div>
            <div class="lb-score">${r.score}</div>
          </div>`);
      });
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wireChips('catChips', (v) => cat = v);

    document.getElementById('diffSelect')?.addEventListener('change', (e) => {
      diff = e.target.value; render();
    });
    document.getElementById('statusSelect')?.addEventListener('change', (e) => {
      status = e.target.value; render();
    });
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
      query = e.target.value.trim(); render();
    });

    // Fetch challenges + (if logged in) dashboard for personal stats.
    try {
      const [chData, me] = await Promise.all([
        window.api.get('/api/challenges'),
        window.api.get('/api/auth/me').catch(() => null),
      ]);
      all = chData.challenges || [];
      totalChallenges = all.length;
      const totalEl = document.getElementById('totalCount');
      if (totalEl) animateNum(totalEl, totalChallenges);

      user = me?.user || null;
      if (user) {
        try {
          const dash = await window.api.get('/api/auth/dashboard');
          renderStatStrip({ signedIn: true, ...dash.stats });
        } catch {
          renderStatStrip({ signedIn: false });
        }
      } else {
        renderStatStrip({ signedIn: false });
      }
      render();
    } catch {
      document.getElementById('categoryStack').innerHTML =
        `<div class="empty"><h3>Could not load challenges</h3><p>The server returned an error.</p></div>`;
    }

    loadLeaderboard();
  });
})();
