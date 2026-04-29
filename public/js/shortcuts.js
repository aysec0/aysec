/* ============================================================
   Keyboard shortcuts — power-user navigation + help overlay.

   Single keys (when no input is focused):
     ?  open this overlay
     /  open command palette  (handled by cmdk.js)
     t  toggle theme
     b  scroll back to top
     .  open the Ask FAB

   Two-key sequences (g-prefix, GitHub/Linear style):
     g h  → /              go home
     g c  → /challenges    go to CTF
     g d  → /duels         go to duels
     g u  → /community     go to community
     g a  → /dashboard     go to your dashboard
     g s  → /settings      go to settings
     g l  → /levels        go to levels
     g t  → /tools         go to tools
     g v  → /vault         go to the vault
     g w  → /community?cat=writeups  go to writeups

   Inside [data-presence-scope="duel"] etc. nothing fancy is added —
   the original page handlers (Enter to submit a flag, etc.) run as
   usual; we only intercept top-level key events when nothing else
   is consuming them.
   ============================================================ */
(() => {
  if (window.__shortcutsMounted) return;
  window.__shortcutsMounted = true;

  const SECTIONS = [
    {
      title: 'Global',
      rows: [
        { keys: ['?'],            label: 'Show this help' },
        { keys: ['/'],            label: 'Command palette' },
        { keys: ['⌘', 'K'],       label: 'Command palette' },
        { keys: ['t'],            label: 'Toggle dark / light theme' },
        { keys: ['b'],            label: 'Back to top' },
        { keys: ['.'],            label: 'Open the Ask aysec chat' },
      ],
    },
    {
      title: 'Go to…',
      rows: [
        { keys: ['g', 'h'], label: 'Home' },
        { keys: ['g', 'c'], label: 'CTF challenges' },
        { keys: ['g', 'd'], label: 'Duels' },
        { keys: ['g', 'u'], label: 'Community' },
        { keys: ['g', 'w'], label: 'Writeups' },
        { keys: ['g', 'a'], label: 'Your dashboard' },
        { keys: ['g', 'l'], label: 'Levels' },
        { keys: ['g', 't'], label: 'Tools' },
        { keys: ['g', 's'], label: 'Settings' },
        { keys: ['g', 'v'], label: 'The vault' },
      ],
    },
    {
      title: 'On a challenge / duel page',
      rows: [
        { keys: ['Enter'],   label: 'Submit flag (when input is focused)' },
        { keys: ['Esc'],     label: 'Close any open dialog' },
      ],
    },
  ];

  // ---- Overlay --------------------------------------------------------
  let overlayEl = null;
  function buildOverlay() {
    const sectionsHTML = SECTIONS.map((s) => `
      <div class="kbd-section">
        <h3 class="kbd-section-title">${s.title}</h3>
        <div class="kbd-rows">
          ${s.rows.map((r) => `
            <div class="kbd-row">
              <span class="kbd-keys">${r.keys.map((k) => `<kbd>${k}</kbd>`).join(r.keys.length === 2 && r.keys[0] === 'g' ? ' then ' : ' ')}</span>
              <span class="kbd-label">${r.label}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
    const el = document.createElement('div');
    el.className = 'kbd-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Keyboard shortcuts');
    el.innerHTML = `
      <div class="kbd-backdrop" data-close="1"></div>
      <div class="kbd-modal">
        <div class="kbd-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" class="kbd-close" aria-label="Close" data-close="1">×</button>
        </div>
        <div class="kbd-body">${sectionsHTML}</div>
        <div class="kbd-foot">
          <span class="dim">Press <kbd>?</kbd> any time to bring this back.</span>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close="1"]')) close();
    });
    document.body.appendChild(el);
    return el;
  }
  function open() {
    if (overlayEl) return;
    overlayEl = buildOverlay();
    requestAnimationFrame(() => overlayEl.classList.add('is-open'));
    document.documentElement.style.overflow = 'hidden';
    document.dispatchEvent(new CustomEvent('aysec:popover-open', { detail: { id: 'shortcuts' } }));
  }
  function close() {
    if (!overlayEl) return;
    const o = overlayEl;
    overlayEl = null;
    o.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    setTimeout(() => o.remove(), 180);
  }

  // ---- Sequence buffer for `g <x>` ------------------------------------
  let pending = null;        // { ch, expiresAt }
  const SEQ_WINDOW_MS = 1200;

  function isTypingTarget(t) {
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  function go(path) { location.href = path; }

  function handleSequence(ch) {
    if (!pending) return false;
    const map = {
      h: '/', c: '/challenges', d: '/duels', u: '/community',
      w: '/community?cat=writeups',
      a: '/dashboard', l: '/levels', t: '/tools', s: '/settings', v: '/vault',
    };
    if (pending.ch === 'g' && map[ch]) {
      pending = null;
      go(map[ch]);
      return true;
    }
    pending = null;
    return false;
  }

  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave the system shortcuts alone

    // Sequence consumer first
    if (pending && Date.now() < pending.expiresAt) {
      if (e.key.length === 1 && handleSequence(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }
    }
    pending = null;

    // Esc closes overlay if open
    if (e.key === 'Escape' && overlayEl) {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      overlayEl ? close() : open();
      return;
    }

    // Lower-case single-key actions (skip if shift held, e.g. ?)
    const k = e.key.toLowerCase();
    if (k === 'g') {
      pending = { ch: 'g', expiresAt: Date.now() + SEQ_WINDOW_MS };
      e.preventDefault();
      return;
    }
    if (k === 't' && !e.shiftKey) {
      // toggle theme — defer to the existing toggle button if present so theme.js stays in charge
      const btn = document.getElementById('themeToggle');
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
    if (k === 'b' && !e.shiftKey) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (k === '.' && !e.shiftKey) {
      // Open Ask FAB — the FAB script listens for this same key but only
      // when nothing is typing, so we're safe to dispatch a click on its trigger.
      const fab = document.getElementById('askFabBtn');
      if (fab) { e.preventDefault(); fab.click(); }
      return;
    }
  });

  // Click handler for any [data-shortcuts-open] trigger (e.g. footer link)
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-shortcuts-open]');
    if (t) { e.preventDefault(); open(); }
  });
})();
