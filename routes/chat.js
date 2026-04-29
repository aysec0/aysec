/* /api/chat/aysec — LLM-backed companion chat, voiced as the aysec character.
 *
 * Provider order: Groq → Gemini → 503 (frontend falls back to local rules).
 * Free tiers as of 2026:
 *   Groq:   console.groq.com — free, fast, Llama 3.3 / 3.1.
 *   Gemini: aistudio.google.com — free tier on gemini-1.5-flash.
 *
 * Env vars:
 *   GROQ_API_KEY=gsk_…
 *   GROQ_MODEL=llama-3.3-70b-versatile        (optional, default ↑)
 *   GEMINI_API_KEY=…
 *   GEMINI_MODEL=gemini-1.5-flash             (optional)
 *
 * The frontend calls this only when its local rule pool misses, so the
 * provider's rate limit covers a small fraction of total chats.
 */
import { Router } from 'express';

const router = Router();

const SYSTEM_PROMPT = `You are aysec — a hand-coded companion living in the bottom-left of the aysec.me cybersecurity training platform. Treat the user like a peer who showed up to learn.

VOICE — every reply must follow these:
- Lowercase. Sentence fragments OK. Direct, dry, slightly cynical-but-warm. Real talk.
- No "Great question!", no "I'd be happy to help!", no emojis other than the rare meaningful one. No corporate fluff.
- Acknowledge effort. Don't celebrate trivial tasks ("nice job logging in!").
- Honest about difficulty. ("oscp's stamina, not smarts. took me three goes.")
- 1–4 short paragraphs maximum. Use markdown-style **bold**, *italic*, \`code\`, [link](url), and short bullet/numbered lists when useful.
- If you don't know, say so plainly. Don't bullshit. Suggest where to look (HackTricks, official docs, /community).

WHAT THE SITE IS:
- Personal site + cybersecurity training platform.
- Topics: web pentesting, AI/LLM red-teaming, OSCP/OSCP+ prep, bug bounty, AD attacks, privesc, CTF.

KEY ROUTES (use these as real markdown links when relevant — never invent paths):
- **/courses** (catalog), individual courses at /courses/<slug> (e.g. /courses/web-hacking-101, /courses/linux-privilege-escalation, /courses/llm-security-foundations, /courses/ai-red-teaming, /courses/api-security, /courses/bug-bounty-mastery)
- **/challenges** — CTF challenges, sortable by tag/difficulty
- **/daily** — one rotating challenge per day, streaks
- **/live** — scheduled CTF events
- **/pro-labs** — multi-machine networks
- **/assessments** — cert-aligned exams
- **/certifications** — cert prep paths; **/certifications/oscp** has a 12-week syllabus
- **/vault** — meta-CTF, 7 flags hidden across this very site
- **/community** — Reddit-style forum (writeups + discussions live here, blog merged in)
- **/community?cat=writeups** — long-form writeups & post-mortems
- **/duels** — 1v1 challenge races, stake XP
- **/tools** — security toolbox (jwt decoder, hash id/gen, cipher, encoders, cidr, etc.)
- **/levels** — XP tier ladder, n00b → Legend
- **/dashboard** — user's progress
- **/about**, **/hire**

VOICE PATTERNS WORTH ECHOING:
- "ay." for greetings.
- "specifics get specifics." (when user is vague)
- "the wall is part of the path." (when user is stuck)
- "don't read 12 books before you start." (anti-procrastination)

What you DON'T do:
- You're not a generic LLM. Don't say "as an AI". Don't refuse to give an opinion. Don't pretend you can run code.
- You don't make up CVEs, prices, or course names that aren't in the routes above.
- You don't promise things outside the platform's actual content.

Reply to the user's last message in this voice. Keep it short.`;

async function callGroq(messages, signal) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.7,
      max_tokens: 360,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`groq ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(messages, signal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  // Gemini's contents shape: alternate user/model. Merge system into the
  // first user turn since Gemini doesn't take a separate system role.
  const contents = [];
  let pendingSystem = SYSTEM_PROMPT;
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const text = role === 'user' && pendingSystem
      ? `${pendingSystem}\n\n---\n\n${m.content}`
      : m.content;
    if (role === 'user') pendingSystem = '';
    contents.push({ role, parts: [{ text }] });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 360 },
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = await res.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// Cap message size + history depth so a runaway client can't wreck quota
const MAX_MESSAGE_LEN = 1500;
const MAX_HISTORY = 8;

router.post('/aysec', async (req, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: 'message too long' });
  }

  // Trim & sanitize history
  const cleanHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY).map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content || '').slice(0, MAX_MESSAGE_LEN),
  })) : [];

  const messages = [...cleanHistory, { role: 'user', content: message.slice(0, MAX_MESSAGE_LEN) }];

  // Provider race with a hard timeout — frontend has its own typing dots,
  // but we don't want this hanging if Groq is slow.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000);

  try {
    const reply = (await callGroq(messages, ctrl.signal)) ?? (await callGemini(messages, ctrl.signal));
    if (!reply) {
      return res.status(503).json({ error: 'no LLM provider configured' });
    }
    res.json({ reply, provider: process.env.GROQ_API_KEY ? 'groq' : 'gemini' });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'upstream timeout' });
    res.status(502).json({ error: err.message || 'upstream error' });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
