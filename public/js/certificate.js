(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const code = location.pathname.split('/').filter(Boolean)[1];
    const box = document.getElementById('certCard');
    try {
      const { certificate } = await window.api.get(`/api/certificates/${encodeURIComponent(code)}`);
      const dateStr = window.fmtDate(certificate.issued_at);
      const courseUrl = `${location.origin}/courses/${certificate.course_slug}`;
      const certUrl   = location.href;
      const tweetText = `I just completed ${certificate.course_title} on aysec.`;
      document.title = `Certificate — ${certificate.display_name || certificate.username} — aysec`;

      box.innerHTML = `
        <div class="cert-eyebrow">// certificate of completion</div>
        <p class="cert-line">This certifies that</p>
        <h1 class="cert-name">${escapeHtml(certificate.display_name || certificate.username)}</h1>
        <p class="cert-line">has successfully completed</p>
        <h2 class="cert-course"><a href="${escapeHtml(courseUrl)}" style="color:inherit;">${escapeHtml(certificate.course_title)}</a></h2>
        <p class="cert-line muted">${escapeHtml(certificate.course_subtitle || '')}</p>

        <div class="cert-meta">
          <div class="cert-meta-item">
            <span class="cert-meta-key">Issued</span>
            <span class="cert-meta-val">${escapeHtml(dateStr)}</span>
          </div>
          <div class="cert-meta-item">
            <span class="cert-meta-key">Lessons</span>
            <span class="cert-meta-val">${certificate.lesson_count}</span>
          </div>
          <div class="cert-meta-item">
            <span class="cert-meta-key">Difficulty</span>
            <span class="cert-meta-val">${escapeHtml(certificate.difficulty || '—')}</span>
          </div>
          <div class="cert-meta-item">
            <span class="cert-meta-key">Verification</span>
            <span class="cert-meta-val mono" style="font-family:var(--font-mono);">${escapeHtml(certificate.code)}</span>
          </div>
        </div>

        <div class="cert-issuer">
          <div class="cert-issuer-name">~$ aysec</div>
          <div class="cert-issuer-meta">aysec · cybersecurity training platform</div>
        </div>

        <div class="cert-actions">
          <a class="btn btn-primary" target="_blank" rel="noopener"
             href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(certUrl)}">
             Share on LinkedIn
          </a>
          <a class="btn btn-ghost" target="_blank" rel="noopener"
             href="https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(certUrl)}">
             Share on X
          </a>
          <button class="btn btn-ghost" id="copyCertLink">Copy link</button>
        </div>
      `;

      document.getElementById('copyCertLink')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          const b = document.getElementById('copyCertLink');
          const idle = b.textContent;
          b.textContent = '✓ Copied';
          setTimeout(() => (b.textContent = idle), 1500);
        } catch {}
      });
    } catch (err) {
      box.innerHTML = `
        <div class="cert-eyebrow">// not found</div>
        <h1 class="cert-name">No certificate at this code</h1>
        <p class="cert-line">${escapeHtml(err.message || 'The verification code does not match a published certificate.')}</p>
        <div class="cert-actions"><a href="/" class="btn btn-ghost">← Home</a></div>`;
    }
  });
})();
