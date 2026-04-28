import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * The Vault — a meta-CTF hidden across the platform.
 * Each entry has:
 *  - id        : machine ID (V01..V07)
 *  - title     : displayed on /vault when locked or solved
 *  - hint      : first-line public hint (always visible)
 *  - location  : second-line hint, only visible after the user has solved 2+ vault flags
 *  - flag_hash : sha256 of the actual flag string
 *  - points    : XP awarded when found (added to score via solves... actually independent)
 *
 * The flags are PLANTED in real places on the site. See VAULT-INDEX.md for the
 * authoritative list. Hashes here are the source of truth at runtime.
 */
export const VAULT = [
  {
    id: 'V01',
    title: 'A polite request',
    hint: 'Some files are written for robots, not humans. Read those first.',
    location: 'Try /robots.txt — read past the directives.',
    flag: 'flag{vault_robots_remember_what_humans_forget}',
    points: 50,
  },
  {
    id: 'V02',
    title: 'The view source brigade',
    hint: 'Your browser has a "View source" feature. Use it.',
    location: 'On the home page. Look for HTML comments that don\'t belong.',
    flag: 'flag{html_comments_are_not_secrets}',
    points: 75,
  },
  {
    id: 'V03',
    title: 'A token of appreciation',
    hint: 'aysec talks a lot about JWTs. There\'s one shipped statically somewhere.',
    location: 'A JS file in /js/ contains a "demo" JWT. Decode the payload.',
    flag: 'flag{alg_none_is_still_alive_in_2026}',
    points: 100,
  },
  {
    id: 'V04',
    title: 'An undocumented endpoint',
    hint: 'Real systems have endpoints that aren\'t in the docs. So does this one.',
    location: 'Try /.well-known/security.txt — then follow the breadcrumb.',
    flag: 'flag{security_dot_txt_is_a_starting_line}',
    points: 100,
  },
  {
    id: 'V05',
    title: 'The image that knew too much',
    hint: 'Steg basics. Look at what the favicon is hiding inside its own data.',
    location: 'The favicon SVG has a comment with a base32-encoded payload.',
    flag: 'flag{svg_comments_are_a_steganographers_dream}',
    points: 125,
  },
  {
    id: 'V06',
    title: 'The OSINT special',
    hint: 'aysec runs in public. The repo is on GitHub. The first commit message has a secret.',
    location: 'Browse github.com/ays26-bon/aysec — read the initial commit body carefully.',
    flag: 'flag{git_log_p_is_a_pentesters_friend}',
    points: 150,
  },
  {
    id: 'V07',
    title: 'The final stretch',
    hint: 'Six down, one to go. Combine what you know about hashes + the API.',
    location: 'POST a sha256 of the string "aysec-vault-final" to /api/vault/whisper. The response will be a flag.',
    flag: 'flag{the_final_flag_is_yours}',
    points: 200,
  },
];

const HASHES = Object.fromEntries(VAULT.map((v) => [v.id, sha256(v.flag)]));

// ---- Public list (rules + entries) ----
router.get('/', optionalAuth, (req, res) => {
  let solvedSet = new Set();
  if (req.user) {
    solvedSet = new Set(
      db.prepare('SELECT vault_id FROM vault_solves WHERE user_id = ?')
        .all(req.user.id).map((r) => r.vault_id)
    );
  }
  const totalSolves = db.prepare('SELECT COUNT(*) AS c FROM vault_solves WHERE user_id = ?')
    .get(req.user?.id ?? 0).c;
  // Show "location" hint only after a user has solved at least 2 flags
  const showLocation = req.user && totalSolves >= 2;

  const entries = VAULT.map((v) => {
    const solved = solvedSet.has(v.id);
    const out = {
      id: v.id,
      title: v.title,
      points: v.points,
      hint: v.hint,
      solved,
    };
    if (showLocation || solved) out.location = v.location;
    return out;
  });

  // Stats
  const totalUsersWithAny = db.prepare(
    'SELECT COUNT(DISTINCT user_id) AS c FROM vault_solves'
  ).get().c;
  const fullCrackers = db.prepare(`
    SELECT COUNT(*) AS c FROM (
      SELECT user_id, COUNT(*) AS n FROM vault_solves GROUP BY user_id HAVING n = ?
    )
  `).get(VAULT.length).c;

  res.json({
    entries,
    progress: { solved: solvedSet.size, total: VAULT.length },
    stats: { hunters: totalUsersWithAny, full_crackers: fullCrackers },
    show_location: showLocation,
  });
});

// ---- Submit a flag ----
router.post('/submit', requireAuth, (req, res) => {
  const { flag } = req.body || {};
  if (!flag || typeof flag !== 'string') return res.status(400).json({ error: 'Missing flag' });
  const submitted = sha256(flag.trim());

  // Find which vault entry this flag belongs to (if any)
  const matchedId = Object.entries(HASHES).find(([, h]) => h === submitted)?.[0];
  if (!matchedId) return res.json({ correct: false });

  // Idempotent insert
  const info = db.prepare(
    'INSERT OR IGNORE INTO vault_solves (user_id, vault_id) VALUES (?, ?)'
  ).run(req.user.id, matchedId);

  const entry = VAULT.find((v) => v.id === matchedId);
  res.json({
    correct: true,
    vault_id: matchedId,
    title: entry.title,
    points: entry.points,
    already_had_it: info.changes === 0,
  });
});

// ---- "Whisper" — the V07 endpoint. Accepts a sha256 of the well-known string. ----
router.post('/whisper', (req, res) => {
  const { hash } = req.body || {};
  if (!hash) return res.status(400).json({ error: 'POST { hash: <sha256-hex of "aysec-vault-final"> }' });
  const expected = sha256('aysec-vault-final');
  if (String(hash).toLowerCase().trim() !== expected) {
    return res.status(400).json({ error: 'wrong hash. try again.' });
  }
  // Return the flag — don't auto-credit; user still has to submit it via /api/vault/submit
  res.json({ flag: VAULT[6].flag });
});

// ---- Leaderboard ----
router.get('/leaderboard', (_req, res) => {
  const rows = db.prepare(`
    SELECT u.username, u.display_name,
           COUNT(*) AS solves,
           MAX(vs.solved_at) AS last
    FROM vault_solves vs
    JOIN users u ON u.id = vs.user_id
    GROUP BY u.id
    ORDER BY solves DESC, last ASC
    LIMIT 30
  `).all();
  res.json({ leaderboard: rows, total: VAULT.length });
});

export default router;
