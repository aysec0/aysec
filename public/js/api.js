/* Tiny fetch wrapper used everywhere. Loaded before layout.js.
 *
 * VAULT V03 — for the JWT-curious. Decode the payload of this token
 * (base64url, second segment between the dots). The header tells you
 * everything you need to know about why it's funny.
 *
 * eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ2YXVsdCI6IlYwMyIsImZsYWciOiJmbGFne2FsZ19ub25lX2lzX3N0aWxsX2FsaXZlX2luXzIwMjZ9In0.
 *
 * (3 of 7 — submit at /vault)
 */
(() => {
  async function request(method, path, body) {
    const init = {
      method,
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.api = {
    get:  (p)    => request('GET',    p),
    post: (p, b) => request('POST',   p, b ?? {}),
    put:  (p, b) => request('PUT',    p, b ?? {}),
    del:  (p)    => request('DELETE', p),
    // Generic — admin code calls api.req('PATCH'|'PUT'|'DELETE', path, body)
    req:  (method, p, b) => request(String(method).toUpperCase(), p, b),
    patch:(p, b) => request('PATCH',  p, b ?? {}),
  };

  window.escapeHtml = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  window.fmtPrice = (cents, currency = 'USD') => {
    if (!cents) return 'Free';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .format(cents / 100);
  };

  window.fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Tiny toast helper used by admin + forum; replaces alert().
  // Usage: window.toast('Saved.', 'success'|'error'|'info', 2500);
  window.toast = (msg, kind = 'info', ttl = 2500) => {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-shown'));
    setTimeout(() => {
      el.classList.remove('is-shown');
      setTimeout(() => el.remove(), 250);
    }, ttl);
  };

  window.fmtRelative = (s) => {
    if (!s) return '';
    const then = new Date(s.replace(' ', 'T') + 'Z').getTime();
    const diff = (Date.now() - then) / 1000;
    if (diff < 60)        return 'just now';
    if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return window.fmtDate(s);
  };
})();
