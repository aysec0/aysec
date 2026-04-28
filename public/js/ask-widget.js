/* Floating Ask widget — bottom-right chat bubble that appears site-wide.
 * Uses the same pattern-matching engine as /ask, with a compact UI.
 * Loaded by layout.js on every page (skipped on /ask itself).
 */
(() => {
  if (location.pathname === '/ask') return;  // /ask is the full version

  const RULES = [
    { patterns: [/^(hi|hello|hey|sup|yo|hola)\b/i, /good (morning|afternoon|evening)/i],
      messages: ["Hey 👋 — what are you trying to learn?", "Type or pick a chip."] },
    { patterns: [/where (do|should|to) (i|we) (start|begin)/i, /(i'?m|im) (a )?(beginner|new|starting)/i, /from (zero|scratch)/i, /first time/i],
      messages: [
        "Welcome aboard. Quick path:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** (free)\n2. Solve a few **[CTF challenges](/challenges)**\n3. Take the **[Path Finder quiz](/tracks)** to get matched to a specialization",
      ] },
    { patterns: [/which (path|track|specialty|specialization)/i, /pick (a )?(path|track)/i],
      messages: ["Take the **[Path Finder quiz](/tracks)** — 6 questions, gets you matched."] },
    { patterns: [/web (hack|app|pentest|security|bug)/i, /(sql|sqli|xss|csrf|ssrf|burp|owasp)/i, /api (security|test|hack)/i],
      messages: [
        "Web hacking — solid choice:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** (free)\n2. **[API Security](/courses/api-security)** ($59)\n3. **[Bug Bounty Mastery](/courses/bug-bounty-mastery)** ($49)",
      ] },
    { patterns: [/(ai|llm|prompt injection|jailbreak|rag|chatgpt|claude)/i],
      messages: [
        "AI security path:",
        "1. **[LLM Security Foundations](/courses/llm-security-foundations)** (free)\n2. **[AI Red Teaming](/courses/ai-red-teaming)** ($79)",
        "Try the **AI CTF challenges** at **[/challenges](/challenges)** — start with `Polite Override`.",
      ] },
    { patterns: [/(oscp|offsec|offensive security)/i],
      messages: ["**[/certifications/oscp](/certifications/oscp)** — 7 mapped courses + the OSCP Exam Methodology course."] },
    { patterns: [/(security\+|sec\+|comptia)/i],
      messages: ["**[Security+ prep](/certifications/security-plus)** — entry-level, vendor-neutral, $392 exam."] },
    { patterns: [/\bceh\b|certified ethical hacker|ec.?council/i],
      messages: ["**[CEH prep](/certifications/ceh)** — 7 mapped courses for the broad coverage CEH expects."] },
    { patterns: [/(which cert|best cert|recommend.*cert|cert.*beginner)/i, /^cert/i],
      messages: ["Take the **[Cert Picker quiz](/certifications)** — ranks all 8 certs by fit."] },
    { patterns: [/bug bount(y|ies)|hackerone|h1|bugcrowd|payouts/i],
      messages: ["**[Bug Bounty Mastery](/courses/bug-bounty-mastery)** ($49) — picking programs, recon pipelines, reports that get paid."] },
    { patterns: [/(active directory|kerberoast|asreproast|red team)/i],
      messages: [
        "AD + red team:",
        "* **[Active Directory Attacks](/courses/active-directory-attacks)** ($99)\n* **[Red Team Operations](/courses/red-team-ops)** ($99)\n* **[Become a Red Teamer Path](/tracks/red-teamer-path)**",
      ] },
    { patterns: [/(cloud|aws|azure|gcp|s3|iam|imds)/i],
      messages: ["**[Cloud Security: AWS](/courses/cloud-security-aws)** ($79) — IAM privesc, S3 abuse, IMDS, Lambda confused deputy."] },
    { patterns: [/(reverse engineering|reversing|ghidra|gdb|crackme)/i],
      messages: ["**[Reverse Engineering 101](/courses/reverse-engineering-101)** (free) — Ghidra + GDB + your first crackme."] },
    { patterns: [/(binex|binary exploit|buffer overflow|rop|pwn)/i],
      messages: ["**[Binary Exploitation Foundations](/courses/binary-exploitation-foundations)** ($49) — stack overflows to ROP."] },
    { patterns: [/(mobile|android|ios|frida)/i],
      messages: ["**[Mobile App Pentesting](/courses/mobile-app-pentesting)** ($69) — iOS + Android."] },
    { patterns: [/(osint|recon|footprint|subdomain)/i],
      messages: ["**[OSINT for Pentesters](/courses/osint-for-pentesters)** (free)."] },
    { patterns: [/(smart contract|solidity|web3|defi)/i],
      messages: ["**[Smart Contract Auditing](/courses/smart-contract-auditing)** ($149) — reentrancy, oracle manip, capstone audit."] },
    { patterns: [/(tools?|toolbox|jwt decoder|hash|cipher|encoder|decoder|cidr|uuid)/i],
      messages: ["Toolbox: **[/lab](/lab)** — JWT decoder, hash ID, encoders, CIDR, UUID, etc.\nReference cards: **[/cheatsheets](/cheatsheets)**."] },
    { patterns: [/(price|cost|how much|free|paid|subscription)/i],
      messages: [
        "Free: Web Hacking 101 · Linux Privesc · OSINT · RE 101 · LLM Security Foundations.",
        "Paid: courses from $49 · **All-Access bundle** $199 · **Pro Monthly** $19/mo. Full breakdown: **[/pricing](/pricing)**.",
      ] },
    { patterns: [/(ctf|challenge|flag|placement|recommend.*challenge)/i],
      messages: ["Take the **[CTF Placement quiz](/challenges)** — picks the right starter."] },
    { patterns: [/(hire|engagement|consulting|workshop|train.*team|advisory)/i],
      messages: ["Take the **[Service Picker quiz](/hire)** — matches you to web pentest / AI red team / training / advisory."] },
    { patterns: [/(event|conference|defcon|black hat|bsides)/i],
      messages: ["**[/events](/events)** — curated CTF + conference + bug-bounty calendar with `.ics` exports."] },
    { patterns: [/(level|xp|tier|rank.*up|leaderboard)/i],
      messages: ["15 themed tiers from n00b to Legend at **[/levels](/levels)**. Your tier shows on the dashboard."] },
    { patterns: [/(vault|hidden flag|easter egg)/i],
      messages: ["**[/vault](/vault)** — 7 flags hidden across this website itself. Inspect source. Read robots.txt. Decode the JWT. Find them all to earn the Vault Cracker badge."] },
    { patterns: [/(community|discord)/i],
      messages: ["Open **[/community](/community)** — live Discord with help channels, monthly office hours, and first dibs on new CTF drops."] },
    { patterns: [/(skill ?dna|fingerprint|profile.*art)/i],
      messages: ["Skill DNA — every user gets a unique generative SVG of their solve history. Yours appears on your profile after a few solves. Mine: **[/u/admin/dna](/u/admin/dna)**."] },
    { patterns: [/are you (chatgpt|claude|gpt|an llm|an ai|sentient)/i],
      messages: ["Hand-coded chatbot. Pattern matching, no LLM. Appropriate for an AI security platform."] },
    { patterns: [/tell me a (joke|pun)/i],
      messages: ["Why did the pentester get lost? **Too many recursive directory bruteforces.**"] },
    { patterns: [/(thanks|thank you|thx|ty)/i],
      messages: ["Anytime. Now go solve something."] },
    { patterns: [/^(bye|goodbye|cya|peace|later)/i],
      messages: ["GG. See you on the leaderboard."] },
  ];

  const FALLBACK = {
    messages: [
      "Hmm — no canned response for that. Try one of these:",
      "* **[Path Finder quiz](/tracks)**\n* **[Cert Picker quiz](/certifications)**\n* **[CTF Placement quiz](/challenges)**\n* **[/courses](/courses)** — full catalog",
    ],
  };

  const SUGGESTIONS = ['where do I start?', 'OSCP prep', 'AI security', 'best cert?'];

  function fmt(text) {
    let s = String(text);
    s = s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
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

  function findRule(input) {
    const text = input.toLowerCase();
    for (const r of RULES) if (r.patterns.some((p) => p.test(text))) return r;
    return FALLBACK;
  }

  // ---- Mount the bubble + window ----
  function mount() {
    if (document.getElementById('askBubble')) return;
    const bubble = document.createElement('button');
    bubble.id = 'askBubble';
    bubble.className = 'ask-bubble attention';
    bubble.type = 'button';
    bubble.setAttribute('aria-label', 'Open Ask aysec chat');
    bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    document.body.appendChild(bubble);

    const win = document.createElement('div');
    win.id = 'askWindow';
    win.className = 'ask-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Ask aysec');
    win.innerHTML = `
      <div class="ask-w-head">
        <div class="ask-w-avatar">A</div>
        <div class="ask-w-name">aysec tutor</div>
        <div class="ask-w-status">online</div>
        <button class="ask-w-close" id="askWClose" type="button" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="ask-w-body" id="askWBody"></div>
      <div class="ask-w-foot">
        <form id="askWForm" class="ask-w-input-row">
          <input class="ask-w-input" id="askWInput" type="text" autocomplete="off" placeholder="ask anything cybersec…" />
          <button class="ask-w-send" type="submit" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
        <div class="ask-w-suggestions" id="askWSuggestions">
          ${SUGGESTIONS.map((s) => `<button type="button" class="ask-w-suggestion">${s}</button>`).join('')}
          <a class="ask-w-suggestion" href="/ask" style="color:var(--text-dim);">full chat ↗</a>
        </div>
      </div>`;
    document.body.appendChild(win);

    const body = document.getElementById('askWBody');
    const input = document.getElementById('askWInput');

    function bubble_(role, text) {
      const div = document.createElement('div');
      div.className = `ask-w-msg ${role}`;
      const avatar = role === 'bot' ? 'A' : 'U';
      div.innerHTML = `<div class="ask-w-msg-avatar">${avatar}</div><div class="ask-w-msg-bubble">${typeof text === 'string' ? fmt(text) : text}</div>`;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }
    function typing() {
      const div = document.createElement('div');
      div.className = 'ask-w-msg bot';
      div.id = 'askWTyping';
      div.innerHTML = `<div class="ask-w-msg-avatar">A</div><div class="ask-w-msg-bubble"><div class="ask-w-typing"><span></span><span></span><span></span></div></div>`;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }
    function clearTyping() { document.getElementById('askWTyping')?.remove(); }
    async function reply(rule) {
      typing();
      await new Promise((r) => setTimeout(r, 380));
      clearTyping();
      for (const m of rule.messages) {
        bubble_('bot', m);
        await new Promise((r) => setTimeout(r, 220));
      }
    }
    function send(text) {
      const t = String(text || '').trim();
      if (!t) return;
      bubble_('you', t);
      reply(findRule(t));
    }

    let opened = false;
    function open() {
      if (opened) return;
      opened = true;
      win.classList.add('open');
      bubble.classList.add('is-open');
      bubble.classList.remove('attention');
      try { localStorage.setItem('ask.opened', '1'); } catch {}
      // Initial greeting on first open
      if (!body.children.length) {
        setTimeout(() => bubble_('bot', "Hey 👋 — I'm aysec's tutor. What are you trying to learn?"), 150);
        setTimeout(() => bubble_('bot', "Pick a chip below or ask me anything cybersec."), 700);
      }
      setTimeout(() => input.focus(), 250);
    }
    function close() {
      opened = false;
      win.classList.remove('open');
      bubble.classList.remove('is-open');
    }

    bubble.addEventListener('click', () => opened ? close() : open());
    document.getElementById('askWClose').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (opened && e.key === 'Escape') close();
    });

    document.getElementById('askWForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      send(v);
    });
    document.getElementById('askWSuggestions').querySelectorAll('button.ask-w-suggestion').forEach((b) => {
      b.addEventListener('click', () => send(b.textContent));
    });

    // Stop pulsing once they've opened it once
    try {
      if (localStorage.getItem('ask.opened')) bubble.classList.remove('attention');
    } catch {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
