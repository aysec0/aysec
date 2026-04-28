/* Visual editor bridge — runs inside the iframe of /admin/site-editor.
   Activated when the URL has ?_edit=1. Hovers + selects [data-site]
   elements, talks to the parent via window.postMessage, and applies
   text/href changes the parent sends back. */
(() => {
  if (window.top === window.self) return;                       // not in an iframe
  if (!new URLSearchParams(location.search).has('_edit')) return; // not in edit mode
  if (window.__aysecEditorBridge) return;                       // double-load guard
  window.__aysecEditorBridge = true;

  const HOVER_BORDER = '2px dashed #ffb74d';
  const SEL_BORDER   = '2px solid var(--accent, #5b9cff)';
  const STYLE = `
    [data-site], [data-site-href], [data-site-toggle] { cursor: pointer; outline-offset: 2px; transition: outline-color 0.1s; }
    [data-site]:hover, [data-site-href]:hover, [data-site-toggle]:hover { outline: ${HOVER_BORDER}; }
    .__aysec-edit-selected { outline: ${SEL_BORDER} !important; }
    .__aysec-edit-hidden {
      outline: 2px dashed #888 !important;
      opacity: 0.55;
      position: relative;
    }
    .__aysec-edit-hidden::before {
      content: 'hidden';
      position: absolute; top: 4px; left: 4px;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 10px; padding: 2px 6px; border-radius: 3px;
      background: #888; color: #fff; letter-spacing: 0.05em;
      pointer-events: none;
    }
    .__aysec-edit-tag {
      position: absolute;
      background: var(--accent, #5b9cff);
      color: #fff;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 0 0 4px 4px;
      pointer-events: none;
      z-index: 999999;
      letter-spacing: 0.05em;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  const tag = document.createElement('div');
  tag.className = '__aysec-edit-tag';
  tag.style.display = 'none';
  document.body.appendChild(tag);

  let selected = null;

  function describeEl(el) {
    return {
      siteKey:       el.dataset.site || null,
      siteHrefKey:   el.dataset.siteHref || null,
      siteToggleKey: el.dataset.siteToggle || null,
      tagName:       el.tagName.toLowerCase(),
      classNames:    (el.className || '').toString().slice(0, 80),
      text:          el.textContent.trim().slice(0, 200),
      href:          el.getAttribute('href') || null,
      hidden:        el.style.display === 'none' || el.classList.contains('__aysec-edit-hidden'),
    };
  }

  function positionTag(el) {
    const r = el.getBoundingClientRect();
    tag.style.display = 'block';
    tag.style.top = (r.top + window.scrollY - 18) + 'px';
    tag.style.left = (r.left + window.scrollX) + 'px';
    const k = el.dataset.site || el.dataset.siteHref || el.dataset.siteToggle || '';
    const kind = el.dataset.siteHref ? ' (link)'
               : el.dataset.siteToggle ? ' (visibility)'
               : '';
    tag.textContent = el.tagName.toLowerCase() + (k ? '#' + k : '') + kind;
  }

  function selectEl(el) {
    if (selected) selected.classList.remove('__aysec-edit-selected');
    selected = el;
    el.classList.add('__aysec-edit-selected');
    positionTag(el);
    parent.postMessage({ type: 'aysec:edit:selected', element: describeEl(el) }, '*');
  }

  function clearSelect() {
    if (selected) selected.classList.remove('__aysec-edit-selected');
    selected = null;
    tag.style.display = 'none';
  }

  // Intercept clicks: select editable elements, swallow other navigation.
  document.addEventListener('click', (e) => {
    const editable = e.target.closest('[data-site], [data-site-href], [data-site-toggle]');
    if (editable) {
      e.preventDefault();
      e.stopPropagation();
      selectEl(editable);
      return;
    }
    // For any other click on a link, swallow so navigation doesn't happen mid-edit
    const link = e.target.closest('a');
    if (link) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Hover tag tracking
  let hoverEl = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-site], [data-site-href], [data-site-toggle]');
    if (!el || el === selected) return;
    hoverEl = el;
    positionTag(el);
  }, true);
  document.addEventListener('mouseout', (e) => {
    if (e.target === hoverEl && selected) positionTag(selected);
  }, true);

  // Apply changes from parent
  window.addEventListener('message', (e) => {
    const msg = e.data || {};
    if (msg.type === 'aysec:edit:apply' && msg.key) {
      // Update text content for [data-site=key]
      document.querySelectorAll(`[data-site="${msg.key}"]`).forEach((el) => {
        if (msg.text != null) el.textContent = msg.text;
      });
      // Update href for [data-site-href=key]
      document.querySelectorAll(`[data-site-href="${msg.key}"]`).forEach((el) => {
        if (msg.href != null) el.setAttribute('href', msg.href);
      });
      // Toggle visibility for [data-site-toggle=key]
      if (msg.visible != null) {
        document.querySelectorAll(`[data-site-toggle="${msg.key}"]`).forEach((el) => {
          // In editor mode we keep elements rendered (so they can still be clicked)
          // but mark them visually as hidden — the public site uses display:none.
          if (msg.visible) {
            el.classList.remove('__aysec-edit-hidden');
            el.style.display = '';
          } else {
            el.classList.add('__aysec-edit-hidden');
            el.style.display = '';
          }
        });
      }
      if (selected) positionTag(selected); // re-anchor tag if dimensions changed
    } else if (msg.type === 'aysec:edit:clear') {
      clearSelect();
    } else if (msg.type === 'aysec:edit:select-key' && msg.key) {
      const el = document.querySelector(
        `[data-site="${msg.key}"], [data-site-href="${msg.key}"], [data-site-toggle="${msg.key}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        selectEl(el);
      }
    }
  });

  // Re-position tag on scroll/resize so it tracks the selected element.
  function reposition() { if (selected) positionTag(selected); }
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition);

  // In editor mode the page applies hidden state visually rather than removing
  // the element, so editors can still click and unhide it.
  document.querySelectorAll('[data-site-toggle]').forEach((el) => {
    if (el.style.display === 'none') {
      el.classList.add('__aysec-edit-hidden');
      el.style.display = '';
    }
  });

  // Tell parent we're ready, with the list of editable keys present on this page
  function announce() {
    const editable = [...document.querySelectorAll('[data-site], [data-site-href], [data-site-toggle]')].map((el) => ({
      key:  el.dataset.site || el.dataset.siteHref || el.dataset.siteToggle,
      kind: el.dataset.siteHref ? 'link'
          : el.dataset.siteToggle ? 'toggle'
          : 'text',
      preview: (el.dataset.siteToggle
        ? (el.classList.contains('__aysec-edit-hidden') ? 'hidden' : 'visible')
        : (el.textContent || el.getAttribute('href') || '')
      ).trim().slice(0, 60),
    }));
    parent.postMessage({ type: 'aysec:edit:ready', url: location.pathname, editable }, '*');
  }
  if (document.readyState === 'complete') announce();
  else window.addEventListener('load', announce);
})();
