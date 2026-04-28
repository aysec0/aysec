/* Single source of truth for the tools that live under /tools.
   The /tools index page reads this to build the card grid; each
   /tools/:slug page reads this to render the panel + matches it to
   the per-tool init in lab.js (which keys off the panel's element IDs). */
(function () {
  const SVG_PEN  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
  const SVG_HASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
  const SVG_BOLT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
  const SVG_CODE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  const SVG_LINK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const SVG_NET  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
  const SVG_CLOCK= '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const SVG_ID   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

  window.AYSEC_TOOLS = [
    {
      slug: 'jwt',
      title: 'JWT decoder',
      tag: 'crypto',
      desc: 'Paste a JWT — see header, payload, and a flag if it’s signed with alg=none or otherwise dangerous.',
      shortDesc: 'Decode + audit any JSON Web Token.',
      icon: SVG_PEN,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_PEN}</span>JWT decoder</h2>
        </div>
        <p class="tool-panel-desc">Paste a JWT — see header, payload, and a flag if it&apos;s signed with <code>alg=none</code> or otherwise dangerous.</p>
        <textarea class="textarea mono" id="jwt-in" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." rows="4"></textarea>
        <div id="jwt-warn-host"></div>
        <div class="tool-out is-empty" id="jwt-out">decoded JWT will appear here</div>`,
    },
    {
      slug: 'hash-id',
      title: 'Hash identifier',
      tag: 'crypto',
      desc: 'Paste a hash, get the most likely algorithm by length and charset.',
      shortDesc: 'Identify a hash by length + charset.',
      icon: SVG_HASH,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_HASH}</span>Hash identifier</h2>
        </div>
        <p class="tool-panel-desc">Paste a hash — get the most likely algorithm by length + charset. Useful before you fire up hashcat.</p>
        <input class="input mono" id="hash-id-in" placeholder="5d41402abc4b2a76b9719d911017c592" />
        <div class="tool-pill-row" id="hash-id-out"></div>`,
    },
    {
      slug: 'hash-gen',
      title: 'Hash generator',
      tag: 'crypto',
      desc: 'SHA-1 / 256 / 384 / 512 of any input via SubtleCrypto.',
      shortDesc: 'Generate SHA-1/256/384/512.',
      icon: SVG_BOLT,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_BOLT}</span>Hash generator</h2>
        </div>
        <p class="tool-panel-desc">SHA-1 / SHA-256 / SHA-384 / SHA-512 of any input. Computed via the browser&apos;s SubtleCrypto API.</p>
        <textarea class="textarea mono" id="hash-gen-in" placeholder="anything..." rows="3"></textarea>
        <div id="hash-gen-out"></div>`,
    },
    {
      slug: 'base64',
      title: 'Base64',
      tag: 'encoding',
      desc: 'Encode / decode arbitrary text. Auto-detect.',
      shortDesc: 'Encode / decode base64.',
      icon: SVG_CODE,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_CODE}</span>Base64</h2>
        </div>
        <p class="tool-panel-desc">Encode / decode. Auto-detects: empty output means it can&apos;t decode as base64.</p>
        <textarea class="textarea mono" id="b64-in" placeholder="anything..." rows="3"></textarea>
        <div class="tool-grid-2">
          <div>
            <span class="tool-out-label">Encoded</span>
            <div class="tool-out is-empty" id="b64-encoded">—</div>
          </div>
          <div>
            <span class="tool-out-label">Decoded</span>
            <div class="tool-out is-empty" id="b64-decoded">—</div>
          </div>
        </div>`,
    },
    {
      slug: 'url',
      title: 'URL encode / decode',
      tag: 'encoding',
      desc: 'Standard percent-encoding. URL params, file paths, anywhere reserved chars matter.',
      shortDesc: 'Percent-encode / decode strings.',
      icon: SVG_LINK,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_LINK}</span>URL encode / decode</h2>
        </div>
        <p class="tool-panel-desc">Standard percent-encoding. Use on URL parameters, file paths, or anywhere reserved chars matter.</p>
        <textarea class="textarea mono" id="url-in" placeholder="hello world & friends" rows="3"></textarea>
        <div class="tool-grid-2">
          <div>
            <span class="tool-out-label">Encoded</span>
            <div class="tool-out is-empty" id="url-encoded">—</div>
          </div>
          <div>
            <span class="tool-out-label">Decoded</span>
            <div class="tool-out is-empty" id="url-decoded">—</div>
          </div>
        </div>`,
    },
    {
      slug: 'cidr',
      title: 'CIDR calculator',
      tag: 'network',
      desc: 'Type a CIDR (IPv4 or IPv6). Get the network range, broadcast, mask, total addresses.',
      shortDesc: 'Network range / mask / count from a CIDR.',
      icon: SVG_NET,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_NET}</span>CIDR calculator</h2>
        </div>
        <p class="tool-panel-desc">Type a CIDR (IPv4 or IPv6). Get the network range, broadcast, mask, and total addresses.</p>
        <input class="input mono" id="cidr-in" placeholder="10.10.10.0/24 — or — 2001:db8::/32" />
        <div class="tool-out is-empty" id="cidr-out">network details will appear here</div>`,
    },
    {
      slug: 'timestamp',
      title: 'Unix timestamp',
      tag: 'dev',
      desc: 'Convert seconds / milliseconds since epoch ↔ ISO datetime.',
      shortDesc: 'Convert epoch ↔ ISO datetime.',
      icon: SVG_CLOCK,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_CLOCK}</span>Unix timestamp</h2>
        </div>
        <p class="tool-panel-desc">Convert seconds / milliseconds since epoch ↔ ISO datetime.</p>
        <input class="input mono" id="ts-in" placeholder="1735689600 — or — 2026-01-01T00:00:00Z" />
        <div class="tool-out is-empty" id="ts-out">paste a timestamp or ISO date</div>`,
    },
    {
      slug: 'uuid',
      title: 'UUID generator',
      tag: 'dev',
      desc: 'RFC-4122 v4 UUIDs from crypto.randomUUID().',
      shortDesc: 'Generate v4 UUIDs in batches.',
      icon: SVG_ID,
      html: `
        <div class="tool-panel-head">
          <h2 class="tool-panel-title"><span class="icon">${SVG_ID}</span>UUID generator</h2>
          <button class="btn btn-primary" id="uuid-go">Generate ×8</button>
        </div>
        <p class="tool-panel-desc">RFC-4122 v4 UUIDs from <code>crypto.randomUUID()</code>. Useful for IDOR fuzzing seeds, test fixtures, etc.</p>
        <div class="tool-out is-empty" id="uuid-out">click "Generate" to produce 8 fresh UUIDs</div>`,
    },
  ];
})();
