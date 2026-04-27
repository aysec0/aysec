/* /ask — pattern-matching security tutor (no LLM, all rules-based). */
(() => {
  // Each rule: an array of patterns + an array of messages (rendered as separate bubbles).
  // First matching rule wins. Order matters — put more-specific rules earlier.
  // Message strings support: [link text](URL) → real anchors, `code` → <code>, **bold**, * list-item lines.
  const RULES = [
    // ---- Greetings ----
    {
      patterns: [/^(hi|hello|hey|sup|yo|hola)\b/i, /good (morning|afternoon|evening)/i],
      messages: [
        "Hey 👋 — I'm aysec's tutor. I can point you to the right course, CTF challenge, cert prep, or tool.",
        "Try one of the chips on the right, or type what you're trying to learn.",
      ],
    },

    // ---- "Where do I start?" / beginner ----
    {
      patterns: [/where (do|should|to) (i|we) (start|begin)/i, /(i'?m|im) (a )?(beginner|new|starting)/i, /(brand )?new to (this|cybersec|security)/i, /from (zero|scratch)/i],
      messages: [
        "Welcome aboard. Here's the path I recommend for total beginners:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** — free, the universal foundation\n2. **[Linux Privilege Escalation](/courses/linux-privilege-escalation)** — free\n3. Solve **3-4 [CTF challenges](/challenges)** — start with the easy ones\n4. After that, take the **[Path Finder quiz](/tracks)** to pick a specialization",
        "If you want a single click that does the thinking for you: **[take the Path Finder quiz](/tracks)** — 6 questions, gets you matched.",
      ],
    },

    // ---- Path / tracks ----
    {
      patterns: [/which (path|track|specialty|specialization)/i, /pick (a )?(path|track|specialty)/i, /(career|learning) path/i],
      messages: [
        "Take the **[Path Finder quiz](/tracks)** — 6 questions, ~90 seconds. It ranks our 4 paths by fit (Web Pentester / AI Red Teamer / Red Teamer / Cloud Security).",
        "Or [browse all 4 paths](/tracks) directly if you already know.",
      ],
    },

    // ---- Web hacking ----
    {
      patterns: [/web (hack|app|pentest|security|bug)/i, /(sql|sqli|xss|csrf|ssrf|burp|owasp)/i, /api (security|test|hack)/i],
      messages: [
        "Web hacking — solid choice. The progression I'd suggest:",
        "1. **[Web Hacking 101](/courses/web-hacking-101)** — the foundation (free)\n2. **[API Security](/courses/api-security)** — modern apps are API-heavy ($59)\n3. **[Bug Bounty Mastery](/courses/bug-bounty-mastery)** — turn skill into payouts ($49)",
        "Practice on our [web CTF challenges](/challenges) — start with `Warmup JWT` and `IDOR Edition`.",
      ],
    },

    // ---- AI / LLM ----
    {
      patterns: [/(ai|llm|large language model|chatgpt|gpt|claude|gemini|openai|anthropic|prompt injection|jailbreak|rag)/i],
      messages: [
        "AI security is the hottest specialty right now. Here's the AI track:",
        "1. **[LLM Security Foundations](/courses/llm-security-foundations)** — free, gets you the threat model\n2. **[AI Red Teaming](/courses/ai-red-teaming)** — advanced ($79). RAG poisoning, jailbreaks, tool-use abuse",
        "Practice: try the [AI/LLM CTF challenges](/challenges) — start with `Polite Override`, then `RAG Doll`.",
        "Considering it as a career? Take the **[AI Red Teamer Path](/tracks/ai-red-teamer-path)** quiz/bundle.",
      ],
    },

    // ---- OSCP ----
    {
      patterns: [/(oscp|offsec|offensive security)/i],
      messages: [
        "OSCP is the most popular practical pentest cert in the world. Our prep path:",
        "**[/certifications/oscp](/certifications/oscp)** — 7 mapped courses (incl. our exclusive **OSCP Exam Methodology** course on day-of strategy) + 5 aligned CTF challenges.",
        "Not sure if OSCP is the right cert? Take the **[Cert Picker quiz](/certifications)** — it ranks all 8 supported certs by fit.",
      ],
    },

    // ---- Other certs ----
    {
      patterns: [/(security\+|sec\+|comptia)/i],
      messages: [
        "Security+ is the most popular entry-level cert (especially for DoD/government roles).",
        "Prep path: **[/certifications/security-plus](/certifications/security-plus)** — pairs the official study guide with our hands-on labs that make the theory stick.",
      ],
    },
    {
      patterns: [/\bceh\b|certified ethical hacker|ec.?council/i],
      messages: [
        "CEH is the most HR-recognized offensive cert. Multiple choice exam.",
        "Prep path: **[/certifications/ceh](/certifications/ceh)** — 7 mapped courses for the broad coverage CEH expects.",
        "Honest framing: CEH is more of an HR credential than a skill credential. If you want skill demonstration, look at OSCP / PNPT instead.",
      ],
    },
    {
      patterns: [/(osep|advanced offensive)/i],
      messages: [
        "OSEP — advanced offensive cert. Take **after** OSCP (or equivalent).",
        "Prep path: **[/certifications/osep](/certifications/osep)** — 4 mapped courses focusing on AD attacks + Red Team Ops.",
      ],
    },
    {
      patterns: [/(oswe|web expert)/i],
      messages: [
        "OSWE — white-box web exploitation. Source code → exploit script → 47.75-hour exam.",
        "Prep path: **[/certifications/oswe](/certifications/oswe)** — Web Hacking 101 + API Security + Bug Bounty Mastery.",
      ],
    },
    {
      patterns: [/(crto|crtp|red team operator|red team professional)/i],
      messages: [
        "Red-team-focused certs:",
        "* **[CRTO](/certifications/crto)** — Cobalt Strike-based, 4-day exam, $499 (best value-per-dollar)\n* **[CRTP](/certifications/crtp)** — AD-focused, 24-hour exam, $249 (cheapest serious AD cert)",
      ],
    },
    {
      patterns: [/(pnpt|tcm|practical network)/i],
      messages: [
        "PNPT — full-engagement-style exam ending with an oral debrief. Closest to a real pentest.",
        "Prep path: **[/certifications/pnpt](/certifications/pnpt)** — OSINT + Web 101 + Linux Privesc + AD Attacks.",
      ],
    },
    {
      patterns: [/(which cert|best cert|recommend.*cert|cert.*recommend|cheap.*cert|cert.*beginner)/i, /^cert/i],
      messages: [
        "I'd love to recommend the right one — but it depends on your goal, budget, and skill.",
        "Take the **[Cert Picker quiz](/certifications)** — 6 questions, ranks all 8 certs (Security+, CEH, OSCP, OSEP, OSWE, CRTO, CRTP, PNPT) by fit.",
      ],
    },

    // ---- Bug bounty ----
    {
      patterns: [/bug bount(y|ies)|hackerone|h1|bugcrowd|payouts|earn.*bug/i],
      messages: [
        "Bug bounty — got a course specifically for this:",
        "**[Bug Bounty Mastery](/courses/bug-bounty-mastery)** ($49) — picking programs (50% of success), recon pipelines that run while you sleep, finding bugs others miss, reports that get paid.",
        "If you're new to web hacking generally, start with **[Web Hacking 101](/courses/web-hacking-101)** (free) first.",
      ],
    },

    // ---- AD / red team ----
    {
      patterns: [/(active directory|kerberoast|asreproast|ad attack|red team)/i],
      messages: [
        "Active Directory + red team — pick your path:",
        "* **[Active Directory Attacks](/courses/active-directory-attacks)** ($99) — Kerberoasting, ACL abuse, ADCS\n* **[Red Team Operations](/courses/red-team-ops)** ($99) — methodology and engagement model\n* **[Become a Red Teamer](/tracks/red-teamer-path)** — full bundle path",
      ],
    },

    // ---- Cloud ----
    {
      patterns: [/(cloud|aws|azure|gcp|s3|iam|imds)/i],
      messages: [
        "Cloud security:",
        "* **[Cloud Security: AWS](/courses/cloud-security-aws)** ($79) — IAM privesc, S3 abuse, IMDSv1, Lambda confused deputy",
        "* The **[Cloud Security Specialist Path](/tracks/cloud-security-path)** bundles it with OSINT + API Security",
      ],
    },

    // ---- Reverse / binex ----
    {
      patterns: [/(reverse engineering|reversing|ghidra|gdb|crackme)/i],
      messages: [
        "Reverse engineering:",
        "* **[Reverse Engineering 101](/courses/reverse-engineering-101)** — free, beginner-friendly. Ghidra + GDB + your first crackme",
        "Practice: try the [rev CTF challenges](/challenges) — start with `License, Please`.",
      ],
    },
    {
      patterns: [/(binex|binary exploit|buffer overflow|rop|pwn)/i],
      messages: [
        "Binary exploitation:",
        "* **[Binary Exploitation Foundations](/courses/binary-exploitation-foundations)** ($49) — stack overflows to ROP",
        "Practice: try `Format Fiesta` and `House of Force` in the [pwn challenges](/challenges).",
      ],
    },

    // ---- Mobile ----
    {
      patterns: [/(mobile|android|ios|frida|burp.*mobile)/i],
      messages: [
        "Mobile pentesting:",
        "**[Mobile App Pentesting](/courses/mobile-app-pentesting)** ($69) — iOS + Android, cert pinning bypass, deep link abuse, real reports.",
      ],
    },

    // ---- OSINT ----
    {
      patterns: [/(osint|recon|footprint|subdomain|enumeration)/i],
      messages: [
        "OSINT / recon:",
        "**[OSINT for Pentesters](/courses/osint-for-pentesters)** — free. Subdomains, GitHub leaks, breach data, employee enum, writing the recon section.",
      ],
    },

    // ---- Smart contract / web3 ----
    {
      patterns: [/(smart contract|solidity|web3|defi|dao|ethereum)/i],
      messages: [
        "Web3 / smart contract security:",
        "**[Smart Contract Auditing](/courses/smart-contract-auditing)** ($149) — reentrancy, oracle manipulation, signature replay, capstone audit.",
      ],
    },

    // ---- Tools ----
    {
      patterns: [/(tools?|toolbox|jwt decoder|hash|cipher|encoder|decoder|cidr|uuid)/i],
      messages: [
        "Toolbox — **[/lab](/lab)** has client-side utilities:",
        "* JWT decoder (with `alg=none` warning)\n* Hash identifier + generator\n* Base64 / URL encoders\n* CIDR calc, Unix timestamp, UUID",
        "And **[/cheatsheets](/cheatsheets)** has reference cards for nmap, ffuf, hashcat, impacket, burp, linux-privesc.",
      ],
    },

    // ---- Pricing / how much / cost ----
    {
      patterns: [/(price|cost|how much|free|paid|subscription)/i],
      messages: [
        "Free courses: Web Hacking 101 · Linux Privesc · OSINT · RE 101 · LLM Security Foundations.",
        "Paid options:",
        "* Single courses from $49\n* **All-Access bundle** $199 (every paid course, lifetime)\n* **Pro Monthly** $19/mo (all courses + monthly office hours)",
        "Full pricing: **[/pricing](/pricing)**.",
      ],
    },

    // ---- CTF help ----
    {
      patterns: [/(ctf|challenge|flag|first.?time|placement|recommend.*challenge)/i],
      messages: [
        "Take the **[CTF Placement quiz](/challenges)** — 4 questions, picks the right difficulty + a starting challenge based on your level.",
        "Or browse all 18 challenges across 7 categories at **[/challenges](/challenges)**.",
      ],
    },

    // ---- Hire / engagement ----
    {
      patterns: [/(hire|engagement|pentest service|consulting|workshop|train.*team|advisory)/i],
      messages: [
        "I do engagements:",
        "* Web pentest from $12k\n* AI/LLM red team from $18k\n* Team training from $8k\n* Advisory hours $400/hr",
        "Take the **[Service Picker quiz](/hire)** to match yourself to the right one — it pre-fills the contact form.",
      ],
    },

    // ---- Newsletter ----
    {
      patterns: [/(newsletter|email|subscribe|monthly digest)/i],
      messages: [
        "Monthly newsletter — five things I read, one deep dive, what's new on the platform. No spam.",
        "**[Subscribe at /newsletter](/newsletter)**.",
      ],
    },

    // ---- Events ----
    {
      patterns: [/(event|conference|defcon|black hat|bsides|ctftime)/i],
      messages: [
        "Curated calendar of CTFs, conferences, and bug-bounty events: **[/events](/events)**. Filter by region (US/EU/MENA/APAC) or kind (CTF/conf/bb).",
        "Each event has an `.ics` download you can drop into Google Calendar.",
      ],
    },

    // ---- Levels ----
    {
      patterns: [/(level|xp|tier|grade|rank.*up|leaderboard)/i],
      messages: [
        "Levels at aysec — 15 themed tiers from **n00b** to **Legend**.",
        "XP comes from CTF solves + lessons + certs + first-bloods. See the full ladder at **[/levels](/levels)** and your current tier on **[/dashboard](/dashboard)**.",
      ],
    },

    // ---- Easter eggs ----
    {
      patterns: [/are you (chatgpt|claude|gpt|an llm|an ai|sentient|conscious)/i],
      messages: [
        "Nope — I'm a hand-coded chatbot. Pattern matching against ~30 rules. No LLM involved (which is actually appropriate for an AI security platform).",
        "If you want a real chat with me about an engagement, [hire me](/hire).",
      ],
    },
    {
      patterns: [/tell me a (joke|pun)/i],
      messages: [
        "Why did the pentester get lost? **Too many recursive directory bruteforces.**",
      ],
    },
    {
      patterns: [/are you (alive|real)/i],
      messages: ["I'm a `switch` statement in a trench coat."],
    },
    {
      patterns: [/(thanks|thank you|thx|ty|appreciated)/i],
      messages: ["Anytime. Now go solve something."],
    },
    {
      patterns: [/^(bye|goodbye|cya|peace|later)/i],
      messages: ["GG. See you on the leaderboard."],
    },
  ];

  // Fallback when nothing matches
  const FALLBACK = {
    messages: [
      "Hmm — I don't have a canned response for that. Try one of these instead:",
      "* **[Path Finder quiz](/tracks)** — picks the right learning path\n* **[Cert Picker quiz](/certifications)** — picks the right cert\n* **[CTF Placement quiz](/challenges)** — picks the right starting challenge\n* **[/courses](/courses)** — full catalog",
      "Or rephrase your question with one of these words: *web*, *AI*, *OSCP*, *bug bounty*, *CTF*, *cloud*, *cert*.",
    ],
  };

  // Initial bot greeting + suggestion chips
  const SUGGESTION_CHIPS = ['Where should I start?', 'OSCP prep', 'AI security', 'Bug bounty', 'Best cert?', 'Show me a CTF'];

  // ---- Helpers ----
  function $(id) { return document.getElementById(id); }

  function fmt(text) {
    // Markdown-ish to safe HTML: only [link](href), `code`, **bold**, and lines starting with * or N. as <ul>/<ol>.
    let s = String(text);
    s = s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    // Inline: bold, code, link
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);
    // Block lists: lines starting with "* " → <ul>; "N. " → <ol>
    const lines = s.split(/\r?\n/);
    const out = [];
    let buf = null; // {tag, items}
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

  function bubble(role, text) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const avatar = role === 'bot' ? 'A' : 'U';
    div.innerHTML = `
      <div class="chat-msg-avatar">${avatar}</div>
      <div class="chat-msg-bubble">${typeof text === 'string' ? fmt(text) : text}</div>`;
    $('chatBody').appendChild(div);
    $('chatBody').scrollTop = $('chatBody').scrollHeight;
  }

  function typing() {
    const div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.id = 'chatTyping';
    div.innerHTML = `
      <div class="chat-msg-avatar">A</div>
      <div class="chat-msg-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
    $('chatBody').appendChild(div);
    $('chatBody').scrollTop = $('chatBody').scrollHeight;
  }

  function clearTyping() {
    const t = $('chatTyping');
    if (t) t.remove();
  }

  function findRule(input) {
    const text = input.toLowerCase();
    for (const rule of RULES) {
      if (rule.patterns.some((p) => p.test(text))) return rule;
    }
    return FALLBACK;
  }

  async function botReply(rule) {
    typing();
    await new Promise((r) => setTimeout(r, 450));
    clearTyping();
    for (const m of rule.messages) {
      bubble('bot', m);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  function send(text) {
    const t = String(text || '').trim();
    if (!t) return;
    bubble('you', t);
    const rule = findRule(t);
    botReply(rule);
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', () => {
    // Initial greeting
    setTimeout(() => bubble('bot', "Hey 👋 — I'm aysec's tutor. Tell me what you're trying to learn and I'll point you to the right course, challenge, or cert prep."), 200);
    setTimeout(() => bubble('bot', "Or pick a chip below 👇"), 700);

    // Suggestion chips
    const chipsEl = $('chatSuggestions');
    chipsEl.innerHTML = SUGGESTION_CHIPS.map((c) =>
      `<button type="button" class="chat-suggestion">${c}</button>`
    ).join('');
    chipsEl.querySelectorAll('.chat-suggestion').forEach((b) => {
      b.addEventListener('click', () => { send(b.textContent); });
    });

    // Sidebar quick-start links
    document.querySelectorAll('.ask-side a[data-q]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); send(a.dataset.q); });
    });

    // Form
    $('chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('chatInput').value;
      $('chatInput').value = '';
      send(v);
    });

    // Reset
    $('chatReset').addEventListener('click', () => {
      $('chatBody').innerHTML = '';
      setTimeout(() => bubble('bot', "Reset. What can I help with?"), 100);
    });
  });
})();
