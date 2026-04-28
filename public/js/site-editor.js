/* /admin's visual editor — top-level frame controls. The iframe runs the
   actual page with editor-bridge.js, which reports clicks via postMessage. */
(() => {
  const $ = (id) => document.getElementById(id);
  const api = window.api;

  // Gate on admin auth
  (async () => {
    const me = await api.get('/api/auth/me').catch(() => null);
    if (!me?.user || me.user.role !== 'admin') {
      document.body.innerHTML = `
        <div style="padding:3rem; text-align:center;">
          <h1>Forbidden</h1>
          <p>Admin only. <a href="/login?next=${encodeURIComponent('/site-editor')}">Sign in</a></p>
        </div>`;
    }
  })();

  let state = {
    page: '/',
    device: 'desktop',
    mode: 'edit',
    settings: {},     // current values (server)
    pending: {},      // queued edits {key: value, key__href: value}
    selectedKey: null,
    selectedHrefKey: null,
    selectedToggleKey: null,
    editableOnPage: [], // [{key, kind, preview}]
  };

  const DEVICE_WIDTH = { desktop: 1280, tablet: 768, phone: 375 };

  // Load current settings up front so we know base values
  async function loadSettings() {
    try {
      const r = await api.get('/api/admin/site-settings');
      state.settings = r.settings;
    } catch {}
  }

  // ----- Iframe handling -----
  function loadFrame() {
    const f = $('seFrame');
    f.src = state.page + (state.page.includes('?') ? '&' : '?') + '_edit=1';
    setUnsaved(false);
    state.pending = {};
    state.selectedKey = null;
    selectNothing();
  }

  function applyDevice() {
    const wrap = $('seFrameWrap');
    wrap.dataset.dev = state.device;
    if (state.device === 'desktop') {
      wrap.style.width = '100%';
      wrap.style.maxWidth = '';
    } else {
      wrap.style.width = DEVICE_WIDTH[state.device] + 'px';
      wrap.style.maxWidth = '100%';
    }
    document.querySelectorAll('.se-dev').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.dev === state.device));
  }

  function applyMode() {
    document.querySelectorAll('.se-mode').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.mode === state.mode));
    const f = $('seFrame');
    if (state.mode === 'preview') {
      // Reload the iframe at the same page WITHOUT _edit=1 so links work and
      // the bridge no-ops; the user can click around as a real visitor.
      f.src = state.page;
    } else {
      // Back to edit mode — apply pending edits via reload + bridge.
      loadFrame();
    }
  }

  // ----- Sidebar -----
  function selectNothing() {
    state.selectedKey = null;
    state.selectedHrefKey = null;
    state.selectedToggleKey = null;
    $('seFieldSection').hidden = true;
    $('seSelected').textContent = 'Click any highlighted element to edit it.';
    $('seSelected').className = 'se-selected-empty';
    highlightActiveKey(null);
  }

  function highlightActiveKey(key) {
    document.querySelectorAll('.se-key').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.key === key));
  }

  function selectKey(key, kind = 'text') {
    state.selectedKey = kind === 'text' ? key : null;
    state.selectedHrefKey = kind === 'link' ? key : null;
    state.selectedToggleKey = kind === 'toggle' ? key : null;
    const cur = state.settings[key];
    const pending = state.pending[key];
    const kindLabel = kind === 'link' ? ' (link)' : kind === 'toggle' ? ' (visibility)' : '';
    const kindAttr  = kind === 'link' ? '-href' : kind === 'toggle' ? '-toggle' : '';
    $('seSelected').className = 'se-selected';
    $('seSelected').innerHTML = `
      <div class="se-selected-key">${key}${kindLabel}</div>
      <div class="se-selected-meta dim">data-site${kindAttr}="${key}"</div>`;
    $('seFieldSection').hidden = false;
    $('seTextWrap').hidden   = (kind !== 'text');
    $('seHrefWrap').hidden   = (kind !== 'link');
    $('seToggleWrap').hidden = (kind !== 'toggle');

    if (kind === 'link') {
      $('seHref').value = pending != null ? pending : (cur || '');
    } else if (kind === 'toggle') {
      const visible = pending != null
        ? !(pending === '0' || pending === 'false' || pending === false)
        : !(cur === '0' || cur === 'false' || cur === false);
      $('seToggleShow').classList.toggle('is-active', visible);
      $('seToggleHide').classList.toggle('is-active', !visible);
    } else {
      $('seText').value = pending != null ? pending : (cur || '');
    }
    highlightActiveKey(key);
    sendToFrame({ type: 'aysec:edit:select-key', key });
  }

  // ----- Apply edits live + queue them -----
  function applyEdit(key, value, kind) {
    // Use a synthetic suffix so __href / __toggle pendings don't collide with text
    const pendingKey = kind === 'link' ? key + '__href'
                     : kind === 'toggle' ? key + '__toggle'
                     : key;
    state.pending[pendingKey] = value;
    setUnsaved(true);
    if (kind === 'link') sendToFrame({ type: 'aysec:edit:apply', key, href: value });
    else if (kind === 'toggle') {
      const visible = !(value === '0' || value === 'false' || value === false);
      sendToFrame({ type: 'aysec:edit:apply', key, visible });
    }
    else sendToFrame({ type: 'aysec:edit:apply', key, text: value });
  }

  function sendToFrame(msg) {
    $('seFrame').contentWindow?.postMessage(msg, '*');
  }

  function setUnsaved(unsaved) {
    $('seState').textContent = unsaved ? 'Unsaved changes' : 'Saved';
    $('seState').classList.toggle('is-unsaved', unsaved);
  }

  function renderKeyList() {
    const list = $('seKeyList');
    const q = ($('seKeySearch')?.value || '').trim().toLowerCase();
    const items = state.editableOnPage.filter((it) =>
      !q || it.key.toLowerCase().includes(q) || (it.preview || '').toLowerCase().includes(q)
    );
    if (!items.length) {
      list.innerHTML = `<li class="dim">${state.editableOnPage.length ? 'No keys match.' : 'No editable keys on this page.'}</li>`;
      return;
    }
    list.innerHTML = items.map((it) => `
      <li>
        <button class="se-key" data-key="${escapeHtml(it.key)}" data-kind="${it.kind}">
          <span class="se-key-name">${escapeHtml(it.key)}<span class="se-key-kind">${it.kind === 'link' ? '↗' : it.kind === 'toggle' ? '👁' : 'T'}</span></span>
          <span class="se-key-preview">${escapeHtml(it.preview)}</span>
        </button>
      </li>`).join('');
    list.querySelectorAll('.se-key').forEach((b) =>
      b.addEventListener('click', () => selectKey(b.dataset.key, b.dataset.kind))
    );
  }

  // ----- postMessage from the iframe bridge -----
  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'aysec:edit:ready') {
      state.editableOnPage = m.editable || [];
      renderKeyList();
    } else if (m.type === 'aysec:edit:selected') {
      const el = m.element;
      if (el.siteKey)            selectKey(el.siteKey, 'text');
      else if (el.siteHrefKey)   selectKey(el.siteHrefKey, 'link');
      else if (el.siteToggleKey) selectKey(el.siteToggleKey, 'toggle');
    }
  });

  // ----- Wiring -----
  $('sePage').addEventListener('change', (e) => {
    if (Object.keys(state.pending).length && !confirm('Discard unsaved edits?')) {
      e.target.value = state.page; return;
    }
    state.page = e.target.value;
    loadFrame();
  });

  document.querySelectorAll('.se-dev').forEach((b) =>
    b.addEventListener('click', () => { state.device = b.dataset.dev; applyDevice(); })
  );
  document.querySelectorAll('.se-mode').forEach((b) =>
    b.addEventListener('click', () => { state.mode = b.dataset.mode; applyMode(); })
  );

  $('seText').addEventListener('input', (e) => {
    if (!state.selectedKey) return;
    applyEdit(state.selectedKey, e.target.value, 'text');
  });
  $('seHref').addEventListener('input', (e) => {
    if (!state.selectedHrefKey) return;
    applyEdit(state.selectedHrefKey, e.target.value, 'link');
  });
  $('seToggleShow').addEventListener('click', () => {
    if (!state.selectedToggleKey) return;
    applyEdit(state.selectedToggleKey, '1', 'toggle');
    $('seToggleShow').classList.add('is-active');
    $('seToggleHide').classList.remove('is-active');
  });
  $('seToggleHide').addEventListener('click', () => {
    if (!state.selectedToggleKey) return;
    applyEdit(state.selectedToggleKey, '0', 'toggle');
    $('seToggleHide').classList.add('is-active');
    $('seToggleShow').classList.remove('is-active');
  });

  $('seKeySearch').addEventListener('input', renderKeyList);

  $('seRevert').addEventListener('click', () => {
    const key = state.selectedKey || state.selectedHrefKey || state.selectedToggleKey;
    if (!key) return;
    const kind = state.selectedKey ? 'text' : state.selectedHrefKey ? 'link' : 'toggle';
    delete state.pending[key];
    delete state.pending[key + '__href'];
    delete state.pending[key + '__toggle'];
    setUnsaved(Object.keys(state.pending).length > 0);
    selectKey(key, kind);
    // Re-apply original to iframe
    const orig = state.settings[key];
    if (kind === 'link')   sendToFrame({ type: 'aysec:edit:apply', key, href: orig || '' });
    else if (kind === 'toggle') sendToFrame({ type: 'aysec:edit:apply', key, visible: !(orig === '0' || orig === 'false' || orig === false) });
    else                   sendToFrame({ type: 'aysec:edit:apply', key, text: orig || '' });
  });

  $('seReset').addEventListener('click', () => {
    if (!Object.keys(state.pending).length) return;
    if (!confirm('Discard all unsaved edits on this page?')) return;
    state.pending = {};
    setUnsaved(false);
    loadFrame();
  });

  // ⌘S / Ctrl+S to save
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      $('seSave').click();
    }
  });

  $('seSave').addEventListener('click', async () => {
    const body = {};
    for (const [k, v] of Object.entries(state.pending)) {
      // strip the synthetic __href / __toggle suffixes; all kinds save under the real key
      body[k.replace(/__(href|toggle)$/, '')] = v;
    }
    if (!Object.keys(body).length) return;
    $('seSave').disabled = true;
    $('seState').textContent = 'Saving…';
    try {
      await api.req('PUT', '/api/admin/site-settings', body);
      // Sync local cache
      Object.assign(state.settings, body);
      state.pending = {};
      setUnsaved(false);
    } catch (e) {
      $('seState').textContent = 'Save failed: ' + e.message;
      $('seState').classList.add('is-error');
    } finally {
      $('seSave').disabled = false;
    }
  });

  $('seOpenLive').addEventListener('click', () => window.open(state.page, '_blank'));

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  (async () => {
    await loadSettings();
    applyDevice();
    loadFrame();
  })();
})();
