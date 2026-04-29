/* ============================================================
   Duels — 1v1 challenge races.

   A player picks a published challenge they have NOT yet solved,
   stakes XP, and either calls out a specific opponent or opens
   the duel for anyone to accept.

   Once accepted: 60-minute timer starts. First correct flag wins
   the pot (winner +stake XP, loser -stake XP). Either side can
   forfeit early. Unaccepted duels expire after 24h.

   The duel never reveals the challenge flag — submissions are
   hashed and compared just like the regular CTF endpoint.
   ============================================================ */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { emit as emitNotification } from './notifications.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const ACTIVE_TIMEOUT_MIN = 60;
const OPEN_TIMEOUT_HOURS = 24;
const MIN_STAKE = 10;
const MAX_STAKE = 500;

function nowIso() {
  // SQLite-friendly UTC string ("YYYY-MM-DD HH:MM:SS")
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function plusMinutesIso(min) {
  return new Date(Date.now() + min * 60_000).toISOString().replace('T', ' ').slice(0, 19);
}

function plusHoursIso(h) {
  return new Date(Date.now() + h * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
}

/* Walk through stale duels and expire them. Cheap query, called on every
   list/get so the UI is always self-healing without a background worker. */
function expireStale() {
  const now = nowIso();
  // Open duels past their 24h window
  db.prepare(`
    UPDATE duels SET status = 'expired', updated_at = ?
    WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at <= ?
  `).run(now, now);
  // Active duels past their 60min window — finalize as a draw (no winner, no XP move)
  db.prepare(`
    UPDATE duels SET status = 'expired', finished_at = ?, updated_at = ?
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?
  `).run(now, now, now);
}

/* Counts user XP from CTF solves + lessons + certs so we can deny duels
   that would put them underwater. We don't deduct XP from a real wallet —
   we record duel results and the leaderboard sums the swing — but a sanity
   floor is still nice. */
function userCtfXp(userId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(c.points), 0) AS xp
    FROM solves s JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ?
  `).get(userId);
  return row?.xp || 0;
}

function rowToDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    stake: row.stake,
    message: row.message,
    started_at: row.started_at,
    finished_at: row.finished_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    challenger: { id: row.challenger_id, username: row.ch_username, display_name: row.ch_display, avatar_url: row.ch_avatar },
    opponent:  row.opponent_id
      ? { id: row.opponent_id, username: row.op_username, display_name: row.op_display, avatar_url: row.op_avatar }
      : null,
    challenge: { id: row.challenge_id, slug: row.c_slug, title: row.c_title, category: row.c_category, difficulty: row.c_difficulty, points: row.c_points },
    winner_id: row.winner_id,
  };
}

const SELECT_BASE = `
  SELECT d.*,
         cu.username AS ch_username, cu.display_name AS ch_display, cu.avatar_url AS ch_avatar,
         ou.username AS op_username, ou.display_name AS op_display, ou.avatar_url AS op_avatar,
         c.slug AS c_slug, c.title AS c_title, c.category AS c_category, c.difficulty AS c_difficulty, c.points AS c_points
  FROM duels d
  JOIN users cu      ON cu.id = d.challenger_id
  LEFT JOIN users ou ON ou.id = d.opponent_id
  JOIN challenges c  ON c.id  = d.challenge_id
`;

/* ============================================================
   GET /api/duels — list duels, grouped by section.

   Sections:
   - open    : status='open' AND opponent_id IS NULL  (anyone can accept)
   - mine    : duels involving the signed-in user (any status)
   - active  : status='active' (currently being raced)
   - recent  : last 20 finished/expired/cancelled
   ============================================================ */
router.get('/', optionalAuth, (req, res) => {
  expireStale();

  const open = db.prepare(`
    ${SELECT_BASE}
    WHERE d.status = 'open' AND d.opponent_id IS NULL
    ORDER BY d.created_at DESC
    LIMIT 30
  `).all().map(rowToDto);

  const active = db.prepare(`
    ${SELECT_BASE}
    WHERE d.status = 'active'
    ORDER BY d.started_at DESC
    LIMIT 30
  `).all().map(rowToDto);

  const recent = db.prepare(`
    ${SELECT_BASE}
    WHERE d.status IN ('finished', 'expired', 'cancelled')
    ORDER BY COALESCE(d.finished_at, d.updated_at) DESC
    LIMIT 20
  `).all().map(rowToDto);

  let mine = [];
  if (req.user) {
    mine = db.prepare(`
      ${SELECT_BASE}
      WHERE d.challenger_id = ? OR d.opponent_id = ?
      ORDER BY d.created_at DESC
      LIMIT 30
    `).all(req.user.id, req.user.id).map(rowToDto);
  }

  res.json({ open, active, mine, recent, viewer: req.user ? { id: req.user.id, username: req.user.username } : null });
});

/* GET /api/duels/leaderboard — W-L records sorted by net XP swing. */
router.get('/leaderboard', (_req, res) => {
  expireStale();
  const rows = db.prepare(`
    WITH parts AS (
      SELECT challenger_id AS uid, winner_id, stake, status FROM duels WHERE status = 'finished'
      UNION ALL
      SELECT opponent_id   AS uid, winner_id, stake, status FROM duels WHERE status = 'finished' AND opponent_id IS NOT NULL
    ),
    agg AS (
      SELECT uid,
             SUM(CASE WHEN winner_id = uid THEN 1 ELSE 0 END) AS wins,
             SUM(CASE WHEN winner_id IS NOT NULL AND winner_id <> uid THEN 1 ELSE 0 END) AS losses,
             SUM(CASE WHEN winner_id = uid THEN stake
                      WHEN winner_id IS NOT NULL AND winner_id <> uid THEN -stake
                      ELSE 0 END) AS xp_swing
      FROM parts GROUP BY uid
    )
    SELECT u.username, u.display_name, u.avatar_url, a.wins, a.losses, a.xp_swing
    FROM agg a JOIN users u ON u.id = a.uid
    ORDER BY a.xp_swing DESC, a.wins DESC, u.username ASC
    LIMIT 20
  `).all();
  res.json({ leaderboard: rows });
});

/* GET /api/duels/:id — full duel detail incl. submission timeline. */
router.get('/:id', optionalAuth, (req, res) => {
  expireStale();
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  const row = db.prepare(`${SELECT_BASE} WHERE d.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Duel not found' });

  const dto = rowToDto(row);

  // Submission timeline — never expose the literal flag attempts to anyone
  // but the submitter, just timing + correctness.
  const subs = db.prepare(`
    SELECT s.id, s.user_id, s.is_correct, s.submitted_at,
           u.username, u.display_name, u.avatar_url
    FROM duel_submissions s JOIN users u ON u.id = s.user_id
    WHERE s.duel_id = ?
    ORDER BY s.submitted_at ASC
  `).all(id).map((s) => ({
    id: s.id, user_id: s.user_id,
    username: s.username, display_name: s.display_name, avatar_url: s.avatar_url,
    is_correct: !!s.is_correct, submitted_at: s.submitted_at,
  }));

  // Show whether the *viewer* has already solved this challenge in the regular
  // CTF (which would be cheating in a duel) so the UI can warn.
  let viewerHasSolvedChallenge = false;
  if (req.user) {
    viewerHasSolvedChallenge = !!db.prepare(
      'SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?'
    ).get(req.user.id, dto.challenge.id);
  }

  res.json({
    duel: dto,
    submissions: subs,
    viewer: req.user ? { id: req.user.id, username: req.user.username, hasSolvedChallenge: viewerHasSolvedChallenge } : null,
  });
});

/* ============================================================
   POST /api/duels — issue a new duel.
   Body: { challenge_slug, opponent_username?, stake?, message? }
   ============================================================ */
router.post('/', requireAuth, (req, res) => {
  const { challenge_slug, opponent_username, stake, message } = req.body || {};
  if (!challenge_slug) return res.status(400).json({ error: 'Pick a challenge.' });

  const stakeN = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Number(stake) || 50));
  const ch = db.prepare(`SELECT id, slug, title FROM challenges WHERE slug = ? AND published = 1`).get(challenge_slug);
  if (!ch) return res.status(404).json({ error: 'Challenge not found.' });

  // Block challenges the issuer has already solved — they'd race with prior
  // knowledge. (We DO let them re-issue against same challenge in different duels.)
  const alreadySolved = db.prepare('SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, ch.id);
  if (alreadySolved) return res.status(400).json({ error: 'You already solved this challenge — pick another.' });

  // XP-floor sanity: don't let people stake more than they have.
  const xp = userCtfXp(req.user.id);
  if (stakeN > xp + MIN_STAKE) {
    return res.status(400).json({ error: `You only have ${xp} XP — stake at most ${xp + MIN_STAKE}.` });
  }

  // Enforce one open + one active duel per user at a time (prevents flooding).
  const existing = db.prepare(`
    SELECT COUNT(*) AS c FROM duels
    WHERE challenger_id = ? AND status IN ('open', 'active')
  `).get(req.user.id).c;
  if (existing >= 3) return res.status(400).json({ error: 'You already have 3 active or open duels. Wait for one to resolve.' });

  let opponentId = null;
  if (opponent_username) {
    const op = db.prepare('SELECT id, username FROM users WHERE username = ?').get(opponent_username);
    if (!op) return res.status(404).json({ error: 'No user with that username.' });
    if (op.id === req.user.id) return res.status(400).json({ error: "You can't duel yourself."});
    // Don't auto-accept on their behalf — they still see this on /duels and
    // click Accept. Same for open duels. Avoids surprise XP loss.
    opponentId = op.id;
    // Also block if opponent has already solved the challenge.
    const opSolved = db.prepare('SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?').get(op.id, ch.id);
    if (opSolved) return res.status(400).json({ error: 'That opponent has already solved this challenge — pick another.' });
  }

  const expiresAt = plusHoursIso(OPEN_TIMEOUT_HOURS);
  const info = db.prepare(`
    INSERT INTO duels (challenger_id, opponent_id, challenge_id, stake, message, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, opponentId, ch.id, stakeN, (message || '').slice(0, 280) || null, expiresAt);

  // Notify the called-out user (if any). Open duels don't notify.
  if (opponentId) {
    emitNotification({
      userId: opponentId,
      kind: 'duel:invited',
      title: `${req.user.display_name || req.user.username} challenged you to a duel`,
      body:  `${ch.title} · ${stakeN} XP at stake`,
      link:  `/duels/${info.lastInsertRowid}`,
      icon:  'duel',
    });
  }

  res.json({ id: info.lastInsertRowid });
});

/* POST /api/duels/:id/accept — opponent (or any signed-in user, for an
   open duel) takes the bet. Starts the 60-minute clock. */
router.post('/:id/accept', requireAuth, (req, res) => {
  expireStale();
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Duel not found' });
  if (d.status !== 'open') return res.status(400).json({ error: 'This duel is no longer open.' });
  if (d.challenger_id === req.user.id) return res.status(400).json({ error: "You can't accept your own duel." });
  if (d.opponent_id && d.opponent_id !== req.user.id) {
    return res.status(403).json({ error: 'This duel was issued to a specific user.' });
  }

  // Refuse if the would-be opponent already solved the challenge.
  const solved = db.prepare('SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, d.challenge_id);
  if (solved) return res.status(400).json({ error: "You've already solved this challenge — that wouldn't be a fair race." });

  // Stake floor for the acceptor too.
  const xp = userCtfXp(req.user.id);
  if (d.stake > xp + MIN_STAKE) {
    return res.status(400).json({ error: `You only have ${xp} XP — can't cover the ${d.stake} XP stake.` });
  }

  const now = nowIso();
  db.prepare(`
    UPDATE duels SET opponent_id = ?, status = 'active', started_at = ?, updated_at = ?, expires_at = ?
    WHERE id = ?
  `).run(req.user.id, now, now, plusMinutesIso(ACTIVE_TIMEOUT_MIN), id);

  // Notify the challenger that the duel is live.
  emitNotification({
    userId: d.challenger_id,
    kind: 'duel:accepted',
    title: `${req.user.display_name || req.user.username} accepted your duel`,
    body:  `Race is on — 60 minutes`,
    link:  `/duels/${id}`,
    icon:  'duel',
  });

  res.json({ ok: true });
});

/* POST /api/duels/:id/cancel — challenger withdraws an UN-accepted duel. */
router.post('/:id/cancel', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Duel not found' });
  if (d.challenger_id !== req.user.id) return res.status(403).json({ error: 'Only the challenger can cancel.' });
  if (d.status !== 'open') return res.status(400).json({ error: 'Only open duels can be cancelled.' });
  db.prepare(`UPDATE duels SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(nowIso(), id);
  res.json({ ok: true });
});

/* POST /api/duels/:id/forfeit — either side gives up while the duel is active.
   Counts as a loss; opponent wins by default. */
router.post('/:id/forfeit', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Duel not found' });
  if (d.status !== 'active') return res.status(400).json({ error: 'Duel is not active.' });
  if (d.challenger_id !== req.user.id && d.opponent_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the duelists can forfeit.' });
  }
  const winnerId = d.challenger_id === req.user.id ? d.opponent_id : d.challenger_id;
  const now = nowIso();
  db.prepare(`
    UPDATE duels SET status = 'finished', winner_id = ?, finished_at = ?, updated_at = ?
    WHERE id = ?
  `).run(winnerId, now, now, id);

  emitNotification({
    userId: winnerId,
    kind: 'duel:won',
    title: 'Duel forfeit — you won',
    body:  `+${d.stake} XP`,
    link:  `/duels/${id}`,
    icon:  'duel',
  });

  res.json({ ok: true, winner_id: winnerId });
});

/* POST /api/duels/:id/submit — submit a flag during an active duel.
   Same hashing + per-minute throttling as /api/challenges/:slug/submit. */
router.post('/:id/submit', requireAuth, (req, res) => {
  expireStale();
  const id = Number(req.params.id);
  const { flag } = req.body || {};
  if (!flag || typeof flag !== 'string') return res.status(400).json({ error: 'Enter a flag.' });

  const d = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Duel not found' });
  if (d.status !== 'active') return res.status(400).json({ error: 'This duel is not active.' });
  if (d.challenger_id !== req.user.id && d.opponent_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the duelists can submit.' });
  }
  if (d.expires_at && d.expires_at <= nowIso()) {
    db.prepare(`UPDATE duels SET status = 'expired', finished_at = ?, updated_at = ? WHERE id = ?`)
      .run(nowIso(), nowIso(), id);
    return res.status(400).json({ error: 'Time ran out — duel expired.' });
  }

  // Per-minute throttle (5/min/duel/user) so a user can't brute-force.
  const recent = db.prepare(`
    SELECT COUNT(*) AS c FROM duel_submissions
    WHERE duel_id = ? AND user_id = ? AND submitted_at > datetime('now', '-1 minute')
  `).get(id, req.user.id).c;
  if (recent >= 5) return res.status(429).json({ error: 'Too many attempts. Slow down.' });

  const ch = db.prepare('SELECT id, flag_hash, slug FROM challenges WHERE id = ?').get(d.challenge_id);
  const isCorrect = sha256(flag.trim()) === ch.flag_hash;

  db.prepare(`
    INSERT INTO duel_submissions (duel_id, user_id, submitted_flag, is_correct)
    VALUES (?, ?, ?, ?)
  `).run(id, req.user.id, flag.trim(), isCorrect ? 1 : 0);

  if (!isCorrect) return res.json({ correct: false });

  // First-correct-flag wins. Atomic UPDATE with the WHERE-status='active' guard
  // prevents both submissions racing through.
  const now = nowIso();
  const upd = db.prepare(`
    UPDATE duels SET status = 'finished', winner_id = ?, finished_at = ?, updated_at = ?
    WHERE id = ? AND status = 'active'
  `).run(req.user.id, now, now, id);

  // Even if we lost the race-to-finish (someone else flipped status first),
  // we still credit the underlying CTF solve so the player keeps their
  // points — the duel just doesn't pay out.
  db.prepare(`INSERT OR IGNORE INTO solves (user_id, challenge_id) VALUES (?, ?)`)
    .run(req.user.id, ch.id);

  if (upd.changes !== 1) {
    // Duel finished by the other side first.
    return res.json({ correct: true, won: false });
  }

  // Notify the loser so they know it's over.
  const loserId = req.user.id === d.challenger_id ? d.opponent_id : d.challenger_id;
  if (loserId) {
    emitNotification({
      userId: loserId,
      kind: 'duel:lost',
      title: 'Duel — opponent flagged first',
      body:  `-${d.stake} XP`,
      link:  `/duels/${id}`,
      icon:  'duel',
    });
  }

  res.json({ correct: true, won: true, stake: d.stake });
});

export default router;
