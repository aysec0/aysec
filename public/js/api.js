/* Tiny fetch wrapper used everywhere. Loaded before layout.js. */
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
