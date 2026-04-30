/* Single source of truth for the tools that live under /tools.
   The /tools index page reads this to build the card grid; each
   /tools/:slug page reads this to render the panel + matches it to
   the per-tool init in lab.js / lab-extras.js (which key off the
   panel's element IDs). */
(function () {
  const SVG_PEN  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
  const SVG_HASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
  const SVG_BOLT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
  const SVG_CODE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  const SVG_LINK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const SVG_NET  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
  const SVG_CLOCK= '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const SVG_ID   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
  const SVG_SHIELD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  const SVG_KEY   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l8-8m-3 3l3 3m-7 4l3 3"/></svg>';
  const SVG_FILE  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const SVG_TERMINAL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
  const SVG_SWAP  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  const SVG_BROWSER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/></svg>';
  const SVG_SCAN  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  const SVG_DICE  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/></svg>';
  const SVG_GRID  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
  const SVG_BRACE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/></svg>';
  const SVG_REGEX = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="17" y1="3" x2="17" y2="13"/><polyline points="13 5 17 7 21 5"/><polyline points="13 11 17 9 21 11"/><circle cx="7" cy="17" r="2"/></svg>';

  window.AYSEC_TOOLS = [
    // ===== Encoding & Crypto (existing 8) =====
    {
      slug: 'jwt', title: 'JWT decoder', tag: 'crypto',
      desc: 'Paste a JWT — see header, payload, and a flag if it’s signed with alg=none or otherwise dangerous.',
      shortDesc: 'Decode + audit any JSON Web Token.', icon: SVG_PEN,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_PEN}</span>JWT decoder</h2></div>
        <p class="tool-panel-desc">Paste a JWT — see header, payload, and a flag if it&apos;s signed with <code>alg=none</code> or otherwise dangerous.</p>
        <textarea class="textarea mono" id="jwt-in" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." rows="4"></textarea>
        <div id="jwt-warn-host"></div>
        <div class="tool-out is-empty" id="jwt-out">decoded JWT will appear here</div>`,
    },
    {
      slug: 'jwt-sign', title: 'JWT signer / forger', tag: 'crypto',
      desc: 'Forge or sign a JWT. HS256/384/512 with a known secret, or alg=none for the classic skip-the-signature attack.',
      shortDesc: 'Sign or forge a JWT (incl. alg=none).', icon: SVG_KEY,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_KEY}</span>JWT signer / forger</h2></div>
        <p class="tool-panel-desc">Edit header + payload, choose an algorithm, output a ready-to-use token. <code>alg=none</code> emits an unsigned token for the classic forging attack.</p>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Algorithm</span>
            <select class="input mono" id="jwts-alg">
              <option>HS256</option><option>HS384</option><option>HS512</option><option>none</option>
            </select>
          </div>
          <div><span class="tool-out-label">HMAC secret</span>
            <input class="input mono" id="jwts-secret" placeholder="(ignored for none)" />
          </div>
        </div>
        <span class="tool-out-label">Header JSON</span>
        <textarea class="textarea mono" id="jwts-header" rows="3">{"alg":"HS256","typ":"JWT"}</textarea>
        <span class="tool-out-label">Payload JSON</span>
        <textarea class="textarea mono" id="jwts-payload" rows="4">{"sub":"1234","name":"victim","admin":true}</textarea>
        <span class="tool-out-label">Token</span>
        <div class="tool-out is-empty" id="jwts-out">type a payload</div>`,
    },
    {
      slug: 'hash-id', title: 'Hash identifier', tag: 'crypto',
      desc: 'Paste a hash, get the most likely algorithm by length and charset.',
      shortDesc: 'Identify a hash by length + charset.', icon: SVG_HASH,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_HASH}</span>Hash identifier</h2></div>
        <p class="tool-panel-desc">Paste a hash — get the most likely algorithm by length + charset. Useful before you fire up hashcat.</p>
        <input class="input mono" id="hash-id-in" placeholder="5d41402abc4b2a76b9719d911017c592" />
        <div class="tool-pill-row" id="hash-id-out"></div>`,
    },
    {
      slug: 'hash-gen', title: 'Hash generator', tag: 'crypto',
      desc: 'SHA-1 / 256 / 384 / 512 of any input via SubtleCrypto.',
      shortDesc: 'Generate SHA-1/256/384/512.', icon: SVG_BOLT,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_BOLT}</span>Hash generator</h2></div>
        <p class="tool-panel-desc">SHA-1 / SHA-256 / SHA-384 / SHA-512 of any input. Computed via the browser&apos;s SubtleCrypto API.</p>
        <textarea class="textarea mono" id="hash-gen-in" placeholder="anything..." rows="3"></textarea>
        <div id="hash-gen-out"></div>`,
    },
    {
      slug: 'hmac', title: 'HMAC generator', tag: 'crypto',
      desc: 'HMAC over arbitrary text with any SHA variant. Uses SubtleCrypto.',
      shortDesc: 'HMAC-SHA1/256/384/512 of text + key.', icon: SVG_BOLT,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_BOLT}</span>HMAC generator</h2></div>
        <p class="tool-panel-desc">HMAC-SHA over text + key. Useful for testing webhook signatures, API auth, etc.</p>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Algorithm</span>
            <select class="input mono" id="hmac-algo"><option>SHA-1</option><option selected>SHA-256</option><option>SHA-384</option><option>SHA-512</option></select>
          </div>
          <div><span class="tool-out-label">Key</span>
            <input class="input mono" id="hmac-key" placeholder="secret" />
          </div>
        </div>
        <span class="tool-out-label">Message</span>
        <textarea class="textarea mono" id="hmac-msg" rows="3" placeholder="payload"></textarea>
        <span class="tool-out-label">HMAC (hex)</span>
        <div class="tool-out is-empty" id="hmac-out">type a key + message</div>`,
    },
    {
      slug: 'x509', title: 'X.509 certificate parser', tag: 'crypto',
      desc: 'Decode a PEM certificate. Shows subject CN, issuer CN, validity window, and SHA-1/SHA-256 fingerprints.',
      shortDesc: 'Decode a PEM cert (subject, issuer, fingerprints).', icon: SVG_SHIELD,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_SHIELD}</span>X.509 certificate parser</h2></div>
        <p class="tool-panel-desc">Paste a PEM-encoded certificate — get subject, issuer, validity, and SHA-1/SHA-256 fingerprints (for cert pinning, comparing copies, etc.).</p>
        <textarea class="textarea mono" id="x509-in" rows="6" placeholder="-----BEGIN CERTIFICATE-----&#10;MIID..."></textarea>
        <div class="tool-out is-empty" id="x509-out">paste a PEM certificate</div>`,
    },

    // ===== Encoding =====
    {
      slug: 'base64', title: 'Base64', tag: 'encoding',
      desc: 'Encode / decode arbitrary text. Auto-detect.',
      shortDesc: 'Encode / decode base64.', icon: SVG_CODE,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_CODE}</span>Base64</h2></div>
        <p class="tool-panel-desc">Encode / decode. Auto-detects: empty output means it can&apos;t decode as base64.</p>
        <textarea class="textarea mono" id="b64-in" placeholder="anything..." rows="3"></textarea>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Encoded</span><div class="tool-out is-empty" id="b64-encoded">—</div></div>
          <div><span class="tool-out-label">Decoded</span><div class="tool-out is-empty" id="b64-decoded">—</div></div>
        </div>`,
    },
    {
      slug: 'url', title: 'URL encode / decode', tag: 'encoding',
      desc: 'Standard percent-encoding. URL params, file paths, anywhere reserved chars matter.',
      shortDesc: 'Percent-encode / decode strings.', icon: SVG_LINK,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_LINK}</span>URL encode / decode</h2></div>
        <p class="tool-panel-desc">Standard percent-encoding. Use on URL parameters, file paths, or anywhere reserved chars matter.</p>
        <textarea class="textarea mono" id="url-in" placeholder="hello world & friends" rows="3"></textarea>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Encoded</span><div class="tool-out is-empty" id="url-encoded">—</div></div>
          <div><span class="tool-out-label">Decoded</span><div class="tool-out is-empty" id="url-decoded">—</div></div>
        </div>`,
    },
    {
      slug: 'cipher', title: 'Cipher pipeline', tag: 'encoding',
      desc: 'cryptii-style three-panel decoder/encoder. Input on the left, pick a cipher in the middle (Caesar, ROT13, Vigenère, Atbash, Affine, Base64, hex, binary, decimal, URL, Morse, A1Z26, Reverse, Leet), output streams to the right as you type.',
      shortDesc: 'Three-panel cipher pipeline (cryptii-style).', icon: SVG_SWAP,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_SWAP}</span>Cipher pipeline</h2></div>
        <p class="tool-panel-desc">Type on the left. Pick a cipher and tweak its parameters in the middle. The decoded / encoded output appears on the right, live, as you type.</p>

        <div class="cipher-pipeline">
          <!-- LEFT — input -->
          <div class="cipher-panel cipher-panel-left">
            <div class="cipher-panel-head">
              <span class="cipher-panel-eyebrow">VIEW</span>
              <span class="cipher-panel-title">Input</span>
            </div>
            <textarea class="input mono cipher-textarea" id="cipher-in" rows="8" placeholder="Type or paste here…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
            <div class="cipher-panel-foot dim mono" id="cipher-in-foot">0 chars</div>
          </div>

          <!-- ARROW -->
          <div class="cipher-arrow" aria-hidden="true">→</div>

          <!-- MIDDLE — method picker + options -->
          <div class="cipher-panel cipher-panel-mid">
            <div class="cipher-panel-head cipher-mode">
              <button type="button" class="cipher-mode-btn is-active" data-mode="decode" id="cipher-mode-decode">DECODE</button>
              <button type="button" class="cipher-mode-btn"           data-mode="encode" id="cipher-mode-encode">ENCODE</button>
            </div>
            <div class="cipher-panel-section">
              <span class="cipher-panel-eyebrow">METHOD</span>
              <select class="input mono cipher-method" id="cipher-method">
                <optgroup label="Classical">
                  <option value="caesar">Caesar cipher</option>
                  <option value="rot13">ROT13</option>
                  <option value="rot47">ROT47</option>
                  <option value="atbash">Atbash</option>
                  <option value="vigenere">Vigenère cipher</option>
                  <option value="affine">Affine cipher</option>
                  <option value="reverse">Reverse</option>
                  <option value="leet">Leet (1337)</option>
                </optgroup>
                <optgroup label="Encoding">
                  <option value="base64">Base64</option>
                  <option value="hex">Hex bytes</option>
                  <option value="binary">Binary bytes</option>
                  <option value="decimal">Decimal bytes</option>
                  <option value="url">URL encoding</option>
                </optgroup>
                <optgroup label="Substitution / numeric">
                  <option value="morse">Morse code</option>
                  <option value="a1z26">A1Z26</option>
                </optgroup>
              </select>
            </div>

            <!-- Per-method options. Hidden when the method doesn't need them. -->
            <div class="cipher-panel-section" id="cipher-opts-shift" hidden>
              <span class="cipher-panel-eyebrow">SHIFT</span>
              <div class="cipher-shift-row">
                <input class="input mono" id="cipher-shift" type="number" min="0" max="25" value="3" />
                <input type="range"      id="cipher-shift-slider" min="0" max="25" value="3" />
                <span class="dim mono" id="cipher-shift-label">a→d</span>
              </div>
            </div>

            <div class="cipher-panel-section" id="cipher-opts-key" hidden>
              <span class="cipher-panel-eyebrow">KEY</span>
              <input class="input mono" id="cipher-key" placeholder="LEMON" autocomplete="off" />
            </div>

            <div class="cipher-panel-section" id="cipher-opts-affine" hidden>
              <span class="cipher-panel-eyebrow">a · x + b mod 26</span>
              <div class="cipher-affine-row">
                <label>a <input class="input mono" id="cipher-affine-a" type="number" value="5" min="1" max="25" /></label>
                <label>b <input class="input mono" id="cipher-affine-b" type="number" value="8" min="0" max="25" /></label>
              </div>
              <span class="dim mono" id="cipher-affine-warn"></span>
            </div>

            <div class="cipher-panel-foot dim mono" id="cipher-method-foot"></div>
          </div>

          <!-- ARROW -->
          <div class="cipher-arrow" aria-hidden="true">→</div>

          <!-- RIGHT — output -->
          <div class="cipher-panel cipher-panel-right">
            <div class="cipher-panel-head">
              <span class="cipher-panel-eyebrow">VIEW</span>
              <span class="cipher-panel-title">Output</span>
              <button type="button" class="cipher-copy-btn" id="cipher-copy" title="Copy output">Copy</button>
            </div>
            <textarea class="input mono cipher-textarea" id="cipher-out" rows="8" readonly placeholder="…"></textarea>
            <div class="cipher-panel-foot dim mono" id="cipher-out-foot">empty</div>
          </div>
        </div>`,
    },
    {
      slug: 'strings', title: 'Strings extractor', tag: 'encoding',
      desc: 'Pull printable-ASCII runs out of hex or base64 dumps — like the unix strings(1) tool, but in your browser.',
      shortDesc: 'Find readable runs in a binary blob.', icon: SVG_FILE,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_FILE}</span>Strings extractor</h2></div>
        <p class="tool-panel-desc">Paste hex or base64 — get every printable-ASCII run of <em>min length</em> or longer. Useful for poking at binaries pasted from a CTF.</p>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Min length</span>
            <input class="input mono" id="strings-min" type="number" min="2" max="64" value="4" />
          </div>
          <div></div>
        </div>
        <textarea class="textarea mono" id="strings-in" rows="4" placeholder="89 50 4E 47 ... — or — base64"></textarea>
        <div class="tool-out is-empty" id="strings-out">paste a binary blob</div>`,
    },
    {
      slug: 'magic', title: 'File-type identifier', tag: 'encoding',
      desc: 'Identify a file from its magic bytes (35+ formats: PNG, JPG, PDF, ZIP, ELF, Mach-O, …).',
      shortDesc: 'Identify a file by its magic bytes.', icon: SVG_FILE,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_FILE}</span>File-type identifier</h2></div>
        <p class="tool-panel-desc">Paste the first bytes of a file (hex or base64) — get the most likely format from a built-in magic-bytes table.</p>
        <input class="input mono" id="magic-in" placeholder="89504E47... — or — iVBORw0KGg..." />
        <div class="tool-out is-empty" id="magic-out">paste the first ~16 bytes</div>`,
    },

    // ===== Web =====
    {
      slug: 'headers', title: 'HTTP headers analyzer', tag: 'web',
      desc: 'Paste response headers — get a per-header rating against the modern security baseline (CSP, HSTS, X-Frame-Options, …).',
      shortDesc: 'Audit a site’s response headers.', icon: SVG_BROWSER,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_BROWSER}</span>HTTP headers analyzer</h2></div>
        <p class="tool-panel-desc">Paste the response headers from <code>curl -I</code> or DevTools. Each header gets a rating against the modern security baseline.</p>
        <textarea class="textarea mono" id="headers-in" rows="6" placeholder="content-security-policy: default-src 'self'&#10;strict-transport-security: max-age=31536000; includeSubDomains&#10;x-frame-options: DENY"></textarea>
        <div class="tool-out is-empty" id="headers-out">paste response headers</div>`,
    },
    {
      slug: 'cookie', title: 'Cookie parser', tag: 'web',
      desc: 'Break apart a Set-Cookie / Cookie string — flag missing Secure / HttpOnly / SameSite.',
      shortDesc: 'Parse cookies + flag missing security attrs.', icon: SVG_BROWSER,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_BROWSER}</span>Cookie parser</h2></div>
        <p class="tool-panel-desc">Paste a <code>Cookie:</code> or <code>Set-Cookie:</code> value — get a parsed table with security-flag warnings.</p>
        <textarea class="textarea mono" id="cookie-in" rows="3" placeholder="session=abc; HttpOnly; Secure; SameSite=Lax; Path=/"></textarea>
        <div class="tool-out is-empty" id="cookie-out">paste a cookie</div>`,
    },
    {
      slug: 'ua', title: 'User-agent parser', tag: 'web',
      desc: 'Decode a User-Agent string into browser, engine, OS, and device.',
      shortDesc: 'Parse a User-Agent string.', icon: SVG_BROWSER,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_BROWSER}</span>User-agent parser</h2></div>
        <p class="tool-panel-desc">Decode any User-Agent string into a parsed view of browser + engine + OS + device.</p>
        <input class="input mono" id="ua-in" placeholder="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36..." />
        <div class="tool-out is-empty" id="ua-out">paste a UA string</div>`,
    },
    {
      slug: 'url-split', title: 'URL splitter', tag: 'web',
      desc: 'Break a URL into protocol, host, port, path, query params, and fragment.',
      shortDesc: 'Parse a URL into its components.', icon: SVG_LINK,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_LINK}</span>URL splitter</h2></div>
        <p class="tool-panel-desc">Drop in a URL — see every component split out, including a per-key view of the query string.</p>
        <input class="input mono" id="urlsplit-in" placeholder="https://example.com:8443/api/v1?id=42&name=foo#section" />
        <div class="tool-out is-empty" id="urlsplit-out">paste a URL</div>`,
    },
    {
      slug: 'regex', title: 'Regex tester', tag: 'web',
      desc: 'Test a JS regex against a body of text — see all matches highlighted, plus capture groups.',
      shortDesc: 'Test a JS regex against text.', icon: SVG_REGEX,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_REGEX}</span>Regex tester</h2></div>
        <p class="tool-panel-desc">Test a JavaScript regex against any text. Matches are highlighted; capture groups listed below.</p>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Pattern</span>
            <input class="input mono" id="regex-pattern" placeholder="\\d+" />
          </div>
          <div><span class="tool-out-label">Flags</span>
            <input class="input mono" id="regex-flags" value="g" placeholder="gimsuy" />
          </div>
        </div>
        <span class="tool-out-label">Test text</span>
        <textarea class="textarea mono" id="regex-text" rows="5" placeholder="The year 2026 has 365 days"></textarea>
        <span class="tool-out-label">Highlighted</span>
        <div class="tool-out is-empty" id="regex-out">type a pattern</div>
        <span class="tool-out-label">Match list</span>
        <div class="tool-out is-empty" id="regex-list">—</div>`,
    },

    // ===== Network =====
    {
      slug: 'cidr', title: 'CIDR calculator', tag: 'network',
      desc: 'Type a CIDR (IPv4 or IPv6). Get the network range, broadcast, mask, total addresses.',
      shortDesc: 'Network range / mask / count from a CIDR.', icon: SVG_NET,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_NET}</span>CIDR calculator</h2></div>
        <p class="tool-panel-desc">Type a CIDR (IPv4 or IPv6). Get the network range, broadcast, mask, and total addresses.</p>
        <input class="input mono" id="cidr-in" placeholder="10.10.10.0/24 — or — 2001:db8::/32" />
        <div class="tool-out is-empty" id="cidr-out">network details will appear here</div>`,
    },
    {
      slug: 'subnet-split', title: 'Subnet splitter', tag: 'network',
      desc: 'Slice a parent IPv4 CIDR into smaller equal-sized subnets at a chosen prefix.',
      shortDesc: 'Split a CIDR into smaller subnets.', icon: SVG_NET,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_NET}</span>Subnet splitter</h2></div>
        <p class="tool-panel-desc">Pick a parent block, choose a longer prefix, get every resulting subnet (capped at 256 rows).</p>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Parent CIDR</span>
            <input class="input mono" id="subsplit-cidr" placeholder="10.0.0.0/16" value="10.0.0.0/16" />
          </div>
          <div><span class="tool-out-label">New prefix</span>
            <input class="input mono" id="subsplit-newpref" type="number" min="1" max="32" value="20" />
          </div>
        </div>
        <div class="tool-out is-empty" id="subsplit-out">enter a parent CIDR + new prefix</div>`,
    },

    // ===== Pentest =====
    {
      slug: 'revsh', title: 'Reverse shell builder', tag: 'pentest',
      desc: 'Generate a reverse-shell one-liner in any of 15 languages — bash, python, perl, ruby, php, nc, powershell, …',
      shortDesc: '15-language reverse-shell one-liner builder.', icon: SVG_TERMINAL,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_TERMINAL}</span>Reverse shell builder</h2></div>
        <p class="tool-panel-desc">Pick host + port + language → ready-to-paste reverse shell. For authorized engagements only.</p>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Listener IP</span>
            <input class="input mono" id="revsh-host" value="10.10.10.10" />
          </div>
          <div><span class="tool-out-label">Listener port</span>
            <input class="input mono" id="revsh-port" type="number" value="4444" />
          </div>
        </div>
        <span class="tool-out-label">Language</span>
        <select class="input mono" id="revsh-lang"></select>
        <div class="tool-out is-empty" id="revsh-out">choose a language</div>`,
    },

    // ===== Generators =====
    {
      slug: 'uuid', title: 'UUID generator', tag: 'gen',
      desc: 'RFC-4122 v4 UUIDs from crypto.randomUUID().',
      shortDesc: 'Generate v4 UUIDs in batches.', icon: SVG_ID,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_ID}</span>UUID generator</h2>
          <button class="btn btn-primary" id="uuid-go">Generate ×8</button>
        </div>
        <p class="tool-panel-desc">RFC-4122 v4 UUIDs from <code>crypto.randomUUID()</code>. Useful for IDOR fuzzing seeds, test fixtures, etc.</p>
        <div class="tool-out is-empty" id="uuid-out">click "Generate" to produce 8 fresh UUIDs</div>`,
    },
    {
      slug: 'password', title: 'Password generator', tag: 'gen',
      desc: 'Random or diceware passwords with an entropy meter.',
      shortDesc: 'Generate random / diceware passwords.', icon: SVG_DICE,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_DICE}</span>Password generator</h2>
          <button class="btn btn-primary" id="pwgen-go">Generate</button>
        </div>
        <p class="tool-panel-desc">Random char-pool or 4-word diceware. Crypto-RNG.</p>
        <div class="tool-grid-2">
          <div><span class="tool-out-label">Mode</span>
            <select class="input mono" id="pwgen-mode"><option value="random">random characters</option><option value="diceware">diceware (4 words)</option></select>
          </div>
          <div><span class="tool-out-label">Length</span>
            <input class="input mono" id="pwgen-len" type="number" min="6" max="128" value="20" />
          </div>
        </div>
        <span class="tool-out-label">Password</span>
        <div class="tool-out is-empty" id="pwgen-out">click Generate</div>
        <span class="tool-out-label">Entropy</span>
        <div class="tool-out is-empty" id="pwgen-entropy">—</div>`,
    },
    {
      slug: 'qr', title: 'QR code generator', tag: 'gen',
      desc: 'Render any text or URL as a scannable QR code (SVG, no network).',
      shortDesc: 'Render text → QR code SVG.', icon: SVG_GRID,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_GRID}</span>QR code generator</h2></div>
        <p class="tool-panel-desc">Anything you type becomes a scannable QR code. SVG output, generated client-side.</p>
        <textarea class="textarea mono" id="qr-in" rows="3" placeholder="https://aysec.me"></textarea>
        <div class="tool-out is-empty" id="qr-out">type something</div>`,
    },

    // ===== Dev =====
    {
      slug: 'timestamp', title: 'Unix timestamp', tag: 'dev',
      desc: 'Convert seconds / milliseconds since epoch ↔ ISO datetime.',
      shortDesc: 'Convert epoch ↔ ISO datetime.', icon: SVG_CLOCK,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_CLOCK}</span>Unix timestamp</h2></div>
        <p class="tool-panel-desc">Convert seconds / milliseconds since epoch ↔ ISO datetime.</p>
        <input class="input mono" id="ts-in" placeholder="1735689600 — or — 2026-01-01T00:00:00Z" />
        <div class="tool-out is-empty" id="ts-out">paste a timestamp or ISO date</div>`,
    },
    {
      slug: 'format', title: 'JSON / XML formatter', tag: 'dev',
      desc: 'Auto-detect JSON or XML, prettify or minify, with line+col error reporting.',
      shortDesc: 'Pretty / minify JSON or XML.', icon: SVG_BRACE,
      html: `
        <div class="tool-panel-head"><h2 class="tool-panel-title"><span class="icon">${SVG_BRACE}</span>JSON / XML formatter</h2>
          <div style="display:inline-flex; gap:0.4rem;">
            <button class="btn btn-ghost" id="fmt-pretty">prettify</button>
            <button class="btn btn-ghost" id="fmt-min">minify</button>
          </div>
        </div>
        <p class="tool-panel-desc">Auto-detects JSON vs XML. Validates and reports the first parse error with a position hint.</p>
        <textarea class="textarea mono" id="fmt-in" rows="8" placeholder='{"a":1,"b":[2,3]} — or — &lt;root&gt;&lt;a&gt;1&lt;/a&gt;&lt;/root&gt;'></textarea>
        <div class="tool-out is-empty" id="fmt-out">paste JSON or XML, then click prettify / minify</div>`,
    },
  ];
})();
