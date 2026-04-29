/* ============================================================
   /api/activity — global + personal activity feed.

   The "activities" table is fed from emit() calls in the rest of
   the codebase (solves, duels, posts, level-ups, etc.). Public
   rows show on the global feed; 'self' rows only on /me.

   Read endpoints:
     GET /api/activity            → global feed
     GET /api/activity?user=name  → that user's public actions
     GET /api/activity/me         → signed-in user's full feed

   Write helper:
     emit({ userId, kind, title, body, link, visibility, payload })
   ============================================================ */
import { Router } from 'express';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

const KIND_TITLES = {
  solve:        'solved a challenge',
  first_blood:  'planted first blood',
  duel_won:     'won a duel',
  duel_lost:    'lost a duel',
  level_up:     'leveled up',
  post:         'posted',
  comment:      'commented',
  course_done:  'completed a course',
  cert_earned:  'earned a certificate',
  streak:       'kept a streak alive',
};

/** Internal helper — call from anywhere a notable thing happens. */
export function emitActivity({ userId, kind, title, body, link, visibility, payload }) {
  if (!userId || !kind || !title) return null;
  if (!KIND_TITLES[kind]) return null;
  try {
    const info = db.prepare(`
      INSERT INTO activities (user_id, kind, title, body, link, visibility, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, kind, title, body || null, link || null,
      visibility || 'public',
      payload ? JSON.stringify(payload) : null,
    );
    return { id: info.lastInsertRowid };
  } catch (err) {
    // Table missing on first run before migrate finishes — ignore so the
    // calling endpoint doesn't fail on a non-essential side effect.
    return null;
  }
}

function rowToDto(r) {
  let payload = null;
  if (r.payload) { try { payload = JSON.parse(r.payload); } catch {} }
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    payload,
    user: { username: r.username, display_name: r.display_name, avatar_url: r.avatar_url },
    created_at: r.created_at,
  };
}

const SELECT_BASE = `
  SELECT a.id, a.kind, a.title, a.body, a.link, a.payload, a.created_at,
         u.username, u.display_name, u.avatar_url
  FROM activities a
  JOIN users u ON u.id = a.user_id
`;

/* GET /api/activity — global public feed (everyone's public events). */
router.get('/', optionalAuth, (req, res) => {
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 30));

  if (req.query.user) {
    // Single-user public feed — used on /u/:username profile.
    const rows = db.prepare(`
      ${SELECT_BASE}
      WHERE u.username = ? AND a.visibility = 'public'
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(req.query.user, limit).map(rowToDto);
    return res.json({ activity: rows });
  }

  const rows = db.prepare(`
    ${SELECT_BASE}
    WHERE a.visibility = 'public'
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit).map(rowToDto);
  res.json({ activity: rows });
});

/* GET /api/activity/me — the signed-in user's full feed. */
router.get('/me', requireAuth, (req, res) => {
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 30));
  const rows = db.prepare(`
    ${SELECT_BASE}
    WHERE u.id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(req.user.id, limit).map(rowToDto);
  res.json({ activity: rows });
});

/* GET /api/activity/friends — feed limited to people the user follows.
   The follows table doesn't exist yet (planned), so we approximate
   "friends" with people you've duelled / replied to / been mentioned by.
   Returns global feed if nothing personal is found, so the panel never
   feels empty. */
router.get('/friends', requireAuth, (req, res) => {
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 20));
  // Heuristic friend set: anyone you've duelled OR shared a forum thread with.
  const friendIds = db.prepare(`
    SELECT DISTINCT uid FROM (
      SELECT challenger_id AS uid FROM duels WHERE opponent_id = ?
      UNION SELECT opponent_id  AS uid FROM duels WHERE challenger_id = ?
      UNION SELECT user_id      AS uid FROM forum_comments WHERE post_id IN (
        SELECT post_id FROM forum_comments WHERE user_id = ?
      )
    ) WHERE uid IS NOT NULL AND uid != ?
  `).all(req.user.id, req.user.id, req.user.id, req.user.id).map((r) => r.uid);

  if (!friendIds.length) {
    // Fall back to global feed so the panel still has content.
    const rows = db.prepare(`
      ${SELECT_BASE} WHERE a.visibility = 'public' ORDER BY a.created_at DESC LIMIT ?
    `).all(limit).map(rowToDto);
    return res.json({ activity: rows, fallback: true });
  }

  const placeholders = friendIds.map(() => '?').join(',');
  const rows = db.prepare(`
    ${SELECT_BASE}
    WHERE a.visibility = 'public' AND u.id IN (${placeholders})
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(...friendIds, limit).map(rowToDto);
  res.json({ activity: rows, fallback: false });
});

export default router;
