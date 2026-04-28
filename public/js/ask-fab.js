/* Floating "Ask aysec" button — bottom-left FAB + popover chat.
   Suppressed on the full /ask page. Slim rule pool; falls back to /ask. */
(() => {
  if (location.pathname === '/ask' || location.pathname.startsWith('/ask/')) return;

  // Compact rule pool. Order matters — first match wins.
  const RULES = [
    {
      p: [/^(hi|hello|hey|sup|yo|hola)\b/i, /good (morning|afternoon|evening)/i],
      m: ["Hey — I'm the aysec tutor. Tell me what you're trying to learn (web, AI, OSCP, bug bounty, …) and I'll point you somewhere useful."],
    },
    {
      p: [/where (do|should|to) (i|we) (start|begin)/i, /(i'?m|im) (a )?(beginner|new|starting)/i, /from (zero|scratch)/i, /new to (this|cybersec|security)/i],
      m: [
        "Beginner-friendly path:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** — free foundation\n2. **[Linux Privesc](/courses/linux-privilege-escalation)** — free\n3. Solve **3-4 [easy CTF challenges](/challenges)**\n4. Pick a path on **[/courses#paths](/courses#paths)**",
      ],
    },
    {
      p: [/which (path|track|specialty|specialization)/i, /(career|learning) path/i, /pick (a )?(path|track|specialty)/i],
      m: ["Take the **[Path Finder quiz](/courses#paths)** — 6 questions, ranks the 4 paths by fit."],
    },
    {
      p: [/web (hack|app|pentest|security|bug)/i, /\b(sql|sqli|xss|csrf|ssrf|burp|owasp|api security)\b/i],
      m: [
        "Web hacking sequence:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** (free)\n2. **[API Security](/courses/api-security)**\n3. **[Bug Bounty Mastery](/courses/bug-bounty-mastery)**",
        "Practice on the [web CTFs](/challenges).",
      ],
    },
    {
      p: [/(ai|llm|chatgpt|gpt|claude|anthropic|prompt injection|jailbreak|rag)/i],
      m: [
        "AI security track:",
        "1. **[LLM Security Foundations](/courses/llm-security-foundations)** (free)\n2. **[AI Red Teaming](/courses/ai-red-teaming)**",
        "CTF: try **Polite Override** then **RAG Doll** on **[/challenges](/challenges)**.",
      ],
    },
    {
      p: [/(oscp|offsec|offensive security)/i],
      m: ["**[/certifications/oscp](/certifications/oscp)** — 7 mapped courses + an exam-day methodology course + 5 aligned CTFs."],
    },
    {
      p: [/(security\+|sec\+|comptia)/i, /\bceh\b|certified ethical hacker/i, /\b(crto|crtp|oswe|osep|pnpt)\b/i, /which cert/i, /best cert/i],
      m: ["Cert prep is at **[/certifications](/certifications)** — pick yours, see the mapped courses + CTFs for it."],
    },
    {
      p: [/(bug bounty|bounty|hackerone|h1|bugcrowd)/i],
      m: ["Bug-bounty path: **[Web Hacking 101](/courses/web-hacking-101)** → **[API Security](/courses/api-security)** → **[Bug Bounty Mastery](/courses/bug-bounty-mastery)**. Tools live at **[/tools](/tools)**."],
    },
    {
      p: [/\b(ctf|capture the flag|challenge|hackthebox|tryhackme|picoctf)\b/i],
      m: ["Browse **[/challenges](/challenges)** — start with the easy ones, sort by tag, climb the leaderboard."],
    },
    {
      p: [/\b(tool|toolbox|jwt decoder|hash|cidr|encoder|base64|cipher)\b/i],
      m: ["**[/tools](/tools)** — JWT decoder, hash ID/gen, encoders, CIDR calc, timestamp, UUID. Use the navbar **Tools** menu to jump to one."],
    },
    {
      p: [/\b(cloud|aws|azure|gcp|kubernetes|k8s)\b/i],
      m: ["Cloud track is at **[/certifications](/certifications)** under cloud-security cert prep. The **[aws-trail tool](/tools#oss)** is free."],
    },
    {
      p: [/(level|xp|tier|rank.*up|leaderboard)/i],
      m: ["15 themed level tiers from n00b to Legend. See **[/levels](/levels)**, your tier on **[/dashboard](/dashboard)**."],
    },
    {
      p: [/are you (chatgpt|claude|gpt|an llm|an ai)/i],
      m: ["Nope — hand-coded chatbot, ~13 rules. The full version with all rules lives at **[/ask](/ask)**."],
    },
    {
      p: [/(thanks|thank you|thx|ty)/i],
      m: ["Anytime. Now go solve something."],
    },
    {
      p: [/^(bye|goodbye|cya|peace|later)/i],
      m: ["GG. See you on the leaderboard."],
    },
  ];

  const FALLBACK = {
    m: [
      "I don't have a canned answer for that. Try a keyword: *web*, *AI*, *OSCP*, *cert*, *bug bounty*, *CTF*, *cloud*.",
      "Or open the **[full tutor](/ask)** for the deep version.",
    ],
  };

  const CHIPS = ['Where do I start?', 'OSCP prep', 'AI security', 'Bug bounty', 'Best cert?'];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function fmt(text) {
    let s = escapeHtml(text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);
    const lines = s.split(/\r?\n/);
    const out = [];
    let buf = null;
    for (const ln of lines) {
      const ulMatch = /^\* (.+)$/.exec(ln);
      const olMatch = /^\d+\. (.+)$/.exec(ln);
      if (ulMatch) {
        if (!buf || buf.tag !== 'ul') { if (buf) out.push(`<${buf.tag}>${buf.items.join('')}</${buf.tag}>`); buf = { tag: 'ul', items: [] }; }
        buf.items.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (!buf || buf.tag !== 'ol') { if (buf) out.push(`<${buf.tag}>${buf.items.join('')}</${buf.tag}>`); buf = { tag: 'ol', items: [] }; }
        buf.items.push(`<li>${olMatch[1]}</li>`);
      } else {
        if (buf) { out.push(`<${buf.tag}>${buf.items.join('')}</${buf.tag}>`); buf = null; }
        if (ln.trim()) out.push(`<div>${ln}</div>`);
      }
    }
    if (buf) out.push(`<${buf.tag}>${buf.items.join('')}</${buf.tag}>`);
    return out.join('');
  }

  function findRule(text) {
    const t = text.toLowerCase();
    for (const r of RULES) {
      if (r.p.some((p) => p.test(t))) return r;
    }
    return FALLBACK;
  }

  function makeFab() {
    const root = document.createElement('div');
    root.id = 'askFab';
    root.innerHTML = [
      '<button type="button" id="askFabBtn" class="ask-fab-btn" aria-label="Ask aysec" aria-expanded="false">',
      '  <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">',
      // Hooded figure outline + glowing ? in face cavity
      '    <path d="M16 2c-6 0-10 4-10 10v3c-2 1-3 3-3 5v8c0 1 1 2 2 2h22c1 0 2-1 2-2v-8c0-2-1-4-3-5v-3c0-6-4-10-10-10z" fill="currentColor" opacity="0.18"/>',
      '    <path d="M16 2c-6 0-10 4-10 10v3c-2 1-3 3-3 5v8c0 1 1 2 2 2h22c1 0 2-1 2-2v-8c0-2-1-4-3-5v-3c0-6-4-10-10-10z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
      '    <path d="M9 16c0-3.5 3-6 7-6s7 2.5 7 6c0 2.5-1.5 4-3.5 5l-2 1.5h-3l-2-1.5C10.5 20 9 18.5 9 16z" fill="#0a0d12"/>',
      '    <text x="16" y="20" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="700" font-size="9" fill="#39ff7a">?</text>',
      '  </svg>',
      '</button>',
      '<div id="askFabPanel" class="ask-fab-panel" hidden role="dialog" aria-label="Ask aysec">',
      '  <div class="ask-fab-head">',
      '    <div class="ask-fab-traffic">',
      '      <button type="button" class="ask-fab-tl tl-red"   id="askFabClose" aria-label="Close"></button>',
      '      <button type="button" class="ask-fab-tl tl-amber" id="askFabReset" aria-label="Reset"></button>',
      '      <span class="ask-fab-tl tl-green" aria-hidden="true"></span>',
      '    </div>',
      '    <div class="ask-fab-title">ask <span class="dim">— aysec tutor</span></div>',
      '  </div>',
      '  <div class="ask-fab-body" id="askFabBody"></div>',
      '  <div class="ask-fab-chips" id="askFabChips"></div>',
      '  <form class="ask-fab-form" id="askFabForm">',
      '    <input class="ask-fab-input" id="askFabInput" type="text" placeholder="ask anything…" autocomplete="off" />',
      '    <button class="ask-fab-send" type="submit" aria-label="Send">',
      '      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
      '    </button>',
      '  </form>',
      '</div>',
    ].join('');
    document.body.appendChild(root);

    const btn   = document.getElementById('askFabBtn');
    const panel = document.getElementById('askFabPanel');
    const body  = document.getElementById('askFabBody');
    const chips = document.getElementById('askFabChips');
    const form  = document.getElementById('askFabForm');
    const input = document.getElementById('askFabInput');
    const closeBtn = document.getElementById('askFabClose');
    const resetBtn = document.getElementById('askFabReset');

    let open = false;
    let greeted = false;

    function bubble(role, text) {
      const div = document.createElement('div');
      div.className = `ask-fab-msg ask-fab-${role}`;
      div.innerHTML = typeof text === 'string' ? fmt(text) : '';
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    function typing() {
      const div = document.createElement('div');
      div.className = 'ask-fab-msg ask-fab-bot ask-fab-typing-wrap';
      div.id = 'askFabTyping';
      div.innerHTML = '<div class="ask-fab-typing"><span></span><span></span><span></span></div>';
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    function clearTyping() {
      document.getElementById('askFabTyping')?.remove();
    }

    async function reply(rule) {
      typing();
      await new Promise((r) => setTimeout(r, 350));
      clearTyping();
      for (const m of rule.m) {
        bubble('bot', m);
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    function send(text) {
      const t = String(text || '').trim();
      if (!t) return;
      bubble('you', t);
      reply(findRule(t));
    }

    function greet() {
      if (greeted) return;
      greeted = true;
      setTimeout(() => bubble('bot', "Hey — I'm the aysec tutor. What are you trying to learn?"), 100);
      chips.innerHTML = CHIPS.map((c) => `<button type="button" class="ask-fab-chip">${c}</button>`).join('');
      chips.querySelectorAll('.ask-fab-chip').forEach((b) => {
        b.addEventListener('click', () => send(b.textContent));
      });
    }

    function setOpen(v) {
      open = v;
      panel.hidden = !v;
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      btn.classList.toggle('is-open', v);
      if (v) {
        // close any other popover (Tools dropdown, avatar menu)
        document.dispatchEvent(new CustomEvent('aysec:popover-open', { detail: { id: 'ask' } }));
        greet();
        setTimeout(() => input.focus(), 0);
      }
    }

    document.addEventListener('aysec:popover-open', (e) => {
      if (e.detail?.id !== 'ask' && open) setOpen(false);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!open);
    });

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setOpen(false);
    });

    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      body.innerHTML = '';
      greeted = false;
      greet();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      send(v);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    });

    document.addEventListener('click', (e) => {
      if (!open) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      setOpen(false);
    });
  }

  // Wait for body
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', makeFab);
  } else {
    makeFab();
  }
})();
