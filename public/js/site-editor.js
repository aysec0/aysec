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
    $('seFieldSection').hidden = true;
    $('seSelected').textContent = 'Click any highlighted element to edit it.';
    $('seSelected').className = 'se-selected-empty';
  }

  function selectKey(key, isHref = false) {
    state.selectedKey = isHref ? null : key;
    state.selectedHrefKey = isHref ? key : null;
    const cur = state.settings[key] || '';
    const pending = state.pending[key];
    $('seSelected').className = 'se-selected';
    $('seSelected').innerHTML = `
      <div class="se-selected-key">${key}${isHref ? ' (link)' : ''}</div>
      <div class="se-selected-meta dim">data-site${isHref ? '-href' : ''}="${key}"</div>`;
    $('seFieldSection').hidden = false;
    if (isHref) {
      $('seText').value = '';
      $('seText').disabled = true;
      $('seHrefWrap').hidden = false;
      $('seHref').value = pending != null ? pending : cur;
    } else {
      $('seText').disabled = false;
      $('seText').value = pending != null ? pending : cur;
      $('seHrefWrap').hidden = true;
    }
    // Tell iframe to scroll to + select this key
    sendToFrame({ type: 'aysec:edit:select-key', key });
  }

  // ----- Apply text/href edits live + queue them -----
  function applyEdit(key, value, isHref) {
    state.pending[isHref ? key + '__href' : key] = value;
    setUnsaved(true);
    sendToFrame(isHref
      ? { type: 'aysec:edit:apply', key, href: value }
      : { type: 'aysec:edit:apply', key, text: value });
  }

  function sendToFrame(msg) {
    $('seFrame').contentWindow?.postMessage(msg, '*');
  }

  function setUnsaved(unsaved) {
    $('seState').textContent = unsaved ? 'Unsaved changes' : 'Saved';
    $('seState').classList.toggle('is-unsaved', unsaved);
  }

  // ----- postMessage from the iframe bridge -----
  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'aysec:edit:ready') {
      // Render the editable-keys list
      const list = $('seKeyList');
      list.innerHTML = m.editable.map((it) => `
        <li>
          <button class="se-key" data-key="${it.key}" data-kind="${it.kind}">
            <span class="se-key-name">${it.key}</span>
            <span class="se-key-preview">${escapeHtml(it.preview)}</span>
          </button>
        </li>`).join('') || '<li class="dim">No editable keys on this page.</li>';
      list.querySelectorAll('.se-key').forEach((b) =>
        b.addEventListener('click', () => selectKey(b.dataset.key, b.dataset.kind === 'link'))
      );
    } else if (m.type === 'aysec:edit:selected') {
      const el = m.element;
      if (el.siteKey)         selectKey(el.siteKey, false);
      else if (el.siteHrefKey) selectKey(el.siteHrefKey, true);
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
    applyEdit(state.selectedKey, e.target.value, false);
  });
  $('seHref').addEventListener('input', (e) => {
    if (!state.selectedHrefKey) return;
    applyEdit(state.selectedHrefKey, e.target.value, true);
  });

  $('seRevert').addEventListener('click', () => {
    const key = state.selectedKey || state.selectedHrefKey;
    if (!key) return;
    delete state.pending[key];
    delete state.pending[key + '__href'];
    setUnsaved(Object.keys(state.pending).length > 0);
    selectKey(key, !!state.selectedHrefKey);
    // Re-apply original to iframe
    const orig = state.settings[key] || '';
    sendToFrame(state.selectedHrefKey
      ? { type: 'aysec:edit:apply', key, href: orig }
      : { type: 'aysec:edit:apply', key, text: orig });
  });

  $('seSave').addEventListener('click', async () => {
    const body = {};
    for (const [k, v] of Object.entries(state.pending)) {
      // strip the synthetic __href suffix; both shapes save under the real key
      body[k.replace(/__href$/, '')] = v;
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
