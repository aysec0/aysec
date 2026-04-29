/* ============================================================
   Motion system — the layer of polish that separates "nice site"
   from "expensive-feeling site". Five small primitives, each
   opt-in via a data attribute so nothing fires unless you ask.

     [data-reveal]            — already wired in layout.js (fade + 10px slide-up)
     [data-reveal-up|left|    — direction variants of the same fade-and-translate
       right|scale|blur]
     [data-stagger]           — a parent. its [data-reveal*] children animate
                                cascaded, 60ms between siblings
     [data-tilt]              — element rotates a few degrees following the cursor
     [data-magnetic]          — element pulls toward the cursor inside a soft radius
     [data-count-to="<num>"]  — counts from 0 → num when the element scrolls into view
     [data-marquee]           — horizontally scrolls its children in a loop

   Every primitive checks `prefers-reduced-motion` and bails out
   to the static state if the user opted out.
   ============================================================ */
(() => {
  if (window.__motionMounted) return;
  window.__motionMounted = true;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Reveal variants + stagger -----------------------------------------
     Adds class .is-visible to any [data-reveal*] element when it scrolls
     into view. If a parent has [data-stagger], each child's transition is
     delayed by 60ms × index so they cascade. */
  function wireRevealVariants() {
    const els = document.querySelectorAll(
      '[data-reveal-up], [data-reveal-left], [data-reveal-right], [data-reveal-scale], [data-reveal-blur]'
    );
    if (!els.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    // Pre-show anything already on screen so a tall hero doesn't sit invisible
    const vh = window.innerHeight;
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
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

    els.forEach((el) => {
      if (!el.classList.contains('is-visible')) io.observe(el);
    });
  }

  function wireStagger() {
    document.querySelectorAll('[data-stagger]').forEach((parent) => {
      const step = parseFloat(parent.dataset.stagger) || 60;     // ms between siblings
      const max  = 12;                                            // cap so a 30-card grid doesn't take 2s
      const children = parent.querySelectorAll(
        ':scope > [data-reveal], :scope > [data-reveal-up], :scope > [data-reveal-left], ' +
        ':scope > [data-reveal-right], :scope > [data-reveal-scale], :scope > [data-reveal-blur]'
      );
      children.forEach((child, i) => {
        child.style.transitionDelay = `${Math.min(i, max) * step}ms`;
      });
    });
  }

  /* ---- Tilt -------------------------------------------------------------
     3D rotation following the cursor inside the bounding box. Uses
     CSS variables so the keyframe is purely transform — GPU-fast.
     Pivots back to neutral on mouseleave. */
  function wireTilt() {
    if (reduceMotion) return;
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      const max = parseFloat(el.dataset.tilt) || 8;     // degrees
      let raf = 0;
      function onMove(e) {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width  - 0.5; // -0.5 .. +0.5
        const y = (e.clientY - r.top)  / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.setProperty('--tilt-x', `${(-y * max).toFixed(2)}deg`);
          el.style.setProperty('--tilt-y', `${( x * max).toFixed(2)}deg`);
          // Glare hint: a CSS pseudo can paint a soft highlight at the cursor
          el.style.setProperty('--tilt-px', `${((x + 0.5) * 100).toFixed(0)}%`);
          el.style.setProperty('--tilt-py', `${((y + 0.5) * 100).toFixed(0)}%`);
        });
      }
      function onLeave() {
        cancelAnimationFrame(raf);
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
      }
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
    });
  }

  /* ---- Magnetic ---------------------------------------------------------
     Element drifts toward the cursor when it's inside the soft radius.
     Reads max-strength from data-magnetic="<px>" (default 8px). */
  function wireMagnetic() {
    if (reduceMotion) return;
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const max = parseFloat(el.dataset.magnetic) || 8;
      let raf = 0;
      function onMove(e) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          // Apply ~30% of the offset, capped at `max` px
          const x = Math.max(-max, Math.min(max, dx * 0.3));
          const y = Math.max(-max, Math.min(max, dy * 0.3));
          el.style.setProperty('--mag-x', `${x.toFixed(1)}px`);
          el.style.setProperty('--mag-y', `${y.toFixed(1)}px`);
        });
      }
      function onLeave() {
        cancelAnimationFrame(raf);
        el.style.setProperty('--mag-x', '0px');
        el.style.setProperty('--mag-y', '0px');
      }
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
    });
  }

  /* ---- Count-up ---------------------------------------------------------
     [data-count-to="42"] starts at 0 and animates to 42 over ~1100ms when
     the element scrolls into view. Easing is smoothstep — fast then slow. */
  function wireCountUp() {
    const els = document.querySelectorAll('[data-count-to]');
    if (!els.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach((el) => { el.textContent = el.dataset.countTo; });
      return;
    }
    function animate(el) {
      const target = parseFloat(el.dataset.countTo) || 0;
      const dur = parseFloat(el.dataset.countDuration) || 1100;
      const start = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start) / dur);
        const eased = t * t * (3 - 2 * t); // smoothstep
        const val = target * eased;
        // Preserve integer formatting if the target is a whole number
        el.textContent = Number.isInteger(target)
          ? Math.round(val).toLocaleString()
          : val.toFixed(1);
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animate(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  }

  /* ---- Marquee ----------------------------------------------------------
     [data-marquee] — children scroll horizontally in an infinite loop.
     We duplicate the content once and animate the inner track so the
     scroll loops seamlessly. Speed is `data-marquee-speed="40"` (s). */
  function wireMarquee() {
    if (reduceMotion) return;
    document.querySelectorAll('[data-marquee]:not([data-marquee-mounted])').forEach((host) => {
      host.dataset.marqueeMounted = '1';
      const speed = parseFloat(host.dataset.marqueeSpeed) || 40;
      // Wrap original content + a duplicated copy in a flex track
      const original = host.innerHTML;
      host.innerHTML = `<div class="marquee-track" style="animation-duration:${speed}s">
        <div class="marquee-group">${original}</div>
        <div class="marquee-group" aria-hidden="true">${original}</div>
      </div>`;
    });
  }

  /* ---- Auto-instrument ---------------------------------------------------
     Free polish: any `.grid > .card` below the fold gets a reveal-up, and
     its parent grid becomes a stagger container. Cards already on screen
     are left alone so they don't flash. Opt-out via [data-no-motion] on
     either the grid or the card. */
  function autoInstrument() {
    const vh = window.innerHeight;
    document.querySelectorAll('.grid:not([data-no-motion])').forEach((grid) => {
      if (!grid.hasAttribute('data-stagger')) grid.setAttribute('data-stagger', '60');
      grid.querySelectorAll(':scope > .card').forEach((card) => {
        if (card.hasAttribute('data-no-motion')) return;
        if (card.hasAttribute('data-reveal-up') || card.hasAttribute('data-reveal')) return;
        if (card.classList.contains('is-visible')) return;
        const r = card.getBoundingClientRect();
        // Only instrument cards below the visible fold — anything already
        // on screen stays static so the user doesn't see a flash on load.
        if (r.top >= vh - 40) {
          card.setAttribute('data-reveal-up', '');
        }
      });
    });
  }

  /* ---- Boot -------------------------------------------------------------
     Runs once on DOM ready, then re-runs on MutationObserver hits so
     dynamically rendered content (admin lists, dashboard widgets, etc.)
     also picks up the motion contracts without manual rewiring. */
  function boot() {
    autoInstrument();      // tag below-fold grid cards before reveal scan
    wireRevealVariants();
    wireStagger();
    wireTilt();
    wireMagnetic();
    wireCountUp();
    wireMarquee();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Watch for late-rendered content (cards loaded from /api/* etc.)
  const mo = new MutationObserver((mutations) => {
    let needsRescan = false;
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('[data-reveal-up], [data-reveal-left], [data-reveal-right], [data-reveal-scale], [data-reveal-blur], [data-tilt], [data-magnetic], [data-count-to], [data-stagger], [data-marquee]')
            || n.querySelector?.('[data-reveal-up], [data-reveal-left], [data-reveal-right], [data-reveal-scale], [data-reveal-blur], [data-tilt], [data-magnetic], [data-count-to], [data-stagger], [data-marquee]')) {
          needsRescan = true;
          break;
        }
      }
      if (needsRescan) break;
    }
    if (needsRescan) boot();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
