/* ===========================================================
   Skill DNA — generative SVG visualization of a user's security
   identity. Deterministic from solve data. No two users get
   the same DNA.
   =========================================================== */
(() => {
  // ---- Categories: order around the ring + colors ----
  const CATEGORIES = [
    { key: 'web',       angle:  0, color: '#4d9aff' },
    { key: 'ai',        angle: 51, color: '#a47bff' },
    { key: 'crypto',    angle:103, color: '#d29922' },
    { key: 'pwn',       angle:154, color: '#f25555' },
    { key: 'rev',       angle:206, color: '#db61a2' },
    { key: 'forensics', angle:257, color: '#3fb950' },
    { key: 'misc',      angle:309, color: '#8b95a5' },
  ];
  const SECTOR = 360 / CATEGORIES.length;
  const DIFF_RADIUS = { easy: 0.40, medium: 0.55, hard: 0.72, insane: 0.88 };

  // Stable hash → 0..1
  function hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  // Short, friendly fingerprint hash — base32-ish
  function fingerprint(seedStr) {
    let h = 5381;
    for (let i = 0; i < seedStr.length; i++) h = (h * 33) ^ seedStr.charCodeAt(i);
    const abs = (h >>> 0).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
    return `${abs.slice(0, 4)}-${abs.slice(4)}`;
  }

  /**
   * @param {Object} data
   *   - username: string
   *   - allSolves: [{slug, category, difficulty, points, solved_at, first_blood}]
   *   - certs: number
   *   - level: number (idx)
   *   - tierColor: string
   *   - streak: number
   * @param {Object} opts — { size, preview }
   * @returns {string} SVG markup
   */
  function renderDNA(data, opts = {}) {
    const size = opts.size || 640;
    const preview = !!opts.preview;
    const cx = size / 2, cy = size / 2;
    const maxR = (size / 2) - (preview ? 10 : 30);
    const seed = data.username || 'guest';
    const seedNum = Math.floor(hash01(seed) * 1e9);
    const rand = rng(seedNum);

    const solves = data.allSolves || [];
    const certs = data.certs || 0;
    const tierColor = data.tierColor && data.tierColor !== 'rainbow' ? data.tierColor : '#4d9aff';

    // Group solves by category
    const byCat = {};
    for (const c of CATEGORIES) byCat[c.key] = [];
    for (const s of solves) {
      if (byCat[s.category] !== undefined) byCat[s.category].push(s);
    }

    // ---- Build SVG ----
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" aria-label="Skill DNA visualization">`);

    // Background gradient
    parts.push(`
      <defs>
        <radialGradient id="dna-bg" cx="50%" cy="50%" r="55%">
          <stop offset="0%"  stop-color="${tierColor}" stop-opacity="0.12"/>
          <stop offset="60%" stop-color="${tierColor}" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="${tierColor}" stop-opacity="0"/>
        </radialGradient>
        <filter id="dna-glow"><feGaussianBlur stdDeviation="2.5"/></filter>
      </defs>
      <rect x="0" y="0" width="${size}" height="${size}" fill="url(#dna-bg)" rx="${preview ? size/2 : 24}"/>
    `);

    // Concentric rings (one per cert + a base ring)
    const ringCount = Math.min(8, certs + 1);
    for (let i = 0; i < ringCount; i++) {
      const r = maxR * (0.25 + (i / Math.max(1, ringCount)) * 0.7);
      const opacity = i === 0 ? 0.25 : 0.12;
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${tierColor}" stroke-opacity="${opacity}" stroke-width="${i === ringCount - 1 ? 1.4 : 0.8}" stroke-dasharray="${i === 0 ? 'none' : '2 6'}"/>`);
    }

    // Sector dividers (subtle)
    for (let i = 0; i < CATEGORIES.length; i++) {
      const a = (CATEGORIES[i].angle - 90) * Math.PI / 180;
      const x = cx + Math.cos(a) * maxR;
      const y = cy + Math.sin(a) * maxR;
      parts.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border, #232a36)" stroke-opacity="0.18" stroke-width="0.7"/>`);
    }

    // Category labels around the ring (non-preview only)
    if (!preview) {
      for (const cat of CATEGORIES) {
        const labelAngle = cat.angle + SECTOR / 2;
        const a = (labelAngle - 90) * Math.PI / 180;
        const r = maxR + 14;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const opacity = byCat[cat.key].length > 0 ? 0.85 : 0.3;
        parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="${cat.color}" fill-opacity="${opacity}" letter-spacing="2">${cat.key.toUpperCase()}</text>`);
      }
    }

    // ---- Stars: place each solve ----
    const stars = [];  // remember positions for connecting lines
    for (const cat of CATEGORIES) {
      const list = byCat[cat.key];
      const pts = [];
      list.forEach((s, idx) => {
        const diffR = DIFF_RADIUS[s.difficulty] || 0.5;
        // Spread within sector based on hashed slug + index
        const localSeed = hash01(seed + s.slug);
        const angleInSector = SECTOR * 0.15 + localSeed * SECTOR * 0.7;
        const angle = cat.angle + angleInSector;
        // Slight random radius jitter
        const jitter = (rand() - 0.5) * 0.06;
        const r = maxR * (diffR + jitter);
        const a = (angle - 90) * Math.PI / 180;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const baseSize = preview ? 1.6 : 2.6;
        const size = baseSize + (s.points / 100);
        pts.push({ x, y, points: s.points, fb: !!s.first_blood });

        // Faint halo for each star
        if (!preview) {
          parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size + 4).toFixed(1)}" fill="${cat.color}" fill-opacity="0.10" filter="url(#dna-glow)"/>`);
        }
        // The star itself
        const isLastSolve = idx === list.length - 1;
        const cls = isLastSolve ? 'dna-star active' : 'dna-star';
        parts.push(`<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="${cat.color}" stroke="${s.first_blood ? '#fff' : 'none'}" stroke-width="${s.first_blood ? 1.5 : 0}"/>`);
        // First-blood crown — extra glow ring
        if (s.first_blood && !preview) {
          parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size + 3).toFixed(1)}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="0.8"/>`);
        }
      });
      stars.push({ cat, pts });

      // Connect stars within a category — constellation lines
      if (pts.length >= 2 && !preview) {
        const sorted = [...pts].sort((a, b) => a.x - b.x);
        const path = sorted.map((p, i) => (i === 0 ? `M${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(' ');
        parts.push(`<path d="${path}" fill="none" stroke="${cat.color}" stroke-opacity="0.22" stroke-width="0.7"/>`);
      }
    }

    // ---- Center medallion ----
    const medR = preview ? maxR * 0.18 : maxR * 0.12;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(medR + 4).toFixed(1)}" fill="none" stroke="${tierColor}" stroke-opacity="0.5" stroke-width="1"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${medR.toFixed(1)}" fill="${tierColor}" fill-opacity="0.85"/>`);
    if (!preview) {
      const lvlText = `Lv ${(data.level || 0) + 1}`;
      parts.push(`<text x="${cx}" y="${cy + 5}" text-anchor="middle" dominant-baseline="middle" font-family="JetBrains Mono, monospace" font-size="${preview ? 11 : 18}" font-weight="800" fill="#0a0d12" letter-spacing="-0.5">${lvlText}</text>`);
    }

    // Streak halo
    if (data.streak >= 3) {
      const haloR = medR + 8 + Math.min(20, data.streak / 2);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${haloR.toFixed(1)}" fill="none" stroke="#ff8a3f" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="3 3"/>`);
    }

    parts.push(`</svg>`);
    return parts.join('\n');
  }

  function fingerprintFor(data) {
    const seedStr = [
      data.username,
      (data.allSolves || []).map((s) => s.slug).join('|'),
      data.certs || 0,
      data.level || 0,
    ].join(';');
    return fingerprint(seedStr);
  }

  window.SkillDNA = {
    render: renderDNA,
    fingerprint: fingerprintFor,
    CATEGORIES,
  };
})();
