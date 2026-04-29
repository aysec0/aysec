/* ============================================================
   Page transition — Accenture-style horizontal slide + dim.

   On click of a same-origin link:
     1. Current page body slides slightly left + fades to ~50%
     2. A dark overlay fades in (covers the browser's white flash
        between the request and the new page paint)
     3. After ~280ms, real navigation fires — browser loads the
        new HTML
     4. On DOMContentLoaded of the new page, body slides in from
        the right + fades up to opacity 1 (the overlay sits under
        a fresh class that fades it back out)

   Single fixed overlay div. Same-page anchor links and external
   URLs are left alone. Modifier-clicks (cmd/ctrl/middle-click)
   open in a new tab as usual without triggering the transition.
   `prefers-reduced-motion: reduce` disables the whole thing.
   ============================================================ */
(() => {
  if (window.__pageTransitionMounted) return;
  window.__pageTransitionMounted = true;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const OUTGOING_MS = 280;
  const INCOMING_MS = 360;

  /* ---- Overlay ----
     Single full-screen dark sheet pinned above everything except
     modals. We intentionally use the site's bg colour so the cross
     between old and new pages reads as a continuous background. */
  function ensureOverlay() {
    let el = document.getElementById('pageTransitionOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pageTransitionOverlay';
      el.className = 'page-transition-overlay';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  /* ---- Click filter ----
     Returns true only if this is a navigation we want to wrap.
     Skips: external origins, modifier-clicks, target=_blank,
     download links, hash-only jumps within the current path,
     and anything explicitly marked data-no-transition. */
  function shouldIntercept(a, e) {
    if (e.defaultPrevented) return false;
    if (e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (!a.href) return false;
    if (a.hasAttribute('download')) return false;
    if (a.dataset.noTransition !== undefined) return false;
    if (a.target && a.target !== '' && a.target !== '_self') return false;
    let url;
    try { url = new URL(a.href, location.href); }
    catch { return false; }
    if (url.origin !== location.origin) return false;
    // Pure-hash navigation (smooth-scroll, anchor jump): leave alone
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    // Common asset / mailto / tel / javascript: protocols
    if (!/^https?:$/.test(url.protocol)) return false;
    return true;
  }

  /* ---- Outgoing leg ----
     Apply the leaving class (kicks off the body keyframe) + show
     the overlay, then fire the real navigation after the animation
     has had time to play. The browser's network request runs in
     parallel — by the time the new page is ready, the overlay is
     already covering whatever flash would have happened. */
  let leaving = false;
  function leave(href) {
    if (leaving) return;
    leaving = true;
    if (reduceMotion) { window.location.href = href; return; }

    const overlay = ensureOverlay();
    document.documentElement.classList.add('is-page-leaving');
    // rAF guarantees the browser has committed the initial state
    // before flipping to the dimmed state — otherwise the transition
    // jumps straight to the end with no animation.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('is-shown'));
    });
    setTimeout(() => { window.location.href = href; }, OUTGOING_MS);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a');
    if (!a) return;
    if (!shouldIntercept(a, e)) return;
    e.preventDefault();
    leave(a.href);
  }, true);

  /* ---- Incoming leg ----
     Run on every page that loads this script. The class is
     applied immediately so the body starts off-position; rAF flip
     to "settled" plays the slide-in animation. */
  if (!reduceMotion) {
    document.documentElement.classList.add('is-page-entering');
    function settle() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.remove('is-page-entering');
          document.documentElement.classList.add('is-page-entered');
        });
      });
      // Drop the entered marker after the animation completes so it
      // doesn't sit in the DOM forever
      setTimeout(() => document.documentElement.classList.remove('is-page-entered'), INCOMING_MS + 100);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', settle, { once: true });
    } else {
      settle();
    }
  }

  /* ---- bfcache restore ----
     Hitting the browser's Back button can return us to the page
     in its OLD state — including any leaving classes the previous
     run left attached. Reset everything on pageshow so a back-nav
     doesn't land on a dimmed page. */
  window.addEventListener('pageshow', (e) => {
    leaving = false;
    document.documentElement.classList.remove('is-page-leaving');
    const overlay = document.getElementById('pageTransitionOverlay');
    if (overlay) overlay.classList.remove('is-shown');
    if (e.persisted) {
      // Re-trigger the entering animation on bfcache restore so it
      // matches a regular load
      if (!reduceMotion) {
        document.documentElement.classList.add('is-page-entering');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => document.documentElement.classList.remove('is-page-entering'));
        });
      }
    }
  });
})();
