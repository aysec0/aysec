/* ============================================================
   Shared layout: navbar + footer injection, theme toggle,
   mobile drawer, active link, footer year, auth nav state,
   notifications bell.
   Loaded on every page after theme.js + api.js.
   ============================================================ */
(() => {
  const NAV_ITEMS = [
    { href: '/',               label: 'Home' },
    { href: '/courses',        label: 'Courses' },
    { href: '/certifications', label: 'Certs' },
    { href: '/challenges',     label: 'CTF' },
    { href: '/daily',          label: 'Daily' },
    { type: 'tools',           label: 'Tools' },
    { href: '/events',         label: 'Events' },
    { href: '/community',      label: 'Community' },
    { href: '/blog',           label: 'Blog' },
  ];

  // Catalog used by the navbar Tools dropdown. Each item links to a panel
  // anchor on /tools (which is the merged lab + OSS-tools page).
  const TOOLS_CATALOG = [
    {
      group: 'Featured',
      items: [
        { name: 'All tools',    href: '/tools',     desc: 'Browse the index' },
        { name: 'OSS projects', href: '/tools#oss', desc: 'jwt-fuzz, recon-pipe, …' },
      ],
    },
    {
      group: 'Crypto',
      items: [
        { name: 'JWT decoder',     href: '/tools/jwt' },
        { name: 'JWT signer / forger', href: '/tools/jwt-sign' },
        { name: 'Hash identifier', href: '/tools/hash-id' },
        { name: 'Hash generator',  href: '/tools/hash-gen' },
        { name: 'HMAC generator',  href: '/tools/hmac' },
        { name: 'X.509 certificate parser', href: '/tools/x509' },
      ],
    },
    {
      group: 'Encoding',
      items: [
        { name: 'Base64',          href: '/tools/base64' },
        { name: 'URL encode / decode', href: '/tools/url' },
        { name: 'Cipher translator', href: '/tools/cipher' },
        { name: 'Strings extractor', href: '/tools/strings' },
        { name: 'File-type identifier', href: '/tools/magic' },
      ],
    },
    {
      group: 'Web',
      items: [
        { name: 'HTTP headers analyzer', href: '/tools/headers' },
        { name: 'Cookie parser',   href: '/tools/cookie' },
        { name: 'User-agent parser', href: '/tools/ua' },
        { name: 'URL splitter',    href: '/tools/url-split' },
        { name: 'Regex tester',    href: '/tools/regex' },
      ],
    },
    {
      group: 'Network',
      items: [
        { name: 'CIDR calculator', href: '/tools/cidr' },
        { name: 'Subnet splitter', href: '/tools/subnet-split' },
      ],
    },
    {
      group: 'Pentest',
      items: [
        { name: 'Reverse shell builder', href: '/tools/revsh' },
      ],
    },
    {
      group: 'Generators',
      items: [
        { name: 'UUID generator',  href: '/tools/uuid' },
        { name: 'Password generator', href: '/tools/password' },
        { name: 'QR code generator', href: '/tools/qr' },
      ],
    },
    {
      group: 'Dev',
      items: [
        { name: 'Unix timestamp',  href: '/tools/timestamp' },
        { name: 'JSON / XML formatter', href: '/tools/format' },
      ],
    },
  ];

  function toolsNavHTML() {
    const groups = TOOLS_CATALOG.map((g) => `
      <div class="tools-dd-group">
        <div class="tools-dd-group-title">${g.group}</div>
        ${g.items.map((it) => `
          <a class="tools-dd-item" href="${it.href}" data-search="${(it.name + ' ' + (it.desc || '')).toLowerCase()}">
            <div class="tools-dd-name">${it.name}</div>
            ${it.desc ? `<div class="tools-dd-desc">${it.desc}</div>` : ''}
          </a>`).join('')}
      </div>
    `).join('');
    return `
      <li class="tools-nav-wrap">
        <button type="button" class="nav-link tools-nav-trigger" id="toolsNavBtn" aria-haspopup="true" aria-expanded="false">Tools</button>
        <div class="tools-dd" id="toolsDd" hidden role="menu" aria-label="Tools">
          <div class="tools-dd-search-wrap">
            <svg class="tools-dd-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="tools-dd-search" id="toolsDdSearch" type="text" placeholder="Search tools…" autocomplete="off" />
          </div>
          <div class="tools-dd-list" id="toolsDdList">${groups}</div>
          <div class="tools-dd-empty" id="toolsDdEmpty" hidden>No tools match.</div>
        </div>
      </li>`;
  }

  const navbarHTML = () => `
    <header class="navbar">
      <div class="container navbar-inner">
        <a href="/" class="brand" aria-label="Home">
          <span class="brand-prompt">~$</span>
          <span>aysec</span>
          <span class="brand-cursor" aria-hidden="true"></span>
        </a>

        <nav aria-label="Primary">
          <ul class="nav-links">
            ${NAV_ITEMS.map((item) => {
              if (item.type === 'tools') return toolsNavHTML();
              return `<li><a class="nav-link" href="${item.href}" data-href="${item.href}">${item.label}</a></li>`;
            }).join('')}
          </ul>
        </nav>

        <div class="nav-actions" style="position:relative;">
          <a class="nav-stat-chip" data-kind="xp" id="navXpChip" href="/levels" hidden>
            <svg class="chip-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12l4 6-10 12L2 9l4-6zm.5 6h11l-2.5-3.5h-6L6.5 9z"/></svg>
            <span id="navXpVal">0</span>
          </a>
          <a class="nav-stat-chip" data-kind="streak" id="navStreakChip" href="/dashboard" hidden>
            <svg class="chip-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/></svg>
            <span id="navStreakVal">0</span>
          </a>
          <span class="nav-stat-divider" id="navStatDivider" hidden></span>

          <div id="bellWrap" hidden style="position:relative;">
            <button class="bell-btn" id="bellBtn" type="button" aria-label="Notifications">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span class="bell-dot" id="bellDot" hidden>0</span>
            </button>
          </div>
          <button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle theme">
            <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            <svg class="icon-sun"  width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          </button>

          <div id="navAvatarWrap" style="position:relative;">
            <button class="nav-avatar-btn" id="navAvatarBtn" type="button" aria-label="Account menu" aria-haspopup="true" aria-expanded="false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </button>
          </div>

          <button class="menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="mobile-backdrop" id="mobileBackdrop" hidden></div>
      <nav class="mobile-nav drawer" id="mobileNav" aria-label="Mobile" aria-hidden="true">
        <div class="mobile-section-title">Learn</div>
        <a class="nav-link" href="/" data-href="/">Home</a>
        <a class="nav-link" href="/courses" data-href="/courses">Courses &amp; paths</a>
        <a class="nav-link" href="/certifications" data-href="/certifications">Cert prep</a>
        <a class="nav-link" href="/challenges" data-href="/challenges">CTF</a>
        <a class="nav-link" href="/blog" data-href="/blog">Blog</a>

        <div class="mobile-section-title">Compete</div>
        <a class="nav-link" href="/daily" data-href="/daily">Daily challenge</a>
        <a class="nav-link" href="/live" data-href="/live">Live events</a>
        <a class="nav-link" href="/pro-labs" data-href="/pro-labs">Pro Labs</a>
        <a class="nav-link" href="/assessments" data-href="/assessments">Skill assessments</a>
        <a class="nav-link" href="/teams" data-href="/teams">Teams</a>

        <div class="mobile-section-title">Tools</div>
        <a class="nav-link" href="/tools" data-href="/tools">Security toolbox</a>
        <a class="nav-link" href="/tools#oss" data-href="/tools">OSS projects</a>
        <a class="nav-link" href="/cheatsheets" data-href="/cheatsheets">Cheatsheets</a>
        <a class="nav-link" href="/events" data-href="/events">Events</a>

        <div class="mobile-section-title">Account</div>
        <a class="nav-link" href="/dashboard" data-href="/dashboard">Dashboard</a>
        <a class="nav-link" href="/levels" data-href="/levels">Levels</a>
        <a class="nav-link" href="/settings" data-href="/settings">Settings</a>

        <div class="mobile-section-title">More</div>
        <a class="nav-link" href="/about" data-href="/about">About</a>
        <a class="nav-link" href="/hire" data-href="/hire">Hire me</a>
      </nav>
    </header>
  `;

  const footerHTML = () => `
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="footer-brand">~$ aysec</div>
            <p class="footer-tagline" data-site="footer_tagline">
              Personal site, CTF platform, and training for people who want to actually
              understand security — not just collect badges.
            </p>
          </div>
          <div>
            <div class="footer-col-title">Learn</div>
            <ul class="footer-links">
              <li><a href="/courses#paths">Learning paths</a></li>
              <li><a href="/courses">Courses</a></li>
              <li><a href="/certifications">Cert prep</a></li>
              <li><a href="/challenges">CTF challenges</a></li>
              <li><a href="/blog">Writeups</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Compete</div>
            <ul class="footer-links">
              <li><a href="/daily">Daily challenge</a></li>
              <li><a href="/live">Live events</a></li>
              <li><a href="/pro-labs">Pro Labs</a></li>
              <li><a href="/assessments">Skill assessments</a></li>
              <li><a href="/teams">Teams</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Account</div>
            <ul class="footer-links">
              <li><a href="/signup">Sign up</a></li>
              <li><a href="/login">Sign in</a></li>
              <li><a href="/dashboard">Dashboard</a></li>
              <li><a href="/settings">Settings</a></li>
              <li><a href="/levels">Levels</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Resources</div>
            <ul class="footer-links">
              <li><a href="/tools">Security toolbox</a></li>
              <li><a href="/tools#oss">OSS projects</a></li>
              <li><a href="/cheatsheets">Cheatsheets</a></li>
              <li><a href="/events">Events calendar</a></li>
              <li><a href="/talks">Talks</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">More</div>
            <ul class="footer-links">
              <li><a href="/about">About</a></li>
              <li><a href="/hire">Hire me</a></li>
              <li><a href="/roadmap">Roadmap</a></li>
              <li><a href="/changelog">Changelog</a></li>
              <li><a href="/rss.xml">RSS</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <div>© <span id="year"></span> Ammar Yasser (aysec) — built with vim and spite.</div>
          <div class="socials">
            <a class="social-link" href="#" aria-label="GitHub">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.4.5 0 5.9 0 12.5c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.2-.1-.3-.6-1.6.1-3.3 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.6 3.3-1.2 3.3-1.2.7 1.7.2 3 .1 3.3.8.9 1.3 2 1.3 3.2 0 4.6-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.8-1.6 8.2-6.1 8.2-11.4C24 5.9 18.6.5 12 .5z"/></svg>
            </a>
            <a class="social-link" href="#" aria-label="Twitter / X">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21l-6.522 7.452L22 22h-6.86l-4.79-6.27L4.8 22H2l7.005-7.99L2 2h7.05l4.31 5.69L18.245 2zm-1.205 18h1.876L7.04 4H5.05l11.989 16z"/></svg>
            </a>
            <a class="social-link" href="#" aria-label="Discord">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.078.037 13.7 13.7 0 0 0-.61 1.249 18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.099.245.198.372.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  `;

  function setActiveLink() {
    const path = location.pathname;
    document.querySelectorAll('.nav-link[data-href]').forEach((a) => {
      const href = a.dataset.href;
      const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
      a.classList.toggle('active', active);
    });
  }

  function wireThemeToggle() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch {}
    });
  }

  function wireMobileDrawer() {
    const btn = document.getElementById('menuBtn');
    const nav = document.getElementById('mobileNav');
    const bd  = document.getElementById('mobileBackdrop');
    if (!btn || !nav) return;

    function open()  { nav.classList.add('open');  nav.setAttribute('aria-hidden', 'false'); bd.hidden = false; requestAnimationFrame(() => bd.classList.add('show')); btn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; }
    function close() { nav.classList.remove('open'); nav.setAttribute('aria-hidden', 'true');  bd.classList.remove('show'); setTimeout(() => { bd.hidden = true; }, 250); btn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
    function toggle() { nav.classList.contains('open') ? close() : open(); }

    btn.addEventListener('click', toggle);
    bd.addEventListener('click', close);
    nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) close(); });
  }

  // ---- Tools dropdown (navbar) ----
  function wireToolsDropdown() {
    const btn   = document.getElementById('toolsNavBtn');
    const panel = document.getElementById('toolsDd');
    const input = document.getElementById('toolsDdSearch');
    const list  = document.getElementById('toolsDdList');
    const empty = document.getElementById('toolsDdEmpty');
    if (!btn || !panel || !input || !list) return;

    let open = false;
    function setOpen(v) {
      open = v;
      panel.hidden = !v;
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      btn.classList.toggle('is-open', v);
      if (v) {
        // close any other floating popover (Ask FAB, avatar dropdown)
        document.dispatchEvent(new CustomEvent('aysec:popover-open', { detail: { id: 'tools' } }));
        // reset filter on open
        input.value = '';
        applyFilter('');
        // first match highlight cleared
        clearHighlight();
        setTimeout(() => input.focus(), 0);
      }
    }

    // Close the dropdown if another popover opens
    document.addEventListener('aysec:popover-open', (e) => {
      if (e.detail?.id !== 'tools' && open) setOpen(false);
    });

    function clearHighlight() {
      list.querySelectorAll('.tools-dd-item.is-first').forEach((n) => n.classList.remove('is-first'));
    }

    function applyFilter(qRaw) {
      const q = qRaw.trim().toLowerCase();
      const items  = list.querySelectorAll('.tools-dd-item');
      const groups = list.querySelectorAll('.tools-dd-group');
      let firstMatch = null;
      let visibleCount = 0;
      items.forEach((it) => {
        const hay = it.dataset.search || '';
        const match = !q || hay.includes(q);
        it.hidden = !match;
        if (match) {
          visibleCount++;
          if (!firstMatch) firstMatch = it;
        }
      });
      // Hide a group header if all its items are hidden
      groups.forEach((g) => {
        const visible = g.querySelectorAll('.tools-dd-item:not([hidden])').length;
        g.hidden = visible === 0;
      });
      clearHighlight();
      if (q && firstMatch) firstMatch.classList.add('is-first');
      empty.hidden = visibleCount > 0;
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!open);
    });

    input.addEventListener('input', () => applyFilter(input.value));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = list.querySelector('.tools-dd-item:not([hidden])');
        if (first) {
          window.location.href = first.getAttribute('href');
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
        btn.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!open) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    });
  }


  // ---- Notifications bell ----
  const NOTIF_ICONS = {
    achievement: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="15" r="6"/><polyline points="9 17.5 9 22 12 20 15 22 15 17.5"/></svg>',
    level_up:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    cert:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88"/></svg>',
    first_blood: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 19h20l-2-9-5 4-5-8-5 8-5-4-2 9zm0 2h20v2H2v-2z"/></svg>',
    welcome:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    tip:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  function relTime(s) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + 'Z').getTime();
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)        return 'just now';
    if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  let notifPanelOpen = false;

  async function loadNotifications() {
    try {
      const data = await window.api.get('/api/notifications');
      const dot = document.getElementById('bellDot');
      if (dot) {
        dot.hidden = data.unread === 0;
        dot.textContent = data.unread > 9 ? '9+' : String(data.unread);
      }
      return data;
    } catch { return null; }
  }

  function renderNotifPanel(data) {
    const wrap = document.getElementById('bellWrap');
    let panel = document.getElementById('notifPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'notifPanel';
      panel.className = 'notif-panel';
      wrap.appendChild(panel);
    }
    const items = data?.notifications || [];
    panel.innerHTML = `
      <div class="notif-head">
        <span class="notif-head-title">Notifications</span>
        ${items.some((n) => !n.read_at) ? `<button class="quiz-link" id="notifReadAll">mark all read</button>` : ''}
      </div>
      <div class="notif-list">
        ${items.length ? items.map((n) => `
          <a class="notif-item ${n.read_at ? '' : 'unread'}" href="${n.link || '#'}" data-kind="${n.kind}" data-id="${n.id}">
            <span class="notif-item-icon">${NOTIF_ICONS[n.kind] || NOTIF_ICONS.tip}</span>
            <div>
              <div class="notif-item-title">${escapeHtml(n.title)}</div>
              ${n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : ''}
              <div class="notif-item-when">${escapeHtml(relTime(n.created_at))}</div>
            </div>
          </a>`).join('') : `<div class="notif-empty">No notifications yet.<br/><span class="dim" style="font-size:0.82rem;">Solve a challenge or finish a course to start earning them.</span></div>`}
      </div>`;
    panel.querySelector('#notifReadAll')?.addEventListener('click', async () => {
      await window.api.post('/api/notifications/read');
      const fresh = await loadNotifications();
      renderNotifPanel(fresh);
    });
    panel.querySelectorAll('.notif-item').forEach((it) => {
      it.addEventListener('click', async () => {
        if (!it.classList.contains('unread')) return;
        await window.api.post('/api/notifications/read', { id: Number(it.dataset.id) });
        loadNotifications();
      });
    });
  }

  function wireBell() {
    const wrap = document.getElementById('bellWrap');
    const btn = document.getElementById('bellBtn');
    if (!btn || !wrap) return;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      notifPanelOpen = !notifPanelOpen;
      if (notifPanelOpen) {
        const data = await loadNotifications();
        renderNotifPanel(data);
      } else {
        document.getElementById('notifPanel')?.remove();
      }
    });
    document.addEventListener('click', (e) => {
      if (notifPanelOpen && !wrap.contains(e.target)) {
        notifPanelOpen = false;
        document.getElementById('notifPanel')?.remove();
      }
    });

    // Real-time push via SSE — replaces the per-page poll for signed-in users.
    // Reconnect with backoff if the stream drops; toast on each new event.
    if ('EventSource' in window) subscribeNotificationsStream();
  }

  let _es = null;
  let _esBackoff = 1500;
  function subscribeNotificationsStream() {
    if (_es) return;
    try { _es = new EventSource('/api/notifications/stream'); }
    catch { return; }
    _es.addEventListener('open', () => { _esBackoff = 1500; });
    _es.addEventListener('message', (ev) => {
      try {
        const n = JSON.parse(ev.data);
        // Bump bell count + flash the bell briefly
        const dot = document.getElementById('bellDot');
        if (dot) {
          dot.hidden = false;
          dot.textContent = String((Number(dot.textContent) || 0) + 1);
        }
        document.getElementById('bellBtn')?.classList.add('is-pinged');
        setTimeout(() => document.getElementById('bellBtn')?.classList.remove('is-pinged'), 1400);
        // Subtle toast — uses existing window.toast if present
        if (n?.title) window.toast?.(n.title, 'info');
        // If panel is open, refresh it
        if (notifPanelOpen) loadNotifications().then(renderNotifPanel);
      } catch {}
    });
    _es.addEventListener('error', () => {
      _es?.close();
      _es = null;
      // Retry with exponential backoff up to 30s
      const wait = Math.min(_esBackoff, 30000);
      _esBackoff = Math.min(_esBackoff * 2, 30000);
      setTimeout(subscribeNotificationsStream, wait);
    });
  }

  // ---- Avatar dropdown ----
  function initialsOf(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
      .map((s) => s[0]).join('').toUpperCase();
  }
  function renderAvatarInto(el, user) {
    const av = user?.avatar_url;
    const isUrl = typeof av === 'string' && /^https?:\/\//.test(av);
    const isEmoji = typeof av === 'string' && av && av.length <= 8 && !isUrl;
    el.classList.toggle('has-emoji', isEmoji);
    if (isUrl) {
      el.innerHTML = `<img src="${escapeHtml(av)}" alt="" loading="lazy" />`;
    } else if (isEmoji) {
      el.textContent = av;
    } else {
      el.textContent = initialsOf(user?.display_name || user?.username);
    }
  }

  const NAV_DD_ICONS = {
    profile:  '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    dashboard:'<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    levels:   '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    badges:   '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="15" r="6"/><polyline points="9 17.5 9 22 12 20 15 22 15 17.5"/></svg>',
    saved:    '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    cert:     '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88"/></svg>',
    settings: '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    lab:      '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 2v6m6-6v6M3 8h18M5 8v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/></svg>',
    cheats:   '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    discord:  '<svg class="item-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.078.037 13.7 13.7 0 0 0-.61 1.249 18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.099.245.198.372.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
    moon:     '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    logout:   '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  };

  let navDdOpen = false;

  // Listen for global popover-open events to close the avatar dropdown
  // when Tools / Ask FAB / etc. open.
  document.addEventListener('aysec:popover-open', (e) => {
    if (e.detail?.id !== 'avatar' && navDdOpen) closeNavDd();
  });

  function renderTierPill(level) {
    if (!level || !level.current) return '';
    const isRainbow = level.current.color === 'rainbow';
    const cls = `tier-pill ${isRainbow ? 'tier-rainbow' : ''}`;
    const style = isRainbow ? '' : `style="--tier-c: ${level.current.color};"`;
    return `<span class="${cls}" ${style}>Lv ${level.level_idx + 1}</span>`;
  }

  // Icons for the signed-out dropdown
  const NAV_DD_ICONS_OUT = {
    signin:   '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    signup:   '<svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
  };

  function buildNavDropdownSignedIn(user, level) {
    const handle = '@' + user.username;
    const name = user.display_name || user.username;
    return `
      <div class="nav-dropdown" id="navDropdown" role="menu">
        <a class="nav-dropdown-head" href="/u/${escapeHtml(user.username)}">
          <div class="nav-dd-avatar" id="navDdAvatar"></div>
          <div style="min-width:0;">
            <div class="nav-dd-name">${escapeHtml(name)}</div>
            <div class="nav-dd-handle">${escapeHtml(handle)} ${renderTierPill(level)}</div>
          </div>
        </a>
        <div class="nav-dropdown-body">
          <a class="nav-dd-item" href="/u/${escapeHtml(user.username)}">${NAV_DD_ICONS.profile}<span>View profile</span></a>
          <a class="nav-dd-item" href="/dashboard">${NAV_DD_ICONS.dashboard}<span>Dashboard</span></a>
          <a class="nav-dd-item" href="/levels">${NAV_DD_ICONS.levels}<span>Levels &amp; XP</span><span class="item-aux">${level ? 'Lv ' + (level.level_idx + 1) : ''}</span></a>
          <a class="nav-dd-item" href="/dashboard#achievementsGrid">${NAV_DD_ICONS.badges}<span>Badges</span></a>
          <a class="nav-dd-item" href="/dashboard#certsSection">${NAV_DD_ICONS.cert}<span>Certificates</span></a>
          <a class="nav-dd-item" href="/dashboard">${NAV_DD_ICONS.saved}<span>Saved items</span></a>
          <div class="nav-dd-divider"></div>
          <a class="nav-dd-item" href="/lab">${NAV_DD_ICONS.lab}<span>Security lab</span></a>
          <a class="nav-dd-item" href="/cheatsheets">${NAV_DD_ICONS.cheats}<span>Cheatsheets</span></a>
          <a class="nav-dd-item" href="/community">${NAV_DD_ICONS.discord}<span>Community</span></a>
          <div class="nav-dd-divider"></div>
          <a class="nav-dd-item" href="/settings">${NAV_DD_ICONS.settings}<span>Settings</span></a>
          ${user.role === 'admin' ? `<a class="nav-dd-item" href="/admin">${NAV_DD_ICONS.settings}<span>Admin panel</span></a>` : ''}
          <div class="nav-dd-divider"></div>
          <button class="nav-dd-item danger" id="navDdLogout" type="button">${NAV_DD_ICONS.logout}<span>Sign out</span></button>
        </div>
      </div>`;
  }

  function buildNavDropdownSignedOut() {
    const next = encodeURIComponent(location.pathname + location.search);
    return `
      <div class="nav-dropdown" id="navDropdown" role="menu">
        <div class="nav-dropdown-head" style="cursor:default;">
          <div class="nav-dd-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div style="min-width:0;">
            <div class="nav-dd-name">Welcome</div>
            <div class="nav-dd-handle">sign in or create an account to track progress</div>
          </div>
        </div>
        <div class="nav-dropdown-body">
          <a class="nav-dd-item" href="/login?next=${next}">${NAV_DD_ICONS_OUT.signin}<span>Sign in</span></a>
          <a class="nav-dd-item" href="/signup?next=${next}" style="color:var(--accent);">${NAV_DD_ICONS_OUT.signup}<span>Create free account</span></a>
          <div class="nav-dd-divider"></div>
          <a class="nav-dd-item" href="/lab">${NAV_DD_ICONS.lab}<span>Security lab</span></a>
          <a class="nav-dd-item" href="/cheatsheets">${NAV_DD_ICONS.cheats}<span>Cheatsheets</span></a>
          <a class="nav-dd-item" href="/community">${NAV_DD_ICONS.discord}<span>Community</span></a>
          <a class="nav-dd-item" href="/levels">${NAV_DD_ICONS.levels}<span>Levels &amp; XP</span></a>
        </div>
      </div>`;
  }

  function openNavDd(user, level) {
    if (navDdOpen) return;
    // close any other popover
    document.dispatchEvent(new CustomEvent('aysec:popover-open', { detail: { id: 'avatar' } }));
    const wrap = document.getElementById('navAvatarWrap');
    const btn  = document.getElementById('navAvatarBtn');
    if (!wrap) return;
    const html = user
      ? buildNavDropdownSignedIn(user, level)
      : buildNavDropdownSignedOut();
    wrap.insertAdjacentHTML('beforeend', html);
    btn.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    navDdOpen = true;

    if (user) {
      const ddAv = document.getElementById('navDdAvatar');
      if (ddAv) renderAvatarInto(ddAv, user);
    }

    document.getElementById('navDdLogout')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
    });
  }

  function closeNavDd() {
    if (!navDdOpen) return;
    document.getElementById('navDropdown')?.remove();
    document.getElementById('navAvatarBtn')?.classList.remove('is-open');
    document.getElementById('navAvatarBtn')?.setAttribute('aria-expanded', 'false');
    navDdOpen = false;
  }

  function wireAvatarDd(user, getLevel) {
    const wrap = document.getElementById('navAvatarWrap');
    const btn  = document.getElementById('navAvatarBtn');
    if (!btn || !wrap) return;
    renderAvatarInto(btn, user);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navDdOpen ? closeNavDd() : openNavDd(user, getLevel());
    });
    document.addEventListener('click', (e) => {
      if (navDdOpen && !wrap.contains(e.target)) closeNavDd();
    });
    document.addEventListener('keydown', (e) => {
      if (navDdOpen && e.key === 'Escape') closeNavDd();
    });
  }

  // ---- Stats chips (XP + streak) ----
  let cachedLevel = null;
  async function loadNavStats() {
    try {
      const dash = await window.api.get('/api/auth/dashboard');
      const score = dash?.stats?.score || 0;
      const streak = dash?.stats?.streak || 0;
      cachedLevel = dash?.level || null;

      const xpChip = document.getElementById('navXpChip');
      const xpVal  = document.getElementById('navXpVal');
      if (xpChip && xpVal) {
        xpChip.hidden = false;
        xpVal.textContent = score >= 1000 ? (score / 1000).toFixed(1) + 'k' : String(score);
        if (cachedLevel?.current?.color && cachedLevel.current.color !== 'rainbow') {
          xpChip.style.setProperty('--chip-c', cachedLevel.current.color);
        }
      }
      const stChip = document.getElementById('navStreakChip');
      const stVal  = document.getElementById('navStreakVal');
      if (stChip && stVal) {
        stChip.hidden = false;
        stVal.textContent = String(streak);
        stChip.toggleAttribute('data-empty', streak === 0);
      }
      const div = document.getElementById('navStatDivider');
      if (div) div.hidden = false;
    } catch {}
  }

  async function syncAuthNav() {
    const data = await window.api.get('/api/auth/me').catch(() => null);
    const bellWrap = document.getElementById('bellWrap');
    const avWrap   = document.getElementById('navAvatarWrap');
    const btn      = document.getElementById('navAvatarBtn');
    if (!btn) return;

    if (data?.user) {
      // Signed in — render their avatar, show stats + bell, full dropdown
      renderAvatarInto(btn, data.user);
      // Re-bind: clicking should open the signed-in dropdown
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      renderAvatarInto(fresh, data.user);
      fresh.addEventListener('click', (e) => {
        e.stopPropagation();
        navDdOpen ? closeNavDd() : openNavDd(data.user, cachedLevel);
      });
      document.addEventListener('click', (e) => {
        if (navDdOpen && !avWrap.contains(e.target)) closeNavDd();
      });
      document.addEventListener('keydown', (e) => {
        if (navDdOpen && e.key === 'Escape') closeNavDd();
      });

      if (bellWrap) {
        bellWrap.hidden = false;
        wireBell();
        loadNotifications();
        setInterval(loadNotifications, 60_000);
      }
      loadNavStats();
    } else {
      // Signed out — keep the avatar (silhouette) and dropdown leads to sign-in/sign-up
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navDdOpen ? closeNavDd() : openNavDd(null, null);
      });
      document.addEventListener('click', (e) => {
        if (navDdOpen && !avWrap.contains(e.target)) closeNavDd();
      });
      document.addEventListener('keydown', (e) => {
        if (navDdOpen && e.key === 'Escape') closeNavDd();
      });
    }
  }

  function setYear() {
    const y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function reveal() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    const vh = window.innerHeight;
    // Bail out to force-visible if IO is unsupported OR the viewport has no
    // height (some embed contexts report 0). Either way, the fade-in isn't
    // worth leaving the page invisible.
    if (!('IntersectionObserver' in window) || !vh) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    // Reveal anything already on screen at first paint — prevents tall
    // sections (e.g. /tools) from being stuck invisible when 0.01 of the
    // element exceeds the visible portion of the viewport.
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add('is-visible');
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.01, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => {
      if (!el.classList.contains('is-visible')) io.observe(el);
    });
  }

  function mount() {
    const navMount = document.getElementById('navbar-mount');
    if (navMount) navMount.outerHTML = navbarHTML();
    const footMount = document.getElementById('footer-mount');
    if (footMount) footMount.outerHTML = footerHTML();

    setActiveLink();
    wireThemeToggle();
    wireMobileDrawer();
    wireToolsDropdown();
    setYear();
    syncAuthNav();
    reveal();
    loadAskFab();
    wireHoverPrefetch();
    applySiteSettings();
  }

  // Apply admin-edited site settings to any [data-site*] attributes on the
  // current page. Used to live in main.js (homepage only); now runs on every
  // page so /about, /hire, etc. all stay in sync with the visual editor.
  async function applySiteSettings() {
    if (!window.api) return;
    try {
      const r = await window.api.get('/api/site-settings');
      const s = r.settings || {};
      document.querySelectorAll('[data-site]').forEach((el) => {
        const k = el.dataset.site;
        if (s[k] != null && s[k] !== '') el.textContent = s[k];
      });
      document.querySelectorAll('[data-site-href]').forEach((a) => {
        const k = a.dataset.siteHref;
        if (s[k]) a.setAttribute('href', s[k]);
      });
      document.querySelectorAll('[data-site-toggle]').forEach((el) => {
        const k = el.dataset.siteToggle;
        const v = s[k];
        if (v != null && (v === '0' || v === 'false' || v === false)) {
          el.style.display = 'none';
        }
      });
    } catch {}
  }

  // ---- Hover-prefetch: when the user moves over an internal link, fire a
  // prefetch so the click feels instant. ~20% latency on a fast network,
  // but the perceived snap is the win. Skips already-prefetched URLs,
  // hash-only links, and external destinations.
  function wireHoverPrefetch() {
    if (!('IntersectionObserver' in window)) return;
    const seen = new Set();
    function prefetch(href) {
      if (!href || seen.has(href)) return;
      seen.add(href);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'document';
      document.head.appendChild(link);
    }
    function shouldPrefetch(a) {
      if (!a || a.target === '_blank') return null;
      const u = a.getAttribute('href');
      if (!u || u.startsWith('#') || u.startsWith('mailto:') || u.startsWith('tel:')) return null;
      if (/^https?:/i.test(u) && !u.startsWith(location.origin)) return null;
      const parsed = new URL(u, location.href);
      // Don't prefetch /api/* (would 404 the link doc + waste bandwidth)
      // and don't prefetch endpoints whose response is large or unique-per-id
      // (resume / card SVG / certificate verifier).
      if (/^\/api\//.test(parsed.pathname)) return null;
      if (/^\/(resume|cert)\//.test(parsed.pathname)) return null;
      if (/\/card\.svg$/.test(parsed.pathname)) return null;
      return parsed.pathname + parsed.search;
    }
    document.addEventListener('mouseover', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      const href = shouldPrefetch(a);
      if (href) prefetch(href);
    }, { passive: true });
    // Touch devices: prefetch on touchstart since hover doesn't fire
    document.addEventListener('touchstart', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      const href = shouldPrefetch(a);
      if (href) prefetch(href);
    }, { passive: true });
  }

  // Load /js/editor-bridge.js when the page is rendered inside the visual
  // editor's iframe (URL has ?_edit=1). The bridge handles its own no-op
  // cases so importing it on non-edit pages is safe.
  if (new URLSearchParams(location.search).has('_edit') && window.top !== window.self) {
    const s = document.createElement('script');
    s.src = '/js/editor-bridge.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  // Inject the floating "Ask aysec" widget on every page (its own script
  // suppresses itself on /ask). Keeping it as a deferred load means
  // pages that already include /js/ask-fab.js explicitly won't double-load.
  function loadAskFab() {
    if (location.pathname === '/ask' || location.pathname.startsWith('/ask/')) return;
    if (document.getElementById('askFab') || document.querySelector('script[data-ask-fab]')) return;
    const s = document.createElement('script');
    s.src = '/js/ask-fab.js';
    s.dataset.askFab = '1';
    s.defer = true;
    document.body.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
