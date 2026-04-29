/* ============================================================
   Live presence — heartbeat + viewer counter.

   Auto-mounts on any element with [data-presence-scope] +
   [data-presence-id]:

     <div data-presence-scope="challenge" data-presence-id="my-slug"></div>

   The element is filled with a small "X people here right now"
   widget; behind the scenes, this script POSTs a heartbeat every
   25s, refreshes the counter every 15s, and tells the server to
   forget us when the tab closes.
   ============================================================ */
(() => {
  if (window.__presenceMounted) return;
  window.__presenceMounted = true;

  const HEARTBEAT_MS = 25_000;
  const REFRESH_MS   = 15_000;
  const KEY = 'aysec_presence_client_id';

  // Persist a client_id per browser so reloads don't double-count.
  let clientId = null;
  try { clientId = localStorage.getItem(KEY); } catch {}
  if (!clientId) {
    clientId = (crypto.randomUUID?.() || (Date.now() + ':' + Math.random())).toString();
    try { localStorage.setItem(KEY, clientId); } catch {}
  }

  function avatarHTML(u) {
    if (u?.avatar_url) {
      return `<img class="presence-avatar" src="${u.avatar_url}" alt="" loading="lazy" />`;
    }
    const ch = (u?.display_name || u?.username || '?').slice(0, 1).toUpperCase();
    return `<div class="presence-avatar presence-avatar-letter">${ch}</div>`;
  }

  function render(el, data) {
    const { total, visible, anon } = data;
    if (!total) {
      el.innerHTML = `<div class="presence-widget presence-empty">
        <span class="presence-dot"></span>
        <span class="presence-text">You're the first one here.</span>
      </div>`;
      return;
    }
    const stack = (visible || []).map(avatarHTML).join('');
    const noun = total === 1 ? 'person' : 'people';
    const label = total === 1
      ? `1 ${noun} here right now`
      : `${total} ${noun} here right now`;
    const anonLabel = anon > 0 && (visible?.length || 0) < total
      ? ` <span class="presence-anon">+ ${total - (visible?.length || 0)} anon</span>` : '';
    el.innerHTML = `
      <div class="presence-widget">
        <span class="presence-dot is-live"></span>
        <span class="presence-stack">${stack}</span>
        <span class="presence-text">${label}${anonLabel}</span>
      </div>`;
  }

  // Beacon-friendly DELETE so the row is gone the moment the tab closes
  // (we don't have to wait for the 60s stale-prune to elapse).
  function sendLeave(scope, scope_id) {
    try {
      const blob = new Blob(
        [JSON.stringify({ scope, scope_id, client_id: clientId })],
        { type: 'application/json' },
      );
      // navigator.sendBeacon doesn't support DELETE; we fall through to fetch keepalive.
      fetch('/api/presence', { method: 'DELETE', body: blob, headers: { 'Content-Type': 'application/json' }, keepalive: true })
        .catch(() => {});
    } catch {}
  }

  function mount(el) {
    const scope = el.dataset.presenceScope;
    const scope_id = el.dataset.presenceId;
    if (!scope || !scope_id) return;

    el.innerHTML = `<div class="presence-widget presence-loading">
      <span class="presence-dot"></span>
      <span class="presence-text">…</span>
    </div>`;

    let alive = true;
    let hbTimer = null;
    let rfTimer = null;

    async function heartbeat() {
      if (!alive) return;
      try {
        await fetch('/api/presence/heartbeat', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, scope_id, client_id: clientId }),
        });
      } catch {}
    }

    async function refresh() {
      if (!alive) return;
      try {
        const r = await fetch(`/api/presence?scope=${encodeURIComponent(scope)}&scope_id=${encodeURIComponent(scope_id)}`);
        if (r.ok) render(el, await r.json());
      } catch {}
    }

    // First heartbeat fires before the first refresh so we're counted in our
    // own number — otherwise a lone visitor sees "0 people here" for 25s.
    heartbeat().then(refresh);
    hbTimer = setInterval(heartbeat, HEARTBEAT_MS);
    rfTimer = setInterval(refresh,  REFRESH_MS);

    // Pause when the tab goes background — saves heartbeats, lets us drop off
    // organically if the user leaves the laptop open and walks away.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(hbTimer); hbTimer = null;
      } else if (alive && !hbTimer) {
        heartbeat();
        hbTimer = setInterval(heartbeat, HEARTBEAT_MS);
        refresh();
      }
    });

    window.addEventListener('beforeunload', () => {
      alive = false;
      clearInterval(hbTimer);
      clearInterval(rfTimer);
      sendLeave(scope, scope_id);
    });

    window.addEventListener('pagehide', () => sendLeave(scope, scope_id));
  }

  function scan() {
    document.querySelectorAll('[data-presence-scope][data-presence-id]:not([data-presence-mounted])')
      .forEach((el) => {
        el.dataset.presenceMounted = '1';
        mount(el);
      });
  }

  // Mount whatever's already in the DOM, then watch for late-rendered
  // widgets (challenge-detail.js fills the page after fetch).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
