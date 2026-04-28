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
    defaults: {},     // SITE_DEFAULTS (used for the Modified panel)
    pending: {},      // queued edits {key: value, key__href: value, key__toggle: value}
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
      state.settings = r.settings || {};
      state.defaults = r.defaults || {};
      renderModifiedPanel();
    } catch {}
  }

  // Show the Modified panel for any keys whose stored value differs from
  // the SITE_DEFAULTS value. This is global (across pages) so it surfaces
  // edits made on pages other than the one currently in the iframe.
  function renderModifiedPanel() {
    const section = $('seModifiedSection');
    if (!section) return;
    const modified = Object.keys(state.defaults).filter((k) => {
      const cur = state.settings[k];
      const def = state.defaults[k];
      return cur != null && String(cur) !== String(def);
    });
    if (!modified.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    $('seModifiedCount').textContent = modified.length;
    $('seModifiedList').innerHTML = modified.map((k) => {
      const cur = state.settings[k] ?? '';
      const preview = String(cur).slice(0, 50);
      return `<li>
        <button class="se-modified-key" data-key="${escapeHtml(k)}" title="Jump to this key">
          <span class="se-modified-key-name">${escapeHtml(k)}</span>
          <span class="se-modified-key-preview">${escapeHtml(preview)}</span>
        </button>
        <button class="se-modified-reset" data-reset-key="${escapeHtml(k)}" title="Reset to default">↺</button>
      </li>`;
    }).join('');
    $('seModifiedList').querySelectorAll('[data-key]').forEach((b) =>
      b.addEventListener('click', () => {
        // Find the key on the current page; if it's there, jump. Otherwise
        // hint with a toast that the key lives on another page.
        const onPage = state.editableOnPage.find((it) => it.key === b.dataset.key);
        if (onPage) selectKey(onPage.key, onPage.kind);
        else window.toast?.(`@${b.dataset.key} isn't on this page — switch pages to edit it.`, 'info');
      })
    );
    $('seModifiedList').querySelectorAll('[data-reset-key]').forEach((b) =>
      b.addEventListener('click', async () => {
        const k = b.dataset.resetKey;
        if (!confirm(`Reset ${k} to its default value?`)) return;
        b.disabled = true;
        try {
          // DELETE the stored override so the value falls back to the
          // server-side default — keeps site_settings as a true diff.
          await api.req('DELETE', `/api/admin/site-settings/${encodeURIComponent(k)}`);
          state.settings[k] = state.defaults[k];
          // Drop any pending edit for the same key
          delete state.pending[k];
          delete state.pending[k + '__href'];
          delete state.pending[k + '__toggle'];
          setUnsaved(Object.keys(state.pending).length > 0);
          renderModifiedPanel();
          const def = state.defaults[k];
          sendToFrame({ type: 'aysec:edit:apply', key: k, text: def, href: def, visible: !(def === '0' || def === 'false') });
        } catch (err) {
          window.toast?.(err.message || 'reset failed', 'error');
        } finally {
          b.disabled = false;
        }
      })
    );
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
  // Live preview into the iframe is rate-limited per key so fast typing
  // doesn't pile up postMessages — the visible state was lagging on long
  // strings because each keystroke fired a DOM update inside the iframe.
  const _frameTimers = new Map();
  function pushToFramePreview(key, payload, delay = 80) {
    if (_frameTimers.has(key)) clearTimeout(_frameTimers.get(key));
    _frameTimers.set(key, setTimeout(() => {
      _frameTimers.delete(key);
      sendToFrame({ type: 'aysec:edit:apply', key, ...payload });
    }, delay));
  }

  function applyEdit(key, value, kind) {
    // Use a synthetic suffix so __href / __toggle pendings don't collide with text
    const pendingKey = kind === 'link' ? key + '__href'
                     : kind === 'toggle' ? key + '__toggle'
                     : key;
    state.pending[pendingKey] = value;
    setUnsaved(true);
    if (kind === 'link') pushToFramePreview(key, { href: value });
    else if (kind === 'toggle') {
      const visible = !(value === '0' || value === 'false' || value === false);
      pushToFramePreview(key, { visible });
    }
    else pushToFramePreview(key, { text: value });
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
      renderModifiedPanel();
    } catch (e) {
      $('seState').textContent = 'Save failed: ' + e.message;
      $('seState').classList.add('is-error');
    } finally {
      $('seSave').disabled = false;
    }
  });

  $('seModifiedResetAll')?.addEventListener('click', async () => {
    const modified = Object.keys(state.defaults).filter((k) =>
      state.settings[k] != null && String(state.settings[k]) !== String(state.defaults[k])
    );
    if (!modified.length) return;
    if (!confirm(`Reset all ${modified.length} modified keys to their defaults?`)) return;
    try {
      // Delete each row in parallel; the in-memory state mirrors that.
      await Promise.all(modified.map((k) =>
        api.req('DELETE', `/api/admin/site-settings/${encodeURIComponent(k)}`)
      ));
      for (const k of modified) state.settings[k] = state.defaults[k];
      state.pending = {};
      setUnsaved(false);
      renderModifiedPanel();
      loadFrame();
      window.toast?.(`Reset ${modified.length} keys`, 'success');
    } catch (e) {
      window.toast?.(e.message || 'reset failed', 'error');
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
