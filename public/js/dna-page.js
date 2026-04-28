(() => {
  const parts = location.pathname.split('/').filter(Boolean);
  const username = parts[1];

  function $(id) { return document.getElementById(id); }

  document.addEventListener('DOMContentLoaded', async () => {
    $('crumbUser').textContent = username;
    $('profileBack').href = `/u/${encodeURIComponent(username)}`;

    let data;
    try {
      data = await window.api.get(`/api/users/${encodeURIComponent(username)}`);
    } catch (err) {
      $('dnaSvg').innerHTML = `<div class="empty"><h3>User not found</h3><p>${escapeHtml(err.message || '')}</p></div>`;
      return;
    }

    const { user, stats, level, allSolves = [], certificates = [] } = data;
    const tierColor = level?.current?.color || '#4d9aff';

    document.title = `${user.display_name || user.username} — Skill DNA — aysec`;

    // Hero
    const initials = (user.display_name || user.username).slice(0, 2).toUpperCase();
    $('dnaHero').innerHTML = `
      <div class="profile-avatar" style="width:54px; height:54px; font-size:1.4rem;">${escapeHtml(initials)}</div>
      <div>
        <div class="dna-hero-name">${escapeHtml(user.display_name || user.username)}</div>
        <div class="dna-hero-handle">@${escapeHtml(user.username)} · Lv ${level ? level.level_idx + 1 : 1}</div>
      </div>`;

    // Render the DNA
    const dnaData = {
      username: user.username,
      allSolves,
      certs: certificates.length,
      level: level?.level_idx || 0,
      tierColor,
      streak: stats?.streak?.current ?? 0,
    };
    const svg = window.SkillDNA.render(dnaData, { size: 640 });
    $('dnaSvg').innerHTML = svg;

    // Fingerprint
    const fp = window.SkillDNA.fingerprint(dnaData);
    $('dnaFingerprint').innerHTML = `fingerprint <strong>${escapeHtml(fp)}</strong>`;

    // Legend
    const byCat = {};
    for (const c of window.SkillDNA.CATEGORIES) byCat[c.key] = 0;
    for (const s of allSolves) if (byCat[s.category] !== undefined) byCat[s.category]++;
    $('dnaLegend').innerHTML = window.SkillDNA.CATEGORIES.map((c) => `
      <div class="dna-cat-row">
        <span class="dna-cat-dot" style="background:${c.color};"></span>
        <span class="dna-cat-name">${c.key}</span>
        <span class="dna-cat-count">${byCat[c.key]}</span>
      </div>
    `).join('');

    // Stats
    $('dnaStats').innerHTML = `
      <div class="dna-cat-row"><span class="dna-cat-name">solves</span><span class="dna-cat-count">${allSolves.length}</span></div>
      <div class="dna-cat-row"><span class="dna-cat-name">first bloods</span><span class="dna-cat-count">${allSolves.filter((s) => s.first_blood).length}</span></div>
      <div class="dna-cat-row"><span class="dna-cat-name">certificates</span><span class="dna-cat-count">${certificates.length}</span></div>
      <div class="dna-cat-row"><span class="dna-cat-name">daily streak</span><span class="dna-cat-count">${stats?.streak?.current ?? 0} / ${stats?.streak?.longest ?? 0} d</span></div>
      <div class="dna-cat-row"><span class="dna-cat-name">dailies solved</span><span class="dna-cat-count">${stats?.daily_solves ?? 0}</span></div>
      <div class="dna-cat-row"><span class="dna-cat-name">total xp</span><span class="dna-cat-count">${level?.xp || 0}</span></div>
    `;

    // Share / download wiring
    function svgString() {
      return $('dnaSvg').querySelector('svg').outerHTML;
    }
    function download(filename, blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    $('dnaDownload').addEventListener('click', () => {
      const blob = new Blob([svgString()], { type: 'image/svg+xml' });
      download(`skill-dna-${user.username}.svg`, blob);
    });

    $('dnaPng').addEventListener('click', async () => {
      const btn = $('dnaPng');
      const idle = btn.textContent;
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> rendering…';
      try {
        const svgStr = svgString();
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = 1200; canvas.height = 1200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-elev').trim() || '#11161e';
        ctx.fillRect(0, 0, 1200, 1200);
        ctx.drawImage(img, 0, 0, 1200, 1200);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => { if (b) download(`skill-dna-${user.username}.png`, b); }, 'image/png');
      } catch (e) {
        alert('Could not render PNG: ' + (e?.message || e));
      } finally {
        btn.disabled = false; btn.textContent = idle;
      }
    });

    $('dnaCopyLink').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        const b = $('dnaCopyLink');
        const idle = b.textContent;
        b.textContent = '✓ Copied';
        setTimeout(() => (b.textContent = idle), 1400);
      } catch {}
    });

    const shareText = `My aysec Skill DNA — ${allSolves.length} solves across ${Object.values(byCat).filter((n) => n > 0).length} categories. Generate yours:`;
    $('dnaShareX').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(location.href)}`;
  });
})();
