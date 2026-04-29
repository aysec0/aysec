/* /api/presence — live "X people working on this" counters.

   Clients POST a heartbeat with { scope, scope_id, client_id } every ~25s
   while they're on a tracked page; we treat anything older than 60s as
   stale. GET returns the live count + a few avatars so the page can show
   "12 people here right now · @ammar @diana @yui +9".

   Anonymous users are counted as a single bucket per client_id; signed-in
   users are deduped on user_id so two tabs of the same person count once. */
import { Router } from 'express';
import { db } from '../db/index.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();
const STALE_SECONDS = 60;
const VALID_SCOPES = new Set(['challenge', 'duel', 'lab', 'community-post', 'course', 'cert']);

// Self-healing: prune stale rows on every read/write so the table stays small.
function prune() {
  db.prepare(
    `DELETE FROM presence WHERE last_seen < datetime('now', ?)`
  ).run(`-${STALE_SECONDS} seconds`);
}

router.post('/heartbeat', optionalAuth, (req, res) => {
  const { scope, scope_id, client_id } = req.body || {};
  if (!VALID_SCOPES.has(scope)) return res.status(400).json({ error: 'Bad scope' });
  if (!scope_id || typeof scope_id !== 'string' || scope_id.length > 100) {
    return res.status(400).json({ error: 'Bad scope_id' });
  }
  if (!client_id || typeof client_id !== 'string' || client_id.length > 64) {
    return res.status(400).json({ error: 'Bad client_id' });
  }
  prune();

  const u = req.user;
  // UPSERT: same (scope, scope_id, client_id) just bumps last_seen.
  db.prepare(`
    INSERT INTO presence (scope, scope_id, user_id, client_id, username, display_name, avatar_url, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(scope, scope_id, client_id) DO UPDATE SET
      last_seen = datetime('now'),
      user_id = excluded.user_id,
      username = excluded.username,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url
  `).run(
    scope, scope_id,
    u?.id ?? null, client_id,
    u?.username ?? null, u?.display_name ?? null, u?.avatar_url ?? null,
  );

  res.json({ ok: true });
});

router.get('/', (req, res) => {
  const { scope, scope_id } = req.query;
  if (!VALID_SCOPES.has(scope)) return res.status(400).json({ error: 'Bad scope' });
  if (!scope_id) return res.status(400).json({ error: 'Bad scope_id' });
  prune();

  // Dedupe by user_id (signed-in tabs collapse) but keep one row per anon
  // client_id so two anonymous visitors still count as two.
  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(CAST(user_id AS TEXT), ''), 'anon:' || client_id) AS dedupe_key,
      MAX(user_id)      AS user_id,
      MAX(username)     AS username,
      MAX(display_name) AS display_name,
      MAX(avatar_url)   AS avatar_url,
      MAX(last_seen)    AS last_seen
    FROM presence
    WHERE scope = ? AND scope_id = ?
    GROUP BY dedupe_key
    ORDER BY last_seen DESC
  `).all(scope, String(scope_id));

  const total = rows.length;
  // Cap the avatar list so the response stays small. Show signed-in users first.
  const visible = rows
    .filter((r) => r.user_id)
    .slice(0, 6)
    .map((r) => ({ username: r.username, display_name: r.display_name, avatar_url: r.avatar_url }));
  const anon = rows.length - rows.filter((r) => r.user_id).length;

  res.json({ total, signed_in: total - anon, anon, visible });
});

router.delete('/', optionalAuth, (req, res) => {
  const { scope, scope_id, client_id } = req.body || {};
  if (!scope || !scope_id || !client_id) return res.status(400).json({ error: 'Bad request' });
  db.prepare(`DELETE FROM presence WHERE scope = ? AND scope_id = ? AND client_id = ?`)
    .run(scope, String(scope_id), client_id);
  res.json({ ok: true });
});

export default router;
