/* /tracks — "Path Finder" quiz that recommends a learning path. */
(() => {
  // Path slugs must match seeded tracks
  const PATH_META = {
    'web-pentester-path':   { title: 'Web Pentester Path',         emoji: '🌐', why: 'You want to find bugs that live in web apps and APIs. Bug bounty, full pentests, the OWASP Top 10 done right.' },
    'ai-red-teamer-path':   { title: 'AI Red Teamer Path',         emoji: '🤖', why: 'You want to specialize in LLM / AI app security — the hottest specialty currently hiring.' },
    'red-teamer-path':      { title: 'Red Teamer Path',            emoji: '🥷', why: 'You want to do end-to-end offensive operations: AD, lateral movement, evasion, the full simulation.' },
    'cloud-security-path':  { title: 'Cloud Security Specialist',  emoji: '☁️', why: 'You want to attack and defend cloud infrastructure where the real money — and the real bugs — live.' },
  };

  const QUESTIONS = [
    {
      q: 'Where does your gut pull you in cybersecurity?',
      hint: 'Pick the one that genuinely excites you, not the one with the highest salary.',
      options: [
        { label: 'Finding bugs in web apps & APIs',         scores: { 'web-pentester-path': 3, 'ai-red-teamer-path': 1, 'red-teamer-path': 1, 'cloud-security-path': 1 } },
        { label: 'Breaking into corporate networks (AD, red team)', scores: { 'red-teamer-path': 3, 'web-pentester-path': 1, 'cloud-security-path': 1 } },
        { label: 'Securing AI / LLM applications',          scores: { 'ai-red-teamer-path': 3, 'web-pentester-path': 1, 'cloud-security-path': 1 } },
        { label: 'Attacking cloud (AWS, IAM, Lambda)',      scores: { 'cloud-security-path': 3, 'red-teamer-path': 1, 'web-pentester-path': 1 } },
      ],
    },
    {
      q: "Where are you starting from?",
      hint: 'Be honest — the wrong-fit path is a recipe for quitting.',
      options: [
        { label: 'Total beginner — first cybersec course',  scores: { 'web-pentester-path': 3, 'ai-red-teamer-path': 1, 'cloud-security-path': 1 } },
        { label: 'Comfortable with web + Linux basics',     scores: { 'web-pentester-path': 2, 'ai-red-teamer-path': 2, 'cloud-security-path': 2 } },
        { label: 'Done CTFs, some pentesting',              scores: { 'red-teamer-path': 2, 'web-pentester-path': 1, 'cloud-security-path': 1, 'ai-red-teamer-path': 1 } },
        { label: 'Working pentester wanting to specialize', scores: { 'red-teamer-path': 2, 'ai-red-teamer-path': 2, 'cloud-security-path': 2 } },
      ],
    },
    {
      q: 'Honest weekly study time you can commit?',
      hint: "Pick the time you'll actually have, not the time you wish you had.",
      options: [
        { label: '5-10 hours / week',  scores: { 'web-pentester-path': 2, 'ai-red-teamer-path': 2, 'cloud-security-path': 1 } },
        { label: '10-15 hours / week', scores: { 'web-pentester-path': 2, 'cloud-security-path': 2, 'red-teamer-path': 1, 'ai-red-teamer-path': 1 } },
        { label: '15+ hours / week',   scores: { 'red-teamer-path': 3, 'cloud-security-path': 1, 'ai-red-teamer-path': 1 } },
      ],
    },
    {
      q: 'How do you feel about AI / LLMs?',
      options: [
        { label: 'I want to specialize in it',           scores: { 'ai-red-teamer-path': 4 } },
        { label: 'Curious — happy if my path includes it', scores: { 'ai-red-teamer-path': 1, 'web-pentester-path': 1, 'cloud-security-path': 1 } },
        { label: "Not the focus right now",              scores: { 'web-pentester-path': 1, 'red-teamer-path': 2, 'cloud-security-path': 2, 'ai-red-teamer-path': -2 } },
      ],
    },
    {
      q: "What's your strongest skill right now?",
      options: [
        { label: 'Reading code well',                    scores: { 'web-pentester-path': 2, 'ai-red-teamer-path': 2, 'cloud-security-path': 1 } },
        { label: 'Systems / networking / Windows',       scores: { 'red-teamer-path': 3, 'cloud-security-path': 1 } },
        { label: 'DevOps / SRE / cloud platforms',       scores: { 'cloud-security-path': 3, 'red-teamer-path': 1, 'ai-red-teamer-path': 1 } },
        { label: "I'm a generalist — equal across them", scores: { 'web-pentester-path': 1, 'red-teamer-path': 1, 'ai-red-teamer-path': 1, 'cloud-security-path': 1 } },
      ],
    },
    {
      q: 'Where do you want to be in 18 months?',
      hint: 'The career outcome that gets you out of bed.',
      options: [
        { label: 'Bug bounty hunter / web pentester',     scores: { 'web-pentester-path': 4 } },
        { label: 'Red teamer at a consulting firm',       scores: { 'red-teamer-path': 4 } },
        { label: 'AI security engineer at a frontier lab', scores: { 'ai-red-teamer-path': 4 } },
        { label: 'Cloud security engineer / CSPM owner',  scores: { 'cloud-security-path': 4 } },
      ],
    },
  ];

  // ---------- State ----------
  let step = 0;
  let scores = {};
  const STORAGE_KEY = 'aysec.quiz.history';

  function reset() {
    step = 0;
    scores = Object.fromEntries(Object.keys(PATH_META).map((k) => [k, 0]));
  }

  function $(id) { return document.getElementById(id); }
  function show(id) { const el = $(id); if (el) el.hidden = false; }
  function hide(id) { const el = $(id); if (el) el.hidden = true; }

  // ---------- Render ----------
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
    if (step + 1 < QUESTIONS.length) {
      step++;
      renderQuestion();
    } else {
      finish();
    }
  }

  function back() {
    if (step === 0) return;
    // Reset scores by replaying answers — simpler: just recompute from scratch via stored selections.
    // We don't store selections per step here; cheap shortcut = back means restart.
    reset();
    renderQuestion();
  }

  // ---------- Result ----------
  function finish() {
    hide('quizActive');
    show('quizResult');

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topSlug, topScore] = ranked[0];
    const [altSlug, altScore] = ranked[1] || [];
    const top = PATH_META[topSlug];
    const alt = PATH_META[altSlug];
    const total = Object.values(scores).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const topPct = Math.round((Math.max(0, topScore) / total) * 100);
    const altPct = altScore != null ? Math.round((Math.max(0, altScore) / total) * 100) : 0;

    // Persist most recent result so refresh keeps the recommendation
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ topSlug, altSlug, scores, ts: Date.now() }));
    } catch {}

    $('quizResult').innerHTML = `
      <div class="quiz-result-eyebrow">// your match</div>
      <div class="quiz-result-card">
        <div class="quiz-result-emoji" aria-hidden="true">${top.emoji}</div>
        <div class="quiz-result-body">
          <div class="quiz-result-fit">${topPct}% match</div>
          <h3 class="quiz-result-title">${escapeHtml(top.title)}</h3>
          <p class="quiz-result-why">${escapeHtml(top.why)}</p>
          <div class="quiz-result-actions">
            <a href="/tracks/${escapeHtml(topSlug)}" class="btn btn-primary">View this path →</a>
            <button class="btn btn-ghost" id="quizRestart">Retake quiz</button>
          </div>
        </div>
      </div>
      ${alt ? `
        <div class="quiz-alt">
          <div class="quiz-alt-label">also a strong fit (${altPct}%)</div>
          <a href="/tracks/${escapeHtml(altSlug)}" class="quiz-alt-card">
            <span class="quiz-alt-emoji">${alt.emoji}</span>
            <div>
              <div class="quiz-alt-title">${escapeHtml(alt.title)}</div>
              <div class="quiz-alt-why">${escapeHtml(alt.why)}</div>
            </div>
            <span class="quiz-alt-arrow">→</span>
          </a>
        </div>` : ''}

      <details class="quiz-breakdown">
        <summary>See full score breakdown</summary>
        ${ranked.map(([slug, s]) => `
          <div class="quiz-breakdown-row">
            <span class="quiz-breakdown-name">${escapeHtml(PATH_META[slug]?.title || slug)}</span>
            <span class="quiz-breakdown-bar"><span style="width:${Math.max(0, Math.round((Math.max(0, s) / total) * 100))}%"></span></span>
            <span class="quiz-breakdown-pct">${Math.max(0, s)}</span>
          </div>`).join('')}
      </details>
    `;

    $('quizRestart')?.addEventListener('click', () => {
      reset();
      hide('quizResult');
      show('quizActive');
      renderQuestion();
    });

    // Smooth scroll to the result
    $('quizResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    const startBtn = $('quizStart');
    const exitBtn  = $('quizExit');
    const backBtn  = $('quizBack');
    if (!startBtn) return;

    startBtn.addEventListener('click', () => {
      reset();
      hide('quizIntro');
      hide('quizResult');
      show('quizActive');
      renderQuestion();
      $('quizActive').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    exitBtn?.addEventListener('click', () => {
      reset();
      hide('quizActive');
      hide('quizResult');
      show('quizIntro');
    });
    backBtn?.addEventListener('click', back);

    // Restore last result on revisit
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.scores && Date.now() - saved.ts < 1000 * 60 * 60 * 24 * 14) {
        scores = saved.scores;
        // Show "you took this recently" preview chip on the intro
        const top = PATH_META[saved.topSlug];
        if (top) {
          const chip = document.createElement('a');
          chip.href = `/tracks/${saved.topSlug}`;
          chip.className = 'quiz-prev-result';
          chip.innerHTML = `last result: <strong>${top.emoji} ${escapeHtml(top.title)}</strong> →`;
          $('quizIntro')?.appendChild(chip);
        }
      }
    } catch {}
  });
})();
