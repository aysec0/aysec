/* /challenges — "CTF Placement" quiz: short, recommends a starter challenge. */
(() => {
  // Curated starter challenges per category × difficulty bucket
  // (matches what's in the seeded challenges)
  const STARTERS = {
    web:        { easy: 'idor-edition',    medium: 'proto-pollution',  hard: 'cache-deception' },
    crypto:     { easy: 'tiny-e',           medium: 'xor-the-king',    hard: 'tiny-e' },
    pwn:        { easy: 'license-please',   medium: 'license-please',  hard: 'format-fiesta' },
    rev:        { easy: 'license-please',   medium: 'license-please',  hard: 'dont-call-me-vm' },
    forensics:  { easy: 'memory-lane',      medium: 'pcap-tunnel-vision', hard: 'pcap-tunnel-vision' },
    ai:         { easy: 'polite-override',  medium: 'rag-doll',        hard: 'hallucinated-shell' },
    misc:       { easy: 'not-a-cat',        medium: 'osint-the-leak',  hard: 'osint-the-leak' },
  };

  const CATEGORY_LABELS = {
    web: 'Web Exploitation', crypto: 'Cryptography', pwn: 'Binary Exploitation',
    rev: 'Reverse Engineering', forensics: 'Forensics', ai: 'AI / LLM Security',
    misc: 'Miscellaneous',
  };

  const QUESTIONS = [
    {
      q: 'How much CTF have you done?',
      options: [
        { label: 'First time / zero solves',           scores: { difficulty: { easy: 4 } } },
        { label: 'A handful — I know what a flag is',   scores: { difficulty: { easy: 3, medium: 1 } } },
        { label: 'Solved 20+ challenges across categories', scores: { difficulty: { medium: 3, hard: 1 } } },
        { label: 'Regular CTF player',                  scores: { difficulty: { medium: 2, hard: 4 } } },
      ],
    },
    {
      q: 'What are you most curious about right now?',
      hint: "Pick what excites you — you'll work harder on it.",
      options: [
        { label: 'Web bugs (SQL injection, IDOR, SSRF)', scores: { category: { web: 4 } } },
        { label: 'Crypto — making/breaking ciphers',      scores: { category: { crypto: 4 } } },
        { label: 'Binary — pwning C programs',            scores: { category: { pwn: 4 } } },
        { label: 'Reverse engineering — Ghidra, GDB',     scores: { category: { rev: 4 } } },
      ],
    },
    {
      q: 'Or — these other categories?',
      hint: 'Only pick something here if it pulls you stronger than your previous answer.',
      options: [
        { label: "Stick with my previous pick",           scores: {} },
        { label: 'Forensics — packets, memory dumps',     scores: { category: { forensics: 5 } } },
        { label: 'AI / LLM security — prompt injection',  scores: { category: { ai: 5 } } },
        { label: 'OSINT / steg / random misc puzzles',    scores: { category: { misc: 5 } } },
      ],
    },
    {
      q: "Comfort level when you're stuck?",
      options: [
        { label: 'I want hints — guide me',                       scores: { difficulty: { easy: 3 } } },
        { label: 'I prefer to struggle a bit before peeking',     scores: { difficulty: { medium: 3 } } },
        { label: 'I want it brutal — no hints',                   scores: { difficulty: { hard: 4, medium: 1 } } },
      ],
    },
  ];

  let step = 0;
  let scores = { difficulty: {}, category: {} };
  const STORAGE_KEY = 'aysec.ctf-placement.history';
  function reset() { step = 0; scores = { difficulty: {}, category: {} }; }
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
    if (opt.scores.difficulty) {
      Object.entries(opt.scores.difficulty).forEach(([k, v]) => { scores.difficulty[k] = (scores.difficulty[k] || 0) + v; });
    }
    if (opt.scores.category) {
      Object.entries(opt.scores.category).forEach(([k, v]) => { scores.category[k] = (scores.category[k] || 0) + v; });
    }
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

    // Pick best difficulty + category
    const diffOrder = Object.entries(scores.difficulty).sort((a, b) => b[1] - a[1]);
    const catOrder  = Object.entries(scores.category).sort((a, b) => b[1] - a[1]);
    const difficulty = diffOrder[0]?.[0] || 'easy';
    const category   = catOrder[0]?.[0]  || 'web';
    const starterSlug = STARTERS[category]?.[difficulty] || STARTERS.web.easy;
    const altCat = catOrder[1]?.[0];
    const altSlug = altCat ? STARTERS[altCat]?.[difficulty] : null;

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ difficulty, category, starterSlug, ts: Date.now() })); } catch {}

    const diffLabel = difficulty[0].toUpperCase() + difficulty.slice(1);
    const diffEmoji = { easy: '🟢', medium: '🟡', hard: '🔴' }[difficulty] || '⚪';

    $('quizResult').innerHTML = `
      <div class="quiz-result-eyebrow">// your placement</div>
      <div class="quiz-result-card">
        <div class="quiz-result-emoji" aria-hidden="true">${diffEmoji}</div>
        <div class="quiz-result-body">
          <div class="quiz-result-fit">start with · ${escapeHtml(diffLabel)} · ${escapeHtml(CATEGORY_LABELS[category] || category)}</div>
          <h3 class="quiz-result-title">Try this one first</h3>
          <p class="quiz-result-why">Based on your answers, this challenge is in the right category and at the right difficulty for where you are right now. If you crush it, level up. If you struggle for 30 minutes, peek at the hint.</p>
          <div class="quiz-result-actions">
            <a href="/challenges/${escapeHtml(starterSlug)}" class="btn btn-primary">Open the challenge →</a>
            <button class="btn btn-ghost" id="quizRestart">Retake quiz</button>
          </div>
        </div>
      </div>
      ${altCat && altSlug && altSlug !== starterSlug ? `
        <div class="quiz-alt">
          <div class="quiz-alt-label">if that one's not for you, try</div>
          <a href="/challenges/${escapeHtml(altSlug)}" class="quiz-alt-card">
            <span class="quiz-alt-emoji">${diffEmoji}</span>
            <div>
              <div class="quiz-alt-title">${escapeHtml(CATEGORY_LABELS[altCat] || altCat)} · ${escapeHtml(diffLabel)}</div>
              <div class="quiz-alt-why">A second-best fit based on your category preference.</div>
            </div>
            <span class="quiz-alt-arrow">→</span>
          </a>
        </div>` : ''}
      <details class="quiz-breakdown" style="margin-top:1.25rem;">
        <summary>How we picked</summary>
        <div class="quiz-breakdown-row" style="grid-template-columns: 1fr;">
          <span class="quiz-breakdown-name">
            <strong>Difficulty:</strong> ${escapeHtml(diffLabel)} · <strong>Category:</strong> ${escapeHtml(CATEGORY_LABELS[category] || category)}.
            We picked the highest-scoring difficulty bucket and category from your answers, then mapped to a hand-curated starter for that pair. The full grid is at <a href="#" onclick="window.scrollTo({top:document.querySelector('#categoryStack')?.offsetTop || 0,behavior:'smooth'});return false;">the challenge list below</a>.
          </span>
        </div>
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
      if (saved && saved.starterSlug && Date.now() - saved.ts < 1000 * 60 * 60 * 24 * 14) {
        const chip = document.createElement('a');
        chip.href = `/challenges/${saved.starterSlug}`;
        chip.className = 'quiz-prev-result';
        chip.innerHTML = `last placement: <strong>${escapeHtml(saved.difficulty)} · ${escapeHtml(CATEGORY_LABELS[saved.category] || saved.category)}</strong> →`;
        $('quizIntro')?.appendChild(chip);
      }
    } catch {}
  });
})();
