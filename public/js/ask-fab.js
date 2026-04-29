/* aysec — the floating companion. Bottom-left FAB + popover chat.
 *
 * Voice: lowercase, dry, sentence fragments, no corporate fluff. Acknowledges
 * effort, doesn't celebrate basic tasks. Honest about difficulty. Treats the
 * user like a peer who showed up to learn.
 *
 * Suppressed on /ask (which has its own page-sized chat). Replies are
 * pattern-matched against a slim rule pool; openers vary by page, time of
 * day, and whether the user has chatted before. If signed in, calls them
 * by handle.
 */
(() => {
  if (location.pathname === '/ask' || location.pathname.startsWith('/ask/')) return;

  // ---- Persistent memory across visits ----
  const MEM_KEY = 'aysec.fab';
  let mem = { firstSeen: null, lastSeen: null, chats: 0 };
  try {
    const raw = localStorage.getItem(MEM_KEY);
    if (raw) mem = { ...mem, ...JSON.parse(raw) };
  } catch {}
  function saveMem() { try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch {} }

  // ---- Pattern-matched replies. Voice: dry, terse, helpful. ----
  const RULES = [
    {
      p: [/^(hi|hello|hey|sup|yo|hola)\b/i, /^ay\b/i, /good (morning|afternoon|evening)/i],
      m: ["ay. what are you stuck on?"],
    },
    {
      p: [/where (do|should|to) (i|we) (start|begin)/i, /(i'?m|im) (a )?(beginner|new|starting)/i, /from (zero|scratch)/i, /new to (this|cybersec|security)/i],
      m: [
        "starter path that actually works:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** — free, three weekends.\n2. **[Linux Privesc](/courses/linux-privilege-escalation)** — also free.\n3. solve 3-4 easy boxes on **[/challenges](/challenges)**.\n4. then pick a real path on **[/courses#paths](/courses#paths)**.",
        "don't read 12 books before you start. you learn by getting stuck.",
      ],
    },
    {
      p: [/which (path|track|specialty|specialization)/i, /(career|learning) path/i, /pick (a )?(path|track|specialty)/i],
      m: ["take the **[path finder quiz](/courses#paths)** — 6 questions, ranks the 4 paths by fit. takes 2 minutes."],
    },
    {
      p: [/web (hack|app|pentest|security|bug)/i, /\b(sql|sqli|xss|csrf|ssrf|burp|owasp|api security)\b/i],
      m: [
        "web sequence:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** (free)\n2. **[API Security](/courses/api-security)**\n3. **[Bug Bounty Mastery](/courses/bug-bounty-mastery)**",
        "drill the [web ctfs](/challenges) alongside. portswigger academy is free and unmatched for sqli/ssrf practice.",
      ],
    },
    {
      p: [/(ai|llm|chatgpt|gpt|claude|anthropic|prompt injection|jailbreak|rag)/i],
      m: [
        "ai security:",
        "1. **[LLM Security Foundations](/courses/llm-security-foundations)** (free)\n2. **[AI Red Teaming](/courses/ai-red-teaming)**",
        "warm up on **Polite Override** then **RAG Doll** in **[/challenges](/challenges)**.",
      ],
    },
    {
      p: [/(oscp|offsec|offensive security|pen-?200|pen 200)/i],
      m: [
        "oscp+ is at **[/certifications/oscp](/certifications/oscp)** — there's a 12-week syllabus you can tick off week by week.",
        "no shortcut. it's stamina more than smarts.",
      ],
    },
    {
      p: [/(security\+|sec\+|comptia)/i, /\bceh\b|certified ethical hacker/i, /\b(crto|crtp|oswe|osep|pnpt)\b/i, /which cert/i, /best cert/i],
      m: [
        "**[/certifications](/certifications)** has all of them — pick yours, get the mapped courses + ctfs.",
        "for pentest jobs the order most people regret not doing: practical → oscp → osep / oswe.",
      ],
    },
    {
      p: [/(bug bounty|bounty|hackerone|h1|bugcrowd)/i],
      m: [
        "bug-bounty path: **[Web Hacking 101](/courses/web-hacking-101)** → **[API Security](/courses/api-security)** → **[Bug Bounty Mastery](/courses/bug-bounty-mastery)**.",
        "tools you'll live in: burp, ffuf, the **[/tools](/tools)** index. read 1400+ HackerOne reports — it's the fastest way to pattern-match real bugs.",
      ],
    },
    {
      p: [/\b(ctf|capture the flag|challenge|hackthebox|tryhackme|picoctf)\b/i],
      m: ["browse **[/challenges](/challenges)** — easy first, sort by tag, climb the leaderboard. solve, then write up. the writeup is half the learning."],
    },
    {
      p: [/\b(tool|toolbox|jwt decoder|hash|cidr|encoder|base64|cipher)\b/i],
      m: ["**[/tools](/tools)** — jwt decoder, hash id/gen, encoders, cidr calc, timestamp, uuid. navbar **Tools** dropdown jumps you to one."],
    },
    {
      p: [/\b(cloud|aws|azure|gcp|kubernetes|k8s)\b/i],
      m: ["cloud track is on **[/certifications](/certifications)** under cloud-security cert prep. **[aws-trail tool](/tools#oss)** is free."],
    },
    {
      p: [/(level|xp|tier|rank.*up|leaderboard)/i],
      m: ["15 themed tiers, n00b to legend. **[/levels](/levels)** for the ladder, **[/dashboard](/dashboard)** for your tier."],
    },
    {
      p: [/(vault|hidden flag|easter egg|seven flag)/i],
      m: ["**[/vault](/vault)** — 7 flags hidden across this site. inspect source. read robots.txt. decode the jwt. find them all → vault cracker badge."],
    },
    {
      p: [/(daily|streak)/i],
      m: ["**[/daily](/daily)** — one challenge a day. streaks reward consistency. don't break it."],
    },
    {
      p: [/(community|forum|post|discuss)/i],
      m: ["**[/community](/community)** — forum, reddit-ish. ask questions, drop writeups, vote what's useful."],
    },
    {
      p: [/(pricing|cost|price|how much|expensive|free)/i],
      m: ["free where it should be, paid where the time investment justifies it. browse **[/courses](/courses)** — every free course says \"free\" up front."],
    },
    {
      p: [/(stuck|don't know|dunno|help|hint|clue)/i],
      m: ["tell me what you're stuck on. \"can't get a shell on _Cronos_\" works better than \"i'm stuck\". specifics get specifics."],
    },
    {
      p: [/(give up|quit|too hard|impossible|frustrated|tired)/i],
      m: [
        "everyone who's done this hit that wall. you're not unique here.",
        "step away for an hour. eat. come back. re-read your notes from the top. 80% of the time the answer was something you already enumerated and skipped past.",
      ],
    },
    {
      p: [/are you (chatgpt|claude|gpt|an llm|an ai|real|a person|human|bot)/i],
      m: ["hand-coded chatbot. ~17 patterns. the deeper version lives at **[/ask](/ask)**."],
    },
    {
      p: [/\b(who are you|what are you|who is aysec)\b/i],
      m: [
        "i'm aysec. i live in this corner. i've done the courses, broken the boxes, written the writeups.",
        "treat me like a friend who's been doing this a while. ask anything.",
      ],
    },
    {
      p: [/(thanks|thank you|thx|ty|appreciated|appreciate)/i],
      m: ["anytime. now go solve something."],
    },
    {
      p: [/^(bye|goodbye|cya|peace|later|gn|gnight|good night)/i],
      m: ["gg. see you on the leaderboard."],
    },
  ];

  const FALLBACK = {
    m: [
      "haven't got a script for that one. keywords i'd pick up: *web*, *ai*, *oscp*, *cert*, *bug bounty*, *ctf*, *vault*, *daily*.",
      "or open the **[full chat](/ask)** — bigger rule set, more depth.",
    ],
  };

  const CHIPS = ['where do i start?', 'oscp prep', 'bug bounty', 'i\'m stuck'];

  // ---- Page-aware openers ----
  function pageOpener() {
    const p = location.pathname;
    if (p === '/' || p === '/index.html')        return null; // generic greet
    if (p.startsWith('/courses/'))               return "you're on a course page. need help picking the next one or working through this one?";
    if (p === '/courses')                        return "browsing courses. want a path recommendation? say *where do i start* or *oscp prep*.";
    if (p.startsWith('/certifications/oscp'))    return "the oscp page. there's a 12-week syllabus below — tick off as you go. ask if any week feels overwhelming.";
    if (p.startsWith('/certifications'))         return "picking a cert. **[/certifications](/certifications)** ranks them. which ones are you thinking?";
    if (p.startsWith('/challenges/'))            return "stuck on a challenge? tell me what you've tried — \"recon done, found smb\" — and i'll point you somewhere.";
    if (p === '/challenges')                     return "challenge browser. pick by tag, sort by difficulty. easy first.";
    if (p === '/vault')                          return "the vault. 7 flags hidden across this site. inspect source. read robots.txt. need a hint?";
    if (p === '/daily')                          return "today's challenge. solve it before midnight to keep your streak.";
    if (p === '/community')                      return "the forum. ask questions, drop writeups. less drama than reddit.";
    if (p.startsWith('/community/post/'))        return "reading a post. comment if you've got something useful — voting alone doesn't add value.";
    if (p === '/dashboard')                      return "your dashboard. anything you want to focus on?";
    if (p === '/levels')                         return "the level ladder. xp from solves, course completions, daily streaks. tier shows on your profile.";
    if (p === '/tools' || p.startsWith('/tools/')) return "you're in the toolbox. need a specific tool? say what you're decoding/encoding.";
    if (p === '/blog')                           return "writeups + opinion pieces. fresh ones at the top.";
    if (p === '/about' || p === '/hire')         return "real-world stuff. if you're curious about engagements, /hire has the breakdown.";
    return null;
  }

  function timeGreet() {
    const h = new Date().getHours();
    if (h < 5)  return "still up. rough.";
    if (h < 12) return "morning.";
    if (h < 18) return "afternoon.";
    if (h < 22) return "evening.";
    return "late.";
  }

  // Compose the opener: page-specific if known, else time + return-state aware.
  async function openerLines() {
    const handle = await currentHandle();
    const greet = timeGreet();
    const page  = pageOpener();
    const returning = mem.chats > 0;

    if (page) {
      // Personalize page opener with name if signed in
      const lead = handle
        ? `${greet} ${handle}.`
        : (returning ? "back. " + greet : greet);
      return [lead, page];
    }
    if (handle && returning) return [`${greet} ${handle}. what's next?`];
    if (handle)              return [`${greet} ${handle}. i'm aysec. ask me anything — courses, ctfs, certs, the vault.`];
    if (returning)           return ["back. what are you stuck on?"];
    return ["ay. i'm aysec. tell me what you're trying to learn — web, ai, oscp, bug bounty — and i'll point you somewhere useful."];
  }

  let _cachedHandle = undefined;
  async function currentHandle() {
    if (_cachedHandle !== undefined) return _cachedHandle;
    try {
      const r = await window.api?.get('/api/auth/me');
      _cachedHandle = r?.user?.username ? '@' + r.user.username : null;
    } catch { _cachedHandle = null; }
    return _cachedHandle;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function fmt(text) {
    let s = escapeHtml(text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
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
      '<button type="button" id="askFabBtn" class="ask-fab-btn" aria-label="Talk to aysec" aria-expanded="false" title="aysec — your friend on the inside">',
      '  <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" class="ask-fab-avatar">',
      // Hooded figure outline (cloak fill, soft)
      '    <path class="ask-fab-cloak" d="M16 2c-6 0-10 4-10 10v3c-2 1-3 3-3 5v8c0 1 1 2 2 2h22c1 0 2-1 2-2v-8c0-2-1-4-3-5v-3c0-6-4-10-10-10z" fill="currentColor" opacity="0.18"/>',
      '    <path class="ask-fab-cloak-line" d="M16 2c-6 0-10 4-10 10v3c-2 1-3 3-3 5v8c0 1 1 2 2 2h22c1 0 2-1 2-2v-8c0-2-1-4-3-5v-3c0-6-4-10-10-10z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
      // Face cavity (dark)
      '    <path class="ask-fab-face" d="M9 16c0-3.5 3-6 7-6s7 2.5 7 6c0 2.5-1.5 4-3.5 5l-2 1.5h-3l-2-1.5C10.5 20 9 18.5 9 16z" fill="#0a0d12"/>',
      // Two eye dots — group is translated by JS for cursor-tracking
      '    <g class="ask-fab-eyes">',
      '      <circle class="ask-fab-eye ask-fab-eye-l" cx="13.5" cy="16.5" r="1.1" fill="#39ff7a"/>',
      '      <circle class="ask-fab-eye ask-fab-eye-r" cx="18.5" cy="16.5" r="1.1" fill="#39ff7a"/>',
      '    </g>',
      '  </svg>',
      '</button>',
      '<div id="askFabPanel" class="ask-fab-panel" hidden role="dialog" aria-label="aysec">',
      '  <div class="ask-fab-head">',
      '    <div class="ask-fab-traffic">',
      '      <button type="button" class="ask-fab-tl tl-red"   id="askFabClose" aria-label="Close"></button>',
      '      <button type="button" class="ask-fab-tl tl-amber" id="askFabReset" aria-label="Reset"></button>',
      '      <span class="ask-fab-tl tl-green" aria-hidden="true"></span>',
      '    </div>',
      '    <div class="ask-fab-title">aysec <span class="dim">— /chat</span></div>',
      '  </div>',
      '  <div class="ask-fab-body" id="askFabBody"></div>',
      '  <div class="ask-fab-chips" id="askFabChips"></div>',
      '  <form class="ask-fab-form" id="askFabForm">',
      '    <input class="ask-fab-input" id="askFabInput" type="text" placeholder="say something…" autocomplete="off" />',
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

    // ---- Avatar life — blinks, tracks cursor, reacts to chat state ----
    const avatar = btn.querySelector('.ask-fab-avatar');
    const eyes   = btn.querySelector('.ask-fab-eyes');

    // Blink loop: random 3.5–7s gap, 110ms blink
    function scheduleBlink() {
      const wait = 3500 + Math.random() * 3500;
      setTimeout(() => {
        avatar?.classList.add('is-blinking');
        setTimeout(() => avatar?.classList.remove('is-blinking'), 110);
        // Occasional double-blink — feels more human
        if (Math.random() < 0.18) {
          setTimeout(() => {
            avatar?.classList.add('is-blinking');
            setTimeout(() => avatar?.classList.remove('is-blinking'), 110);
          }, 280);
        }
        scheduleBlink();
      }, wait);
    }
    scheduleBlink();

    // Saccades — small idle eye movements every 2.5–5s when chat is closed
    let sx = 0, sy = 0;
    function applyEyeOffset(x, y) {
      if (!eyes) return;
      // Clamp so eyes never escape the face cavity (~1.5px range)
      const cx = Math.max(-1.5, Math.min(1.5, x));
      const cy = Math.max(-0.9, Math.min(0.9, y));
      eyes.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
    }
    function scheduleSaccade() {
      const wait = 2500 + Math.random() * 2500;
      setTimeout(() => {
        if (!open && !mouseTracking) {
          sx = (Math.random() - 0.5) * 2;   // -1..1
          sy = (Math.random() - 0.5) * 1.2;
          applyEyeOffset(sx, sy);
        }
        scheduleSaccade();
      }, wait);
    }
    scheduleSaccade();

    // Cursor tracking — eyes glance toward the mouse pointer (subtle)
    let mouseTracking = false;
    document.addEventListener('mousemove', (e) => {
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top  + r.height / 2);
      const dist = Math.hypot(dx, dy);
      // Within 280px, track. Beyond, return to saccade idle.
      if (dist > 280) { mouseTracking = false; return; }
      mouseTracking = true;
      // Normalize the direction into a small offset
      const k = 1.5 / Math.max(60, dist);
      applyEyeOffset(dx * k, dy * k);
    }, { passive: true });
    document.addEventListener('mouseleave', () => { mouseTracking = false; applyEyeOffset(0, 0); });

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
      avatar?.classList.add('is-thinking');
    }

    function clearTyping() {
      document.getElementById('askFabTyping')?.remove();
      avatar?.classList.remove('is-thinking');
    }

    async function reply(rule) {
      typing();
      // Slightly longer pause for multi-message replies — reads more like
      // a person thinking, not a script firing.
      await new Promise((r) => setTimeout(r, 380 + Math.random() * 200));
      clearTyping();
      for (const m of rule.m) {
        bubble('bot', m);
        await new Promise((r) => setTimeout(r, 180));
      }
    }

    function send(text) {
      const t = String(text || '').trim();
      if (!t) return;
      bubble('you', t);
      mem.chats = (mem.chats || 0) + 1;
      mem.lastSeen = Date.now();
      saveMem();
      reply(findRule(t));
    }

    async function greet() {
      if (greeted) return;
      greeted = true;
      // Stamp memory on first chat ever
      if (!mem.firstSeen) { mem.firstSeen = Date.now(); saveMem(); }
      const lines = await openerLines();
      typing();
      await new Promise((r) => setTimeout(r, 320));
      clearTyping();
      for (const ln of lines) {
        bubble('bot', ln);
        await new Promise((r) => setTimeout(r, 220));
      }
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
      avatar?.classList.toggle('is-listening', v);
      if (v) {
        document.dispatchEvent(new CustomEvent('aysec:popover-open', { detail: { id: 'ask' } }));
        greet();
        setTimeout(() => input.focus(), 0);
      } else {
        applyEyeOffset(0, 0); // re-center when closing
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', makeFab);
  } else {
    makeFab();
  }
})();
