(() => {
  const ICONS = {
    error: '<svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    ok:    '<svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  };

  function showAlert(el, kind, message) {
    if (!el) return;
    el.hidden = false;
    el.className = `alert ${kind}`;
    el.innerHTML = `${ICONS[kind] || ''}<div>${escapeHtml(message)}</div>`;
  }

  function setBusy(btn, busy, idleText) {
    if (!btn) return;
    btn.disabled = busy;
    if (busy) {
      btn.dataset.idle = btn.textContent;
      btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> Working…`;
    } else {
      btn.textContent = idleText || btn.dataset.idle || 'Submit';
    }
  }

  function nextRedirect() {
    const u = new URL(location.href);
    return u.searchParams.get('next') || '/dashboard';
  }

  // ---------- Login ----------
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      const alertEl = document.getElementById('loginAlert');
      alertEl.hidden = true;

      const identifier = loginForm.identifier.value.trim();
      const password = loginForm.password.value;

      if (!identifier || !password) {
        showAlert(alertEl, 'error', 'Username/email and password are required.');
        return;
      }

      setBusy(btn, true);
      try {
        await window.api.post('/api/auth/login', { identifier, password });
        showAlert(alertEl, 'ok', 'Signed in. Redirecting…');
        location.href = nextRedirect();
      } catch (err) {
        showAlert(alertEl, 'error', err.message || 'Sign-in failed');
        setBusy(btn, false, 'Sign in');
      }
    });
  }

  // ---------- Signup ----------
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('signupBtn');
      const alertEl = document.getElementById('signupAlert');
      alertEl.hidden = true;

      const username = signupForm.username.value.trim();
      const email = signupForm.email.value.trim();
      const password = signupForm.password.value;

      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
        showAlert(alertEl, 'error', 'Username must be 3–32 chars, letters/numbers/_/-.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert(alertEl, 'error', 'Enter a valid email address.');
        return;
      }
      if (password.length < 8) {
        showAlert(alertEl, 'error', 'Password must be at least 8 characters.');
        return;
      }

      setBusy(btn, true);
      try {
        await window.api.post('/api/auth/register', { username, email, password });
        showAlert(alertEl, 'ok', 'Account created. Redirecting…');
        location.href = nextRedirect();
      } catch (err) {
        showAlert(alertEl, 'error', err.message || 'Sign-up failed');
        setBusy(btn, false, 'Create account');
      }
    });
  }
})();
