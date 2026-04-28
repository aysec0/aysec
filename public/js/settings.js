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
  });
})();
