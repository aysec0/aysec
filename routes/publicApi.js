/* ============================================================
   /api/v1/* — public read-only API. Bearer-token auth via
   personal API keys (see middleware/apiKey.js). Documented at
   /api-docs. Stable surface for third-party scripts, badge
   generators, status sites, etc.

   Stable contract:
   - Versioned under /v1; breaking changes ship as /v2.
   - Every endpoint returns a JSON object (never bare arrays) so
     we can add metadata fields later without breaking clients.
   - Errors: { "error": "<message>", "status": <int> }
   - Rate limit: 60 requests/minute/key (in-memory bucket).
   ============================================================ */
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireApiKey } from '../middleware/apiKey.js';

const router = Router();

// ---- Tiny in-memory rate limiter (60 rpm per key) ----
const buckets = new Map();
function rateLimit(req, res, next) {
  const k = req.apiUser?.id ?? 'anon';
  const now = Date.now();
  const b = buckets.get(k) || { tokens: 60, refilledAt: now };
  // Refill at 1 token/sec, cap 60
  const elapsed = (now - b.refilledAt) / 1000;
  b.tokens = Math.min(60, b.tokens + elapsed);
  b.refilledAt = now;
  if (b.tokens < 1) {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ error: 'Rate limit (60 rpm) exceeded — slow down.' });
  }
  b.tokens -= 1;
  buckets.set(k, b);
  next();
}

router.use(requireApiKey, rateLimit);

/* Return-shape conventions: paginated lists put rows under a named
   field (`challenges`, `users`, etc.), include `total`, and accept
   ?limit + ?offset (capped to 100). */

router.get('/me', (req, res) => {
  res.json({
    user: {
      username: req.apiUser.username,
      display_name: req.apiUser.display_name,
      avatar_url: req.apiUser.avatar_url,
    },
    scopes: req.apiUser.scopes,
  });
});

router.get('/challenges', (req, res) => {
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10)  || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const cat = req.query.category ? String(req.query.category) : null;

  const rows = db.prepare(`
    SELECT slug, title, category, difficulty, points, author, created_at,
           (SELECT COUNT(*) FROM solves s WHERE s.challenge_id = challenges.id) AS solves
    FROM challenges
    WHERE published = 1 ${cat ? 'AND category = ?' : ''}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...(cat ? [cat, limit, offset] : [limit, offset]));

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM challenges WHERE published = 1 ${cat ? 'AND category = ?' : ''}
  `).get(...(cat ? [cat] : [])).c;

  res.json({ challenges: rows, total, limit, offset });
});

router.get('/challenges/:slug', (req, res) => {
  const ch = db.prepare(`
    SELECT slug, title, category, difficulty, points, author, description, created_at
    FROM challenges WHERE slug = ? AND published = 1
  `).get(req.params.slug);
  if (!ch) return res.status(404).json({ error: 'Not found' });
  ch.solves = db.prepare('SELECT COUNT(*) AS c FROM solves s JOIN challenges c ON c.id = s.challenge_id WHERE c.slug = ?').get(req.params.slug).c;
  res.json({ challenge: ch });
});

router.get('/leaderboard', (_req, res) => {
  const rows = db.prepare(`
    SELECT u.username, u.display_name, u.avatar_url,
           SUM(c.points) AS score,
           COUNT(s.id)   AS solves
    FROM solves s
    JOIN users u      ON u.id = s.user_id
    JOIN challenges c ON c.id = s.challenge_id
    GROUP BY u.id
    ORDER BY score DESC
    LIMIT 50
  `).all();
  res.json({ leaderboard: rows });
});

router.get('/users/:username', (req, res) => {
  const u = db.prepare(`
    SELECT username, display_name, avatar_url, bio, created_at FROM users WHERE username = ?
  `).get(req.params.username);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM solves s
        JOIN users u ON u.id = s.user_id WHERE u.username = ?) AS solves,
      (SELECT COALESCE(SUM(c.points), 0) FROM solves s
        JOIN challenges c ON c.id = s.challenge_id
        JOIN users u ON u.id = s.user_id WHERE u.username = ?) AS score
  `).get(req.params.username, req.params.username);
  res.json({ user: { ...u, stats } });
});

router.get('/users/:username/solves', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const rows = db.prepare(`
    SELECT c.slug, c.title, c.category, c.difficulty, c.points, s.solved_at
    FROM solves s
    JOIN users u      ON u.id = s.user_id
    JOIN challenges c ON c.id = s.challenge_id
    WHERE u.username = ?
    ORDER BY s.solved_at DESC
    LIMIT ?
  `).all(req.params.username, limit);
  res.json({ solves: rows });
});

router.get('/duels', (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const where = status ? 'WHERE d.status = ?' : '';
  const rows = db.prepare(`
    SELECT d.id, d.status, d.stake, d.created_at, d.started_at, d.finished_at,
           cu.username AS challenger,
           ou.username AS opponent,
           c.slug AS challenge_slug, c.title AS challenge_title,
           wu.username AS winner
    FROM duels d
    JOIN users cu       ON cu.id = d.challenger_id
    LEFT JOIN users ou  ON ou.id = d.opponent_id
    JOIN challenges c   ON c.id  = d.challenge_id
    LEFT JOIN users wu  ON wu.id = d.winner_id
    ${where}
    ORDER BY d.created_at DESC
    LIMIT 100
  `).all(...(status ? [status] : []));
  res.json({ duels: rows });
});

router.get('/activity', (_req, res) => {
  const rows = db.prepare(`
    SELECT a.kind, a.title, a.body, a.link, a.created_at,
           u.username, u.display_name, u.avatar_url
    FROM activities a JOIN users u ON u.id = a.user_id
    WHERE a.visibility = 'public'
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all();
  res.json({ activity: rows });
});

export default router;
