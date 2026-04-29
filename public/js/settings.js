/* /settings — profile, password, theme, notif preferences. */
(() => {
  function $(id) { return document.getElementById(id); }
  function alertOn(id, kind, msg) {
    const el = $(id);
    el.hidden = false;
    el.className = `alert ${kind}`;
    el.textContent = msg;
  }

  // ---- Sticky-section nav highlight ----
  function wireNavSpy() {
    const links = document.querySelectorAll('.settings-nav a[href^="#"]');
    const targets = [...links].map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
        }
      });
    }, { rootMargin: '-100px 0px -60% 0px' });
    targets.forEach((t) => io.observe(t));
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wireNavSpy();

    // Load current profile
    let user;
    try {
      const me = await window.api.get('/api/auth/me');
      user = me.user;
    } catch {
      location.href = `/login?next=${encodeURIComponent('/settings')}`;
      return;
    }

    $('set-username').value = user.username;
    $('set-display').value  = user.display_name || '';
    $('set-bio').value      = user.bio || '';
    $('bioCounter').textContent = `${(user.bio || '').length} / 500`;
    if ($('set-banner'))   $('set-banner').value   = user.banner_url     || '';
    if ($('set-github'))   $('set-github').value   = user.social_github  || '';
    if ($('set-twitter'))  $('set-twitter').value  = user.social_twitter || '';
    if ($('set-linkedin')) $('set-linkedin').value = user.social_linkedin|| '';
    if ($('set-website'))  $('set-website').value  = user.social_website || '';

    $('set-bio').addEventListener('input', () => {
      $('bioCounter').textContent = `${$('set-bio').value.length} / 500`;
    });

    // ---- Avatar picker ----
    let pendingAvatar = user.avatar_url || '';
    const EMOJI_PALETTE = ['🥷', '🛡️', '🔒', '🔑', '⚔️', '🐛', '💀', '🧪', '🤖', '👻', '🎭', '🦊', '🐉', '🦅', '🚩', '🔥', '⚡', '💻', '🧠', '🦝', '🐺', '🌐', '📡', '🛰️'];
    const grid = $('avatarEmojiGrid');
    if (grid) {
      grid.innerHTML = EMOJI_PALETTE.map((e) =>
        `<button type="button" class="avatar-emoji-btn ${e === pendingAvatar ? 'is-selected' : ''}" data-emoji="${e}">${e}</button>`
      ).join('');
    }

    function updateAvatarPreview() {
      const old = document.getElementById('avatarPreview');
      if (!old) return;
      const previewUser = { ...user, display_name: $('set-display').value || user.username, avatar_url: pendingAvatar };
      const tmp = document.createElement('div');
      tmp.innerHTML = window.avatarHTML
        ? window.avatarHTML(previewUser, { className: 'avatar-preview' })
        : `<div class="avatar-preview">A</div>`;
      const fresh = tmp.firstChild;
      fresh.id = 'avatarPreview';
      old.replaceWith(fresh);
    }
    updateAvatarPreview();
    $('set-display').addEventListener('input', updateAvatarPreview);

    grid?.querySelectorAll('.avatar-emoji-btn').forEach((b) => {
      b.addEventListener('click', () => {
        pendingAvatar = b.dataset.emoji;
        grid.querySelectorAll('.avatar-emoji-btn').forEach((x) => x.classList.toggle('is-selected', x === b));
        switchTab('emoji');
        updateAvatarPreview();
      });
    });

    $('avatarCustomApply')?.addEventListener('click', () => {
      const v = $('avatarCustomEmoji').value.trim();
      if (!v) return;
      pendingAvatar = v;
      grid?.querySelectorAll('.avatar-emoji-btn').forEach((x) => x.classList.remove('is-selected'));
      updateAvatarPreview();
    });

    $('avatarUrlApply')?.addEventListener('click', () => {
      const v = $('avatarUrlInput').value.trim();
      if (!v) return;
      if (!v.startsWith('https://')) {
        alertOn('profileAlert', 'error', 'Image URL must start with https://');
        return;
      }
      pendingAvatar = v;
      grid?.querySelectorAll('.avatar-emoji-btn').forEach((x) => x.classList.remove('is-selected'));
      updateAvatarPreview();
    });

    $('avatarClear')?.addEventListener('click', () => {
      pendingAvatar = '';
      grid?.querySelectorAll('.avatar-emoji-btn').forEach((x) => x.classList.remove('is-selected'));
      $('avatarUrlInput').value = '';
      $('avatarCustomEmoji').value = '';
      updateAvatarPreview();
    });

    function switchTab(name) {
      document.querySelectorAll('.avatar-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
      document.querySelectorAll('.avatar-tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
    }
    document.querySelectorAll('.avatar-tab').forEach((t) => {
      t.addEventListener('click', () => switchTab(t.dataset.tab));
    });
    if (user.avatar_url) {
      const kind = window.avatarKind ? window.avatarKind(user.avatar_url) : 'initials';
      switchTab(kind);
      if (kind === 'url') $('avatarUrlInput').value = user.avatar_url;
    }

    // ---- Profile save ----
    $('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('profileAlert').hidden = true;
      const btn = $('profileSubmit');
      const idle = btn.textContent;
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
      try {
        await window.api.put ? null : null;
        // PATCH via fetch directly (api.js doesn't expose PATCH yet)
        const r = await fetch('/api/auth/me', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: $('set-display').value,
            bio: $('set-bio').value,
            avatar_url: pendingAvatar,
            banner_url:      $('set-banner')?.value   ?? '',
            social_github:   $('set-github')?.value   ?? '',
            social_twitter:  $('set-twitter')?.value  ?? '',
            social_linkedin: $('set-linkedin')?.value ?? '',
            social_website:  $('set-website')?.value  ?? '',
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || 'Save failed');
        alertOn('profileAlert', 'ok', '✓ Profile saved.');
      } catch (err) {
        alertOn('profileAlert', 'error', err.message || 'Save failed');
      } finally {
        btn.disabled = false; btn.textContent = idle;
      }
    });

    // ---- Password change ----
    $('pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('pwAlert').hidden = true;
      const cur = $('set-cur-pw').value;
      const nw  = $('set-new-pw').value;
      if (nw.length < 8) { alertOn('pwAlert', 'error', 'New password must be 8+ chars.'); return; }
      const btn = $('pwSubmit');
      const idle = btn.textContent;
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Changing…';
      try {
        await window.api.post('/api/auth/change-password', { current_password: cur, new_password: nw });
        alertOn('pwAlert', 'ok', '✓ Password changed. Stay signed in on this device.');
        $('set-cur-pw').value = ''; $('set-new-pw').value = '';
      } catch (err) {
        alertOn('pwAlert', 'error', err.message || 'Change failed');
      } finally {
        btn.disabled = false; btn.textContent = idle;
      }
    });

    // ---- Theme ----
    function refreshThemeButtons() {
      const stored = localStorage.getItem('theme');
      ['dark', 'light', 'system'].forEach((t) => {
        const btn = $('theme' + t.charAt(0).toUpperCase() + t.slice(1));
        if (!btn) return;
        const isActive = (t === 'system' && !stored) || stored === t;
        btn.classList.toggle('btn-primary', isActive);
        btn.classList.toggle('btn-ghost', !isActive);
      });
    }
    refreshThemeButtons();
    document.querySelectorAll('[data-theme-set]').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.themeSet;
        if (v === 'system') {
          localStorage.removeItem('theme');
          const sysLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
          document.documentElement.setAttribute('data-theme', sysLight ? 'light' : 'dark');
        } else {
          localStorage.setItem('theme', v);
          document.documentElement.setAttribute('data-theme', v);
        }
        refreshThemeButtons();
      });
    });

    // ---- Delete account (placeholder — needs backend endpoint to actually fire) ----
    $('deleteBtn').addEventListener('click', () => {
      const confirmed = confirm("Permanently delete your account, all progress, and all certificates? This cannot be undone.");
      if (!confirmed) return;
      alert("Account deletion isn't wired up yet — email me from /hire and I'll process it manually within 24 hours.");
    });

    // ---- API keys panel -------------------------------------------------
    function fmtRelOrDash(s) {
      if (!s) return '—';
      try { return window.fmtRelative(s); } catch { return s; }
    }
    function renderKeys(keys) {
      const list = $('apiKeysList');
      if (!keys.length) {
        list.innerHTML = `<p class="muted" style="font-size:0.85rem;">No keys yet. Create one above to start using <code>/api/v1</code>.</p>`;
        return;
      }
      list.innerHTML = keys.map((k) => `
        <div class="api-key-row ${k.revoked_at ? 'is-revoked' : ''}">
          <div>
            <div class="api-key-name">${escapeHtml(k.name)}</div>
            <div class="api-key-token">aysec_pk_${escapeHtml(k.prefix)}<span class="dim">…</span></div>
          </div>
          <div class="api-key-meta dim mono">
            <div>created ${escapeHtml(fmtRelOrDash(k.created_at))}</div>
            <div>last used ${escapeHtml(fmtRelOrDash(k.last_used_at))}</div>
          </div>
          <div>
            ${k.revoked_at
              ? '<span class="tag" style="border-color:color-mix(in srgb,var(--hard) 30%,var(--border)); color: var(--hard);">revoked</span>'
              : `<button class="btn btn-ghost btn-sm" data-revoke="${k.id}">Revoke</button>`}
          </div>
        </div>
      `).join('');
      list.querySelectorAll('[data-revoke]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Revoke this key? Anything using it stops working immediately.')) return;
          try {
            await window.api.del(`/api/keys/${b.dataset.revoke}`);
            window.toast?.('Key revoked.', 'info');
            loadKeys();
          } catch (err) { window.toast?.(err.message || 'Revoke failed', 'error'); }
        });
      });
    }
    async function loadKeys() {
      try {
        const r = await window.api.get('/api/keys');
        renderKeys(r.keys || []);
      } catch (err) {
        $('apiKeysList').innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
      }
    }
    if ($('apiKeyForm')) {
      loadKeys();
      $('apiKeyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('set-api-name').value.trim();
        const alertEl = $('apiKeyAlert');
        alertEl.hidden = true;
        if (!name) return;
        try {
          const r = await window.api.post('/api/keys', { name });
          alertEl.hidden = false;
          alertEl.className = 'alert ok';
          alertEl.innerHTML = `
            <div>
              <strong>Token created — copy it now.</strong>
              <div class="api-key-token-reveal">
                <code class="mono">${escapeHtml(r.token)}</code>
                <button type="button" class="btn btn-ghost btn-sm" id="copyTokenBtn">Copy</button>
              </div>
              <div class="dim" style="font-size:0.8rem; margin-top:0.4rem;">${escapeHtml(r.note)}</div>
            </div>`;
          alertEl.querySelector('#copyTokenBtn')?.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(r.token); window.toast?.('Token copied.', 'success'); } catch {}
          });
          $('set-api-name').value = '';
          loadKeys();
        } catch (err) {
          alertEl.hidden = false;
          alertEl.className = 'alert error';
          alertEl.textContent = err.message || 'Could not create key';
        }
      });
    }
  });
})();
