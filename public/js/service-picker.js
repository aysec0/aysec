/* /hire — "Service Picker" quiz that matches a visitor to the right engagement. */
(() => {
  const SERVICES = {
    web:       { name: 'Web app pentest',         emoji: '🌐', price: 'from $12k',         duration: '~2 weeks',     subject: 'Web pentest for a SaaS app',  topic: 'pentest',
                 why: 'A 2-week deep dive on your web app and supporting APIs. Authenticated and unauthenticated testing, OWASP Top 10 + business-logic depth, clean report on day 14.' },
    ai:        { name: 'AI / LLM red team',       emoji: '🤖', price: 'from $18k',         duration: '2-3 weeks',    subject: 'AI / LLM red-team engagement', topic: 'ai',
                 why: 'End-to-end adversarial testing of an LLM application: prompt injection campaigns, indirect injection via your data sources, tool-use abuse, training data extraction, plus a remediation plan.' },
    training:  { name: 'Team training',           emoji: '🎓', price: 'from $8k',          duration: '3-5 days',     subject: 'Custom security training for our team', topic: '',
                 why: "Custom on-site or remote training for your engineering / security team. Web, binex, AI security, or red team. Lab-driven — your team writes real exploits by Friday." },
    advisory:  { name: 'Advisory hours',          emoji: '🧭', price: '$400/hr · 4hr min', duration: 'flexible',     subject: 'Advisory hours — security review',  topic: '',
                 why: 'Threat-model review, secure architecture sounding board, hiring help, "is this worth fixing" triage. Async design-doc review available at the same rate.' },
    speaking:  { name: 'Speaking / workshop',     emoji: '🎤', price: 'inquire',           duration: 'event-dependent', subject: 'Speaking / workshop invitation', topic: 'speaker',
                 why: 'Conference talks (cybersecurity, AI security, education) and half-day or full-day workshops.' },
    team_lic:  { name: 'Team licenses (training site)', emoji: '👥', price: 'from $39 / seat / year', duration: 'annual', subject: 'Team licenses for the training site', topic: 'team',
                 why: 'Bulk seats for 5+ engineers with centralized billing, a real invoice, and a private team leaderboard. Same-day quote on request.' },
  };

  const QUESTIONS = [
    {
      q: 'What outcome are you hoping for?',
      hint: 'Pick the one that matches what you\'d tell your boss.',
      options: [
        { label: 'Find security bugs in our product before attackers do',     scores: { web: 4, ai: 2 } },
        { label: 'Specifically test our LLM / AI application',                scores: { ai: 5 } },
        { label: 'Skill up our internal engineering / security team',         scores: { training: 4, team_lic: 3 } },
        { label: "I just need a security expert's brain on a problem",        scores: { advisory: 4 } },
      ],
    },
    {
      q: 'What is the asset or audience?',
      options: [
        { label: 'A web app / API serving real customers',                    scores: { web: 4 } },
        { label: 'An LLM-powered product / agent / RAG system',              scores: { ai: 5 } },
        { label: 'Our engineering team (10+ people)',                         scores: { training: 4, team_lic: 3 } },
        { label: 'A document / threat model / system design',                 scores: { advisory: 4 } },
      ],
    },
    {
      q: 'What\'s the timeline?',
      options: [
        { label: "It's flexible — quality > speed",                            scores: { web: 2, ai: 2, training: 2, team_lic: 1 } },
        { label: '2-4 weeks',                                                  scores: { web: 4, ai: 3 } },
        { label: 'A short focused engagement (a few days)',                    scores: { training: 4, advisory: 3 } },
        { label: 'A specific event we want to fill (conference, etc.)',        scores: { speaking: 5 } },
      ],
    },
    {
      q: 'What\'s the rough budget?',
      hint: 'Order of magnitude only — we\'ll always confirm in writing.',
      options: [
        { label: 'Under $5k',                                                  scores: { advisory: 4, speaking: 1, team_lic: 2 } },
        { label: '$5k-$15k',                                                   scores: { training: 4, web: 3, advisory: 1 } },
        { label: '$15k-$30k',                                                  scores: { web: 4, ai: 4 } },
        { label: '$30k+',                                                      scores: { ai: 3, web: 3, training: 2 } },
      ],
    },
    {
      q: 'How would you describe what you really want?',
      options: [
        { label: 'A real report I can give engineering on day 14',             scores: { web: 4, ai: 3 } },
        { label: 'My team writing real exploits by Friday',                   scores: { training: 5 } },
        { label: 'A clear plan for a hard architectural call',                scores: { advisory: 5 } },
        { label: 'A talk that lands well at our event',                       scores: { speaking: 5 } },
        { label: 'Per-seat licenses for our engineers to grind labs',         scores: { team_lic: 5 } },
      ],
    },
  ];

  let step = 0;
  let scores = {};
  const STORAGE_KEY = 'aysec.service-picker.history';
  function reset() { step = 0; scores = Object.fromEntries(Object.keys(SERVICES).map((k) => [k, 0])); }
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
    const [topKey, topScore] = ranked[0];
    const [altKey, altScore] = ranked[1] || [];
    const top = SERVICES[topKey];
    const alt = SERVICES[altKey];
    const total = Object.values(scores).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const topPct = Math.round((Math.max(0, topScore) / total) * 100);

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ topKey, altKey, scores, ts: Date.now() })); } catch {}

    $('quizResult').innerHTML = `
      <div class="quiz-result-eyebrow">// recommended engagement</div>
      <div class="quiz-result-card">
        <div class="quiz-result-emoji" aria-hidden="true">${top.emoji}</div>
        <div class="quiz-result-body">
          <div class="quiz-result-fit">${topPct}% match · ${escapeHtml(top.price)} · ${escapeHtml(top.duration)}</div>
          <h3 class="quiz-result-title">${escapeHtml(top.name)}</h3>
          <p class="quiz-result-why">${escapeHtml(top.why)}</p>
          <div class="quiz-result-actions">
            <button class="btn btn-primary" id="quizGoForm">Pre-fill the contact form →</button>
            <button class="btn btn-ghost" id="quizRestart">Retake quiz</button>
          </div>
        </div>
      </div>
      ${alt ? `
        <div class="quiz-alt">
          <div class="quiz-alt-label">also a fit</div>
          <a href="#contactForm" class="quiz-alt-card" id="quizAltLink">
            <span class="quiz-alt-emoji">${alt.emoji}</span>
            <div>
              <div class="quiz-alt-title">${escapeHtml(alt.name)}</div>
              <div class="quiz-alt-why">${escapeHtml(alt.price)} · ${escapeHtml(alt.duration)}</div>
            </div>
            <span class="quiz-alt-arrow">→</span>
          </a>
        </div>` : ''}
      <details class="quiz-breakdown">
        <summary>See full ranking</summary>
        ${ranked.map(([k, s]) => `
          <div class="quiz-breakdown-row">
            <span class="quiz-breakdown-name">${escapeHtml(SERVICES[k]?.name)}</span>
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
    $('quizGoForm')?.addEventListener('click', () => {
      // Pre-fill subject, then scroll the form into view
      const subj = document.getElementById('cf-subject');
      if (subj) subj.value = top.subject;
      const form = document.getElementById('contactForm');
      if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Briefly highlight the subject field
        if (subj) {
          subj.style.boxShadow = '0 0 0 3px var(--accent-soft)';
          setTimeout(() => { subj.style.boxShadow = ''; }, 1800);
        }
      }
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
      if (saved && saved.topKey && Date.now() - saved.ts < 1000 * 60 * 60 * 24 * 14) {
        const top = SERVICES[saved.topKey];
        if (top) {
          const chip = document.createElement('a');
          chip.href = '#contactForm';
          chip.className = 'quiz-prev-result';
          chip.innerHTML = `last match: <strong>${top.emoji} ${escapeHtml(top.name)}</strong> →`;
          $('quizIntro')?.appendChild(chip);
        }
      }
    } catch {}
  });
})();
