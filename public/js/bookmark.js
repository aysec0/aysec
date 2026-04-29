/* Auto-wires bookmark toggle buttons. Drop a button anywhere on a detail
 * page with data-bookmark-kind="course|challenge|post|cheatsheet|event"
 * and data-bookmark-slug="<slug>". The script syncs state on page load
 * and toggles via the /api/bookmarks endpoint when clicked.
 */
(() => {
  const ICON_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  const ICON_ON  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

  function setState(btn, on) {
    btn.dataset.bookmarked = on ? '1' : '0';
    btn.classList.toggle('is-bookmarked', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = btn.querySelector('.bookmark-label');
    const icon  = btn.querySelector('.bookmark-icon');
    if (label) label.textContent = on ? 'Saved' : 'Save';
    if (icon)  icon.innerHTML = on ? ICON_ON : ICON_OFF;
  }

  async function init(btn) {
    const kind = btn.dataset.bookmarkKind;
    const slug = btn.dataset.bookmarkSlug;
    if (!kind || !slug) return;
    if (!btn.querySelector('.bookmark-label')) {
      btn.innerHTML = `<span class="bookmark-icon">${ICON_OFF}</span><span class="bookmark-label">Save</span>`;
    }
    btn.classList.add('bookmark-btn');
    btn.disabled = false;

    try {
      const r = await fetch(`/api/bookmarks/check?kind=${encodeURIComponent(kind)}&slug=${encodeURIComponent(slug)}`,
        { credentials: 'same-origin' });
      if (r.ok) {
        const j = await r.json();
        setState(btn, !!j.bookmarked);
      }
    } catch {}

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const wasOn = btn.dataset.bookmarked === '1';
      setState(btn, !wasOn); // optimistic
      btn.disabled = true;
      try {
        const r = await fetch('/api/bookmarks', {
          method: wasOn ? 'DELETE' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, slug }),
        });
        if (r.status === 401) {
          location.href = '/login?next=' + encodeURIComponent(location.pathname);
          return;
        }
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = await r.json();
        setState(btn, !!j.bookmarked);
        window.toast?.(j.bookmarked ? 'Saved.' : 'Removed.', 'success');
      } catch (err) {
        setState(btn, wasOn); // rollback
        window.toast?.(err.message || 'Could not save', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function scan(root = document) {
    root.querySelectorAll('[data-bookmark-kind][data-bookmark-slug]:not([data-bm-init])')
      .forEach((b) => { b.dataset.bmInit = '1'; init(b); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan());
  } else {
    scan();
  }
  // Re-scan when SPAs would re-render (we don't have one, but cheap insurance)
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });
})();
