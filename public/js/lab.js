/* /lab — security toolbox. All client-side. */
(() => {
  function $(id) { return document.getElementById(id); }
  function setOut(el, text, ok = true) {
    el.textContent = text;
    el.classList.toggle('is-empty', !ok || !text || text === '—');
  }
  function debounce(fn, ms = 120) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function withCopy(el, text) {
    if (!text) return;
    const btn = document.createElement('button');
    btn.className = 'tool-copy-btn';
    btn.textContent = 'copy';
    btn.style.cssText = 'position:absolute; top:6px; right:6px;';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓ copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1200);
      } catch {}
    });
    el.appendChild(btn);
  }

  // ---------- JWT decoder ----------
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return atob(s);
  }
  function tryJSON(s) { try { return JSON.parse(s); } catch { return null; } }
  function pretty(o)  { return JSON.stringify(o, null, 2); }

  const jwtIn   = $('jwt-in');
  const jwtOut  = $('jwt-out');
  const jwtWarn = $('jwt-warn-host');

  function decodeJWT() {
    jwtWarn.innerHTML = '';
    const raw = jwtIn.value.trim();
    if (!raw) { setOut(jwtOut, 'decoded JWT will appear here', false); return; }
    const parts = raw.split('.');
    if (parts.length !== 3) {
      setOut(jwtOut, '⚠ Not a JWT — expected three dot-separated segments.', false);
      return;
    }
    let header = null, payload = null;
    try { header  = tryJSON(b64urlDecode(parts[0])); } catch {}
    try { payload = tryJSON(b64urlDecode(parts[1])); } catch {}
    if (!header || !payload) {
      setOut(jwtOut, '⚠ Could not decode the header or payload as JSON.', false);
      return;
    }
    const sig = parts[2] || '(no signature)';

    // Render
    jwtOut.classList.remove('is-empty');
    jwtOut.innerHTML = '';
    jwtOut.style.position = 'relative';
    const html = (label, cls, body) => `<span class="tool-out-label" style="display:block; margin-bottom:2px;">${label}</span><span class="tool-jwt-segment ${cls}">${body}</span>`;
    jwtOut.innerHTML =
      html('header',    'tool-jwt-header',  pretty(header)) +
      html('payload',   'tool-jwt-payload', pretty(payload)) +
      html('signature', 'tool-jwt-sig',     sig);
    withCopy(jwtOut, JSON.stringify({ header, payload, signature: sig }, null, 2));

    // Warnings
    const warnings = [];
    const alg = String(header.alg || '').toLowerCase();
    if (alg === 'none') warnings.push('alg=none — server may accept unsigned tokens. Try forging.');
    if (alg.startsWith('hs') && parts[2].length < 30) warnings.push('HMAC signature is suspiciously short — possibly weak/empty key.');
    if (payload.exp && payload.exp * 1000 < Date.now()) warnings.push('Token is expired (`exp` in the past).');
    if (!payload.iss) warnings.push('No `iss` claim — could indicate weak validation.');
    if (warnings.length) {
      jwtWarn.innerHTML = warnings.map((w) =>
        `<div class="tool-jwt-warn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${w}</div>`
      ).join('');
    }
  }
  if (jwtIn) jwtIn.addEventListener('input', debounce(decodeJWT));

  // ---------- Hash identifier ----------
  const hashIdIn  = $('hash-id-in');
  const hashIdOut = $('hash-id-out');

  const HASH_TYPES = [
    { name: 'MD5',           len: 32,  hexish: true },
    { name: 'SHA-1',         len: 40,  hexish: true },
    { name: 'SHA-224',       len: 56,  hexish: true },
    { name: 'SHA-256',       len: 64,  hexish: true },
    { name: 'SHA-384',       len: 96,  hexish: true },
    { name: 'SHA-512',       len: 128, hexish: true },
    { name: 'NTLM',          len: 32,  hexish: true, hint: 'lowercase, often Windows context' },
    { name: 'NetNTLMv2',     contains: '$NETNTLMv2$', hint: 'starts with `$NETNTLMv2$`' },
    { name: 'bcrypt',        prefixes: ['$2a$', '$2b$', '$2y$'] },
    { name: 'argon2',        prefixes: ['$argon2'] },
    { name: 'sha512crypt',   prefixes: ['$6$'] },
    { name: 'sha256crypt',   prefixes: ['$5$'] },
    { name: 'md5crypt',      prefixes: ['$1$'] },
    { name: 'PBKDF2-SHA256', prefixes: ['$pbkdf2-sha256$'] },
    { name: 'JWT',           pattern: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/ },
  ];

  function identifyHash() {
    const v = hashIdIn.value.trim();
    if (!v) { hashIdOut.innerHTML = ''; return; }
    const matches = [];
    for (const t of HASH_TYPES) {
      if (t.prefixes && t.prefixes.some((p) => v.startsWith(p))) matches.push(t);
      else if (t.contains && v.includes(t.contains)) matches.push(t);
      else if (t.pattern && t.pattern.test(v)) matches.push(t);
      else if (t.len && v.length === t.len && (!t.hexish || /^[0-9a-fA-F]+$/.test(v))) matches.push(t);
    }
    if (!matches.length) {
      hashIdOut.innerHTML = `<span class="tool-pill" style="background:color-mix(in srgb, var(--text-dim) 14%, transparent); color:var(--text-dim);">no match — check length / charset</span>`;
      return;
    }
    hashIdOut.innerHTML = matches.map((m) =>
      `<span class="tool-pill" title="${m.hint || ''}">${m.name}${m.len ? ` (${m.len} chars)` : ''}</span>`
    ).join('');
  }
  if (hashIdIn) hashIdIn.addEventListener('input', debounce(identifyHash));

  // ---------- Hash generator ----------
  const hashGenIn  = $('hash-gen-in');
  const hashGenOut = $('hash-gen-out');

  async function digest(name, msg) {
    const buf = new TextEncoder().encode(msg);
    const h = await crypto.subtle.digest(name, buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function genHashes() {
    const v = hashGenIn.value;
    if (!v) { hashGenOut.innerHTML = ''; return; }
    const algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    hashGenOut.innerHTML = algos.map((a) => `
      <div style="margin-bottom:0.5rem;">
        <span class="tool-out-label">${a}</span>
        <div class="tool-out" id="hg-${a}" style="position:relative;">…</div>
      </div>`).join('');
    for (const a of algos) {
      const h = await digest(a, v);
      const el = $('hg-' + a);
      el.textContent = h;
      withCopy(el, h);
    }
  }
  if (hashGenIn) hashGenIn.addEventListener('input', debounce(genHashes, 200));

  // ---------- Base64 ----------
  const b64In   = $('b64-in');
  const b64Enc  = $('b64-encoded');
  const b64Dec  = $('b64-decoded');

  function safeBtoa(s) {
    try { return btoa(unescape(encodeURIComponent(s))); } catch { return ''; }
  }
  function safeAtob(s) {
    try { return decodeURIComponent(escape(atob(s.trim()))); } catch { return ''; }
  }

  function runB64() {
    const v = b64In.value;
    if (!v) { setOut(b64Enc, '—', false); setOut(b64Dec, '—', false); return; }
    const enc = safeBtoa(v);
    const dec = safeAtob(v);
    setOut(b64Enc, enc || '(failed)', !!enc);
    setOut(b64Dec, dec || '(not base64)', !!dec);
  }
  if (b64In) b64In.addEventListener('input', debounce(runB64));

  // ---------- URL encode/decode ----------
  const urlIn  = $('url-in');
  const urlEnc = $('url-encoded');
  const urlDec = $('url-decoded');

  function runURL() {
    const v = urlIn.value;
    if (!v) { setOut(urlEnc, '—', false); setOut(urlDec, '—', false); return; }
    try { setOut(urlEnc, encodeURIComponent(v), true); } catch { setOut(urlEnc, '(failed)', false); }
    try { setOut(urlDec, decodeURIComponent(v),  true); } catch { setOut(urlDec, '(invalid encoding)', false); }
  }
  if (urlIn) urlIn.addEventListener('input', debounce(runURL));

  // ---------- CIDR calculator ----------
  const cidrIn  = $('cidr-in');
  const cidrOut = $('cidr-out');

  function ipv4ToInt(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }
  function intToIPv4(n) {
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
  }

  function calcCIDR() {
    const v = cidrIn.value.trim();
    if (!v) { setOut(cidrOut, 'network details will appear here', false); return; }

    if (v.includes(':')) {
      // IPv6 — minimal calc
      const [addr, prefStr] = v.split('/');
      const pref = parseInt(prefStr, 10);
      if (!addr || isNaN(pref) || pref < 0 || pref > 128) {
        setOut(cidrOut, '⚠ Invalid IPv6 CIDR', false); return;
      }
      const total = pref === 128 ? 1n : (1n << BigInt(128 - pref));
      cidrOut.classList.remove('is-empty');
      cidrOut.style.position = 'relative';
      cidrOut.innerHTML = `
<span class="tool-out-label">protocol</span>      IPv6
<span class="tool-out-label">address</span>       ${addr}
<span class="tool-out-label">prefix</span>        /${pref}
<span class="tool-out-label">total addrs</span>   ${total.toLocaleString()}`;
      return;
    }

    const m = v.match(/^([\d.]+)\/(\d{1,2})$/);
    if (!m) { setOut(cidrOut, '⚠ Format: 10.10.10.0/24', false); return; }
    const [, ip, prefStr] = m;
    const pref = parseInt(prefStr, 10);
    if (pref < 0 || pref > 32) { setOut(cidrOut, '⚠ Prefix must be 0..32', false); return; }
    const ipInt = ipv4ToInt(ip);
    if (ipInt == null) { setOut(cidrOut, '⚠ Invalid IPv4 address', false); return; }
    const mask = pref === 0 ? 0 : (~((1 << (32 - pref)) - 1)) >>> 0;
    const network = (ipInt & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = 2 ** (32 - pref);
    const usable = pref >= 31 ? total : Math.max(0, total - 2);

    cidrOut.classList.remove('is-empty');
    cidrOut.style.position = 'relative';
    cidrOut.innerHTML = `
<span class="tool-out-label">protocol</span>      IPv4
<span class="tool-out-label">network</span>       ${intToIPv4(network)}
<span class="tool-out-label">broadcast</span>     ${intToIPv4(broadcast)}
<span class="tool-out-label">first host</span>    ${pref >= 31 ? intToIPv4(network) : intToIPv4(network + 1)}
<span class="tool-out-label">last host</span>     ${pref >= 31 ? intToIPv4(broadcast) : intToIPv4(broadcast - 1)}
<span class="tool-out-label">netmask</span>       ${intToIPv4(mask)}
<span class="tool-out-label">prefix</span>        /${pref}
<span class="tool-out-label">total addrs</span>   ${total.toLocaleString()}
<span class="tool-out-label">usable hosts</span>  ${usable.toLocaleString()}`;
  }
  if (cidrIn) cidrIn.addEventListener('input', debounce(calcCIDR));

  // ---------- Unix timestamp ----------
  const tsIn  = $('ts-in');
  const tsOut = $('ts-out');

  function fmtRow(label, val) {
    return `<span class="tool-out-label">${label}</span>      ${val}\n`;
  }

  function runTS() {
    const v = tsIn.value.trim();
    if (!v) { setOut(tsOut, 'paste a timestamp or ISO date', false); return; }
    let date;
    if (/^\d+$/.test(v)) {
      // Numeric — could be sec or ms
      const n = Number(v);
      const isMs = n > 1e12;
      date = new Date(isMs ? n : n * 1000);
    } else {
      date = new Date(v);
    }
    if (isNaN(date.getTime())) { setOut(tsOut, '⚠ Could not parse', false); return; }
    const sec = Math.floor(date.getTime() / 1000);
    const ms  = date.getTime();
    tsOut.classList.remove('is-empty');
    tsOut.innerHTML =
      fmtRow('iso (UTC)', date.toISOString()) +
      fmtRow('iso (local)', date.toString()) +
      fmtRow('unix (sec)',  sec) +
      fmtRow('unix (ms)',   ms) +
      fmtRow('relative',    relTime(date));
  }
  function relTime(d) {
    const diff = (Date.now() - d.getTime()) / 1000;
    const a = Math.abs(diff);
    const future = diff < 0 ? 'in ' : '';
    const past   = diff < 0 ? '' : ' ago';
    if (a < 60)        return `${future}${Math.round(a)}s${past}`;
    if (a < 3600)      return `${future}${Math.round(a / 60)}m${past}`;
    if (a < 86400)     return `${future}${Math.round(a / 3600)}h${past}`;
    if (a < 86400 * 30) return `${future}${Math.round(a / 86400)}d${past}`;
    if (a < 86400 * 365) return `${future}${Math.round(a / (86400 * 30))}mo${past}`;
    return `${future}${(a / (86400 * 365)).toFixed(1)}y${past}`;
  }
  if (tsIn) tsIn.addEventListener('input', debounce(runTS));

  // ---------- UUID generator ----------
  const uuidGo  = $('uuid-go');
  const uuidOut = $('uuid-out');

  function genUUIDs() {
    if (!crypto.randomUUID) { setOut(uuidOut, 'crypto.randomUUID not supported', false); return; }
    const list = Array.from({ length: 8 }, () => crypto.randomUUID());
    uuidOut.classList.remove('is-empty');
    uuidOut.style.position = 'relative';
    uuidOut.textContent = list.join('\n');
    withCopy(uuidOut, list.join('\n'));
  }
  if (uuidGo) uuidGo.addEventListener('click', genUUIDs);
})();
