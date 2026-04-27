/* /certifications — "Cert Picker" quiz that ranks all 8 cert prep paths. */
(() => {
  const CERT_META = {
    'security-plus': { name: 'Security+', issuer: 'CompTIA',            emoji: '🛡️', cost: '$392',  why: "Vendor-neutral entry-level cert. Theoretical, broad. Required for many DoD / government roles." },
    'ceh':           { name: 'CEH',       issuer: 'EC-Council',         emoji: '🎯', cost: '$1199', why: "The most HR-recognized offensive cert. Multiple choice. Common HR / contractor requirement." },
    'pnpt':          { name: 'PNPT',      issuer: 'TCM Security',       emoji: '🧪', cost: '$399',  why: "5-day full-engagement exam ending with an oral debrief. Closest to a real pentest engagement." },
    'crtp':          { name: 'CRTP',      issuer: 'Altered Security',   emoji: '🪪', cost: '$249',  why: "Cheapest serious AD cert. 24-hour exam against a multi-domain forest. Best entry point to red-team certs." },
    'oscp':          { name: 'OSCP',      issuer: 'Offensive Security', emoji: '⚔️', cost: '$1599', why: "The most popular practical pentest cert in the world. 23h45m hands-on exam. Hiring managers love it." },
    'crto':          { name: 'CRTO',      issuer: 'Zero Point Security', emoji: '🥷', cost: '$499',  why: "Hands-on red-team cert built around Cobalt Strike. 4-day exam. Best value-per-dollar in offensive certs." },
    'oswe':          { name: 'OSWE',      issuer: 'Offensive Security', emoji: '🔬', cost: '$1499', why: "White-box web exploitation. 47.75-hour overnight exam on real-world apps. For people who want to do code review on the job." },
    'osep':          { name: 'OSEP',      issuer: 'Offensive Security', emoji: '🐉', cost: '$1799', why: "Advanced offensive cert. AV evasion, complex AD, lateral movement at scale. Take after OSCP." },
  };

  const QUESTIONS = [
    {
      q: 'Why are you getting a cert?',
      hint: "Be honest — the answer changes which one is right.",
      options: [
        { label: "Job filter / HR requires one",            scores: { 'security-plus': 3, 'ceh': 3, 'oscp': 1 } },
        { label: "Government / DoD compliance (8570)",       scores: { 'security-plus': 4, 'ceh': 2 } },
        { label: "Demonstrate practical skill to employers", scores: { 'oscp': 4, 'pnpt': 3, 'crto': 2, 'oswe': 2, 'osep': 2 } },
        { label: "Personal challenge / level up",            scores: { 'oscp': 2, 'osep': 3, 'oswe': 3, 'crto': 2 } },
      ],
    },
    {
      q: "What's your max budget for the exam alone?",
      options: [
        { label: "Under $400",   scores: { 'security-plus': 3, 'pnpt': 3, 'crtp': 4 } },
        { label: "$400-$800",    scores: { 'crto': 4, 'crtp': 2, 'pnpt': 2, 'security-plus': 1 } },
        { label: "$800-$1500",   scores: { 'ceh': 3, 'oswe': 3, 'oscp': 1 } },
        { label: "$1500+",       scores: { 'oscp': 4, 'osep': 4, 'oswe': 2 } },
      ],
    },
    {
      q: "How would you describe your current skill level?",
      options: [
        { label: "Total beginner",                              scores: { 'security-plus': 4, 'ceh': 1 } },
        { label: "Comfortable with web + Linux basics",         scores: { 'pnpt': 3, 'crtp': 2, 'ceh': 2, 'security-plus': 1 } },
        { label: "Done CTFs, scoped pentesting",                scores: { 'oscp': 3, 'crto': 3, 'crtp': 2, 'pnpt': 2 } },
        { label: "Working pentester / red teamer wanting more", scores: { 'osep': 4, 'oswe': 4 } },
      ],
    },
    {
      q: "What format do you prefer?",
      options: [
        { label: "Multiple choice — written exam",     scores: { 'security-plus': 4, 'ceh': 4 } },
        { label: "24-hour hands-on (single sitting)",   scores: { 'oscp': 4, 'crtp': 4 } },
        { label: "Multi-day attack simulation / lab",  scores: { 'osep': 3, 'crto': 4, 'pnpt': 3 } },
        { label: "Long sitting + written report",      scores: { 'oscp': 2, 'oswe': 4, 'osep': 1, 'pnpt': 2 } },
      ],
    },
    {
      q: "What domain interests you most?",
      hint: "Where you want to spend the next 12 months.",
      options: [
        { label: "Web app / API security",          scores: { 'oswe': 4, 'pnpt': 1, 'oscp': 1, 'ceh': 1 } },
        { label: "Active Directory / corporate net", scores: { 'crtp': 4, 'crto': 3, 'osep': 3, 'oscp': 2 } },
        { label: "Full red-team operations",         scores: { 'crto': 4, 'osep': 3, 'oscp': 1 } },
        { label: "General / not specialized yet",    scores: { 'security-plus': 2, 'ceh': 2, 'oscp': 2, 'pnpt': 2 } },
      ],
    },
    {
      q: "Honest study time per week?",
      options: [
        { label: "5-10 hours",   scores: { 'security-plus': 3, 'ceh': 2, 'crtp': 2 } },
        { label: "10-15 hours",  scores: { 'pnpt': 3, 'crto': 3, 'oscp': 1, 'crtp': 2 } },
        { label: "15-25 hours",  scores: { 'oscp': 4, 'oswe': 3, 'osep': 2 } },
        { label: "25+ hours",    scores: { 'osep': 4, 'oswe': 4, 'oscp': 2 } },
      ],
    },
  ];

  let step = 0;
  let scores = {};
  const STORAGE_KEY = 'aysec.cert-picker.history';
  function reset() { step = 0; scores = Object.fromEntries(Object.keys(CERT_META).map((k) => [k, 0])); }
  function $(id) { return document.getElementById(id); }
  function show(id) { const e = $(id); if (e) e.hidden = false; }
  function hide(id) { const e = $(id); if (e) e.hidden = true; }

  function renderQuestion() {
    const q = QUESTIONS[step];
    $('quizStep').textContent = String(step + 1);
    $('quizTotal').textContent = String(QUESTIONS.length);
    $('quizProgressFill').style.width = `${((step + 1) / QUESTIONS.length) * 100}%`;
    $('quizQuestion').innerHTML = `
      <span class="quiz-q-eyebrow">// question ${step + 1}</span>
      <h3 class="quiz-q-text">${escapeHtml(q.q)}</h3>
      ${q.hint ? `<p class="quiz-q-hint">${escapeHtml(q.hint)}</p>` : ''}`;
    $('quizOptions').innerHTML = q.options.map((opt, i) => `
      <button class="quiz-option" data-idx="${i}">
        <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
        <span class="quiz-option-label">${escapeHtml(opt.label)}</span>
      </button>`).join('');
    $('quizOptions').querySelectorAll('.quiz-option').forEach((b) => {
      b.addEventListener('click', () => answer(Number(b.dataset.idx)));
    });
    $('quizBack').disabled = step === 0;
  }

  function answer(idx) {
    const opt = QUESTIONS[step].options[idx];
    Object.entries(opt.scores).forEach(([k, v]) => { scores[k] = (scores[k] || 0) + v; });
    if (step + 1 < QUESTIONS.length) { step++; renderQuestion(); }
    else finish();
  }

  function back() {
    if (step === 0) return;
    reset();
    renderQuestion();
  }

  function finish() {
    hide('quizActive');
    show('quizResult');
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topSlug, topScore] = ranked[0];
    const [altSlug, altScore] = ranked[1] || [];
    const top = CERT_META[topSlug];
    const alt = CERT_META[altSlug];
    const total = Object.values(scores).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const topPct = Math.round((Math.max(0, topScore) / total) * 100);
    const altPct = altScore != null ? Math.round((Math.max(0, altScore) / total) * 100) : 0;

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ topSlug, altSlug, scores, ts: Date.now() })); } catch {}

    $('quizResult').innerHTML = `
      <div class="quiz-result-eyebrow">// your match</div>
      <div class="quiz-result-card">
        <div class="quiz-result-emoji" aria-hidden="true">${top.emoji}</div>
        <div class="quiz-result-body">
          <div class="quiz-result-fit">${topPct}% match · ${escapeHtml(top.cost)} exam fee</div>
          <h3 class="quiz-result-title">${escapeHtml(top.name)} — ${escapeHtml(top.issuer)}</h3>
          <p class="quiz-result-why">${escapeHtml(top.why)}</p>
          <div class="quiz-result-actions">
            <a href="/certifications/${escapeHtml(topSlug)}" class="btn btn-primary">View ${escapeHtml(top.name)} prep →</a>
            <button class="btn btn-ghost" id="quizRestart">Retake quiz</button>
          </div>
        </div>
      </div>
      ${alt ? `
        <div class="quiz-alt">
          <div class="quiz-alt-label">also a strong fit (${altPct}%)</div>
          <a href="/certifications/${escapeHtml(altSlug)}" class="quiz-alt-card">
            <span class="quiz-alt-emoji">${alt.emoji}</span>
            <div>
              <div class="quiz-alt-title">${escapeHtml(alt.name)} — ${escapeHtml(alt.issuer)}</div>
              <div class="quiz-alt-why">${escapeHtml(alt.why)}</div>
            </div>
            <span class="quiz-alt-arrow">→</span>
          </a>
        </div>` : ''}
      <details class="quiz-breakdown">
        <summary>See full ranking</summary>
        ${ranked.map(([slug, s]) => `
          <div class="quiz-breakdown-row">
            <span class="quiz-breakdown-name">${escapeHtml(CERT_META[slug]?.name)} <span class="dim" style="font-family:var(--font-mono); font-size:0.78rem;">(${escapeHtml(CERT_META[slug]?.issuer || '')})</span></span>
            <span class="quiz-breakdown-bar"><span style="width:${Math.max(0, Math.round((Math.max(0, s) / total) * 100))}%"></span></span>
            <span class="quiz-breakdown-pct">${Math.max(0, s)}</span>
          </div>`).join('')}
      </details>`;

    $('quizRestart')?.addEventListener('click', () => {
      reset();
      hide('quizResult');
      show('quizActive');
      renderQuestion();
    });
    $('quizResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('quizStart')) return;
    $('quizStart').addEventListener('click', () => {
      reset();
      hide('quizIntro'); hide('quizResult');
      show('quizActive');
      renderQuestion();
      $('quizActive').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('quizExit')?.addEventListener('click', () => {
      reset();
      hide('quizActive'); hide('quizResult');
      show('quizIntro');
    });
    $('quizBack')?.addEventListener('click', back);

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.scores && Date.now() - saved.ts < 1000 * 60 * 60 * 24 * 14) {
        const top = CERT_META[saved.topSlug];
        if (top) {
          const chip = document.createElement('a');
          chip.href = `/certifications/${saved.topSlug}`;
          chip.className = 'quiz-prev-result';
          chip.innerHTML = `last result: <strong>${top.emoji} ${escapeHtml(top.name)}</strong> →`;
          $('quizIntro')?.appendChild(chip);
        }
      }
    } catch {}
  });
})();
