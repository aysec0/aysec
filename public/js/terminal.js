/* ===========================================================
   Interactive hero terminal
   - Real <input> mounted up-front (you can type during intro)
   - Intro animation renders above the input line
   - Command parser, history (↑/↓), tab completion, click-to-focus
   =========================================================== */
(() => {
  const body = document.getElementById('termBody');
  const win  = body?.closest('.terminal-window');
  if (!body || !win) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const TYPE_DELAY = 18;

  // ---------- Helpers ----------
  function escHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function scrollToBottom() { body.scrollTop = body.scrollHeight; }

  // ---------- Mount input line FIRST ----------
  // We anchor an "input line" at the bottom; intro and command output insert
  // BEFORE it via body.insertBefore(node, inputLine).
  const inputLine = document.createElement('div');
  inputLine.className = 'term-input-line';
  const promptSpan = document.createElement('span');
  promptSpan.className = 'term-prompt';
  promptSpan.textContent = '~$ ';
  inputLine.appendChild(promptSpan);

  const input = document.createElement('input');
  input.type = 'text';
  input.spellcheck = false;
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'terminal command');
  input.className = 'term-input';
  input.placeholder = "type 'help' and hit enter";
  inputLine.appendChild(input);

  body.appendChild(inputLine);
  win.classList.add('is-interactive');

  // ---------- Insert helpers (always above the input line) ----------
  function insertHTML(html, cls) {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.innerHTML = html;
    body.insertBefore(span, inputLine);
    return span;
  }
  function insertBR() {
    body.insertBefore(document.createElement('br'), inputLine);
  }
  function insertBlock(html, cls = 'term-output') {
    const div = document.createElement('div');
    div.className = cls;
    div.innerHTML = html;
    body.insertBefore(div, inputLine);
    return div;
  }

  async function typeBefore(cls, text, delay = TYPE_DELAY) {
    const span = document.createElement('span');
    span.className = cls;
    body.insertBefore(span, inputLine);
    if (reduceMotion) { span.textContent = text; return; }
    for (let i = 0; i < text.length; i++) {
      span.textContent += text[i];
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  function renderEnteredCommand(cmd) {
    const line = document.createElement('div');
    line.appendChild(Object.assign(document.createElement('span'), {
      className: 'term-prompt', textContent: '~$ ',
    }));
    if (cmd) {
      line.appendChild(Object.assign(document.createElement('span'), {
        className: 'term-cmd', textContent: cmd,
      }));
    }
    body.insertBefore(line, inputLine);
  }

  // ---------- Static data for commands ----------
  const HISTORY_KEY = 'aysec.term.history';
  const FILES = {
    'about.txt':   `aysec — security engineer · educator · ctf author\nReal name: Ammar Yasser. Currently focused on AI red-teaming + web app pentesting.\nMore at /about.`,
    'me.json':     `{\n  "alias":     "aysec",\n  "real_name": "Ammar Yasser",\n  "trade":     ["pentest", "ai-red-team", "training", "ctf"],\n  "stack":     ["burp", "ghidra", "python", "go"],\n  "available": true\n}`,
    'contact.txt': `Best ways to reach me:\n  hire me        → /hire\n  newsletter     → /newsletter\n  github         → (link in footer)\n  twitter / x    → (link in footer)\n  discord        → (link in footer)`,
    'resume.txt':  `Email me from /hire and I'll send the latest version.`,
    'flag.txt':    `nice try. flags belong on /challenges.`,
  };
  const PAGES = {
    courses: '/courses',  course: '/courses',
    ctf: '/challenges',   challenges: '/challenges',
    blog: '/community?cat=writeups', posts: '/community?cat=writeups', writeups: '/community?cat=writeups',
    community: '/community', forum: '/community',
    duels: '/duels',      duel: '/duels',
    home: '/',            about: '/about',
    hire: '/hire',        talks: '/talks',
    newsletter: '/newsletter',
    pricing: '/pricing',
    paths: '/tracks',     tracks: '/tracks',
    certs: '/certifications', certifications: '/certifications',
    dashboard: '/dashboard', profile: '/dashboard',
    roadmap: '/roadmap',  changelog: '/changelog',
    tools: '/tools',
    login: '/login',      signup: '/signup',
  };

  function helpText() {
    const rows = [
      ['help',          'show this help'],
      ['whoami',        'who am I'],
      ['ls',            'list directories on this site'],
      ['cat <file>',    `read a file (${Object.keys(FILES).join(', ')})`],
      ['open <page>',   `navigate (${Object.keys(PAGES).slice(0, 6).join(', ')}, …)`],
      ['cd <page>',     'alias for `open`'],
      ['theme [d|l]',   'toggle theme — `theme dark` or `theme light`'],
      ['social',        'social handles'],
      ['contact',       'how to reach me'],
      ['stats',         'platform stats (live)'],
      ['echo <text>',   'echo text back'],
      ['date',          'show current date/time'],
      ['history',       'show command history'],
      ['clear',         'clear the terminal'],
    ];
    return rows.map(([k, v]) =>
      `<span class="term-table-row"><span class="col-1">${escHtml(k.padEnd(14))}</span><span class="col-2">${escHtml(v)}</span></span>`
    ).join('\n') + '\n\n<span class="term-hint">tip: ↑/↓ for history, Tab for completion, Ctrl+L to clear.</span>';
  }

  async function fetchJson(p) {
    try { const r = await fetch(p); if (!r.ok) return null; return await r.json(); } catch { return null; }
  }

  // ---------- Commands ----------
  const COMMANDS = {
    help: () => helpText(),
    '?':  () => helpText(),

    whoami: () => `<span class="term-success">aysec</span> — security engineer · educator · ctf author\n<span class="term-info">Real name:</span> Ammar Yasser`,

    ls: () => {
      const dirs  = ['courses/', 'challenges/', 'tracks/', 'certifications/', 'blog/', 'tools/'];
      const files = Object.keys(FILES);
      return `<span class="term-info">${dirs.join('  ')}</span>\n` + files.join('  ');
    },

    cat: (args) => {
      const file = args[0];
      if (!file) return `<span class="term-error">cat: missing file operand</span>\nFiles: ${Object.keys(FILES).join(', ')}`;
      const name = file.replace(/^(\.\/|\/etc\/)/, '');
      if (FILES[name] === undefined) return `<span class="term-error">cat: ${escHtml(file)}: No such file or directory</span>`;
      return escHtml(FILES[name]);
    },

    open: (args) => {
      const page = (args[0] || '').toLowerCase();
      if (!page) return `<span class="term-error">open: usage</span>: open &lt;page&gt;\nKnown: ${Object.keys(PAGES).join(', ')}`;
      const url = PAGES[page];
      if (!url) return `<span class="term-error">open: unknown page '${escHtml(page)}'</span>\nTry: ${Object.keys(PAGES).slice(0, 8).join(', ')}…`;
      setTimeout(() => { location.href = url; }, 350);
      return `<span class="term-success">→</span> opening <span class="term-link">${url}</span> …`;
    },
    cd: (args) => COMMANDS.open(args),

    theme: (args) => {
      const t = (args[0] || '').toLowerCase();
      const root = document.documentElement;
      if (t === 'dark' || t === 'light') {
        root.setAttribute('data-theme', t);
        try { localStorage.setItem('theme', t); } catch {}
        return `<span class="term-success">theme set:</span> ${t}`;
      }
      const cur = root.getAttribute('data-theme') || 'dark';
      const next = cur === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch {}
      return `<span class="term-success">theme toggled:</span> ${next}`;
    },

    social: () =>
      `<span class="term-table-row"><span class="col-1">github</span><span class="col-2">github.com/aysec</span></span>\n` +
      `<span class="term-table-row"><span class="col-1">twitter / x</span><span class="col-2">x.com/aysec</span></span>\n` +
      `<span class="term-table-row"><span class="col-1">discord</span><span class="col-2">aysec community (link in footer)</span></span>\n` +
      `<span class="term-table-row"><span class="col-1">email</span><span class="col-2">use the form at /hire</span></span>`,

    contact: () => COMMANDS.cat(['contact.txt']),

    stats: async () => {
      const [c, ch, p, t, ce] = await Promise.all([
        fetchJson('/api/courses'), fetchJson('/api/challenges'),
        fetchJson('/api/posts'), fetchJson('/api/tracks'),
        fetchJson('/api/certifications'),
      ]);
      const lines = [
        ['courses',         (c?.courses || []).length],
        ['ctf challenges',  (ch?.challenges || []).length],
        ['learning paths',  (t?.tracks || []).length],
        ['cert prep paths', (ce?.certifications || []).length],
        ['blog posts',      (p?.posts || []).length],
      ];
      return lines.map(([k, v]) =>
        `<span class="term-table-row"><span class="col-1">${escHtml(k)}</span><span class="col-2">${v}</span></span>`
      ).join('\n');
    },

    echo: (_args, raw) => escHtml(raw.replace(/^\s*echo\s+/, '')),
    date: () => new Date().toString(),

    history: () => {
      if (!history.length) return '<span class="term-hint">(empty)</span>';
      return history.map((h, i) => `${String(i + 1).padStart(3, ' ')}  ${escHtml(h)}`).join('\n');
    },

    clear: () => '__CLEAR__',
    cls:   () => '__CLEAR__',

    // ---- Easter eggs ----
    sudo:   () => `<span class="term-warn">user is not in the sudoers file. This incident will be reported.</span>`,
    rm:     (args) => args.includes('-rf') && args.includes('/')
      ? `<span class="term-error">rm: cannot remove '/': Permission denied (also: please don't)</span>`
      : `<span class="term-error">rm: missing operand</span>`,
    exit:   () => `<span class="term-warn">there is no escape from the terminal.</span>`,
    quit:   () => COMMANDS.exit(),
    logout: () => COMMANDS.exit(),
    coffee: () => `<span class="term-warn">brewing… ☕</span>\n<span class="term-success">done.</span> output cup at /dev/desk`,
    matrix: () => {
      const chars = '01010110ﾊｸﾆｦｱｵｴｲ｜<>+#*';
      const lines = Array.from({ length: 5 }, () =>
        Array.from({ length: 60 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      );
      return `<span class="term-matrix">${lines.map((l, i) =>
        `<span style="animation-delay:${i * 80}ms">${escHtml(l)}</span>`
      ).join('<br>')}</span>`;
    },
    hack: () => `<span class="term-info">access granted.</span>\n<span class="term-warn">just kidding — try /challenges to actually hack things.</span>`,
    ping: (args) => {
      const target = args[0] || 'localhost';
      return `PING ${escHtml(target)}: 56 data bytes\n64 bytes from ${escHtml(target)}: time=0.4 ms\n<span class="term-success">--- pong ---</span>`;
    },
    fortune: () => {
      const lines = [
        "hack to learn. don't learn to hack.",
        'every bug is a missing assertion.',
        'reading source is a superpower.',
        "the best exploit is the one that fits in a tweet.",
        "if it's not in version control, it doesn't exist.",
      ];
      return `<span class="term-success">"${escHtml(lines[Math.floor(Math.random() * lines.length)])}"</span>`;
    },
  };

  // ---------- History ----------
  const history = [];
  let histIdx = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (Array.isArray(saved)) history.push(...saved.slice(-50));
    histIdx = history.length;
  } catch {}

  // ---------- Run a command ----------
  async function runCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === 'hack the planet') {
      return `<span class="term-info">crashing the gibson…</span> 🛸\n<span class="term-success">we are the phreaks. we are the kids.</span>`;
    }
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    history.push(trimmed);
    if (history.length > 50) history.shift();
    histIdx = history.length;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}

    if (!(cmd in COMMANDS)) {
      return `<span class="term-error">command not found:</span> ${escHtml(cmd)}\n<span class="term-hint">type 'help' for the list.</span>`;
    }
    try {
      return await COMMANDS[cmd](args, trimmed);
    } catch (e) {
      return `<span class="term-error">runtime error:</span> ${escHtml(String(e?.message || e))}`;
    }
  }

  // ---------- Tab completion ----------
  function tabComplete() {
    const cur = input.value;
    if (!cur) return;
    const parts = cur.split(/\s+/);
    if (parts.length === 1) {
      const matches = Object.keys(COMMANDS).filter((k) => k.startsWith(cur.toLowerCase()) && k !== '?');
      if (matches.length === 1) input.value = matches[0] + ' ';
      else if (matches.length > 1) {
        insertBlock(matches.join('  '), 'term-output term-hint');
      }
    } else if (parts[0] === 'open' || parts[0] === 'cd') {
      const matches = Object.keys(PAGES).filter((k) => k.startsWith((parts[1] || '').toLowerCase()));
      if (matches.length === 1) input.value = `${parts[0]} ${matches[0]}`;
    } else if (parts[0] === 'cat') {
      const matches = Object.keys(FILES).filter((k) => k.startsWith((parts[1] || '').toLowerCase()));
      if (matches.length === 1) input.value = `cat ${matches[0]}`;
    }
  }

  // ---------- Wire input ----------
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = input.value;
      input.value = '';
      // Short-circuit the intro if it's still running
      skipIntro = true;
      renderEnteredCommand(cmd);
      const out = await runCommand(cmd);
      if (out === '__CLEAR__') {
        while (body.firstChild && body.firstChild !== inputLine) body.removeChild(body.firstChild);
      } else if (out != null) {
        insertBlock(out);
      }
      scrollToBottom();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx > 0) { histIdx--; input.value = history[histIdx] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx < history.length) { histIdx++; input.value = history[histIdx] || ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      tabComplete();
    } else if (e.key.toLowerCase() === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      while (body.firstChild && body.firstChild !== inputLine) body.removeChild(body.firstChild);
    }
  });

  // Click anywhere in the terminal → focus input
  win.addEventListener('mousedown', (e) => {
    // Don't steal focus from text-selecting in output, only on bare clicks
    if (e.target.tagName === 'A' || e.target.tagName === 'INPUT') return;
    setTimeout(() => input.focus(), 0);
  });
  input.addEventListener('focus', () => win.classList.add('is-focused'));
  input.addEventListener('blur',  () => win.classList.remove('is-focused'));

  // Auto-focus when terminal scrolls into view
  if ('IntersectionObserver' in window) {
    let focused = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !focused) {
          focused = true;
          input.focus({ preventScroll: true });
        }
      });
    }, { threshold: 0.5 });
    io.observe(win);
  }

  // ---------- Intro animation (above the input line) ----------
  const introLines = [
    { t: 'prompt',  text: '~$ ',           wait: 200 },
    { t: 'cmd',     text: 'whoami',        wait: 350 },
    { t: 'br' },
    { t: 'out',     text: 'security engineer · educator · ctf author', wait: 500 },
    { t: 'br' },
    { t: 'br' },
    { t: 'prompt',  text: '~$ ',           wait: 250 },
    { t: 'cmd',     text: 'cat /etc/me.json', wait: 400 },
    { t: 'br' },
    { t: 'json',    text: '{',             wait: 60 },
    { t: 'json',    text: '  "alias":     "aysec",',                             wait: 60 },
    { t: 'json',    text: '  "trade":     ["pentest", "training", "ctf"],',     wait: 60 },
    { t: 'json',    text: '  "stack":     ["burp", "ghidra", "python", "go"],', wait: 60 },
    { t: 'json',    text: '  "available": true',                                 wait: 60 },
    { t: 'json',    text: '}',             wait: 100 },
    { t: 'br' },
    { t: 'br' },
  ];
  const COLOR_CLASS = {
    prompt:  'term-prompt',
    cmd:     'term-cmd',
    out:     'term-out',
    json:    'term-val',
    comment: 'term-comment',
  };

  let skipIntro = false;
  let introDone = false;

  // Skip intro on Esc anywhere; clicking in terminal doesn't skip (it focuses input).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') skipIntro = true;
  });

  async function runIntro() {
    for (const line of introLines) {
      if (skipIntro) break;
      if (line.t === 'br') { insertBR(); continue; }
      const cls = COLOR_CLASS[line.t] || 'term-out';
      if (line.t === 'cmd') {
        await typeBefore(cls, line.text);
      } else {
        insertHTML(escHtml(line.text), cls);
        if (line.t === 'json' || line.t === 'out' || line.t === 'comment') insertBR();
      }
      if (!skipIntro) await new Promise((r) => setTimeout(r, reduceMotion ? 0 : (line.wait || 0)));
    }
    introDone = true;
    insertBlock(
      `<span class="term-success">▸</span> shell ready. type <kbd>help</kbd> to begin · <kbd>↑</kbd> history · <kbd>Tab</kbd> complete · <kbd>Esc</kbd> skip intro`,
      'term-tip'
    );
    scrollToBottom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runIntro);
  } else {
    runIntro();
  }
})();
