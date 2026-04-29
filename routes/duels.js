/* ============================================================
   Duels — chess.com-style 1v1 challenge races.

   Players pick a FORMAT (Recon / Burst / Blitz / Operation /
   Long-form) — each format has its own time limit, difficulty
   pool, and rating-points reward. The server picks a random
   unsolved challenge from the format's pool. No XP staking up
   front — winning bumps your rating in that format, losing drops
   it. New players start at 1000.

   Open formats wait for someone to click "Find a match" in the
   same format. Direct calls-out work the same as before.
   ============================================================ */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { emit as emitNotification } from './notifications.js';
import { emitActivity } from './activity.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const OPEN_TIMEOUT_HOURS = 24;
const STARTING_RATING = 1000;

/* ============================================================
   Match formats — five flavors of 1v1, named after offensive
   security stages so they read in-context for the audience.
   ============================================================ */
const FORMATS = {
  recon: {
    id: 'recon',
    name: 'Recon',
    desc: 'Snap challenge, fastest finger wins',
    minutes: 3,
    pool: ['easy'],
    points_win: 25,
    points_loss: 10,
    icon: '🔍',
    color: '#39ff7a',
  },
  burst: {
    id: 'burst',
    name: 'Burst',
    desc: 'Quick speed-run',
    minutes: 10,
    pool: ['easy', 'medium'],
    points_win: 50,
    points_loss: 20,
    icon: '⚡',
    color: '#7aa2f7',
  },
  blitz: {
    id: 'blitz',
    name: 'Blitz',
    desc: 'Mid-pressure shootout',
    minutes: 30,
    pool: ['medium', 'hard'],
    points_win: 100,
    points_loss: 40,
    icon: '🔥',
    color: '#ffb74d',
  },
  operation: {
    id: 'operation',
    name: 'Operation',
    desc: 'Hard, focused engagement',
    minutes: 60,
    pool: ['hard'],
    points_win: 200,
    points_loss: 80,
    icon: '🎯',
    color: '#f25555',
  },
  longform: {
    id: 'longform',
    name: 'Long-form',
    desc: 'Insane challenge, deep dive',
    minutes: 180,
    pool: ['insane'],
    points_win: 400,
    points_loss: 150,
    icon: '🛡',
    color: '#bb88ff',
  },
};
const FORMAT_IDS = Object.keys(FORMATS);

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

/* Get-or-create a duel_ratings row for (user, format). New users start at
   STARTING_RATING (1000) — chess.com convention so the math is familiar. */
function getRating(userId, formatId) {
  let row = db.prepare(
    'SELECT * FROM duel_ratings WHERE user_id = ? AND format = ?'
  ).get(userId, formatId);
  if (!row) {
    db.prepare(`
      INSERT INTO duel_ratings (user_id, format, rating)
      VALUES (?, ?, ?)
    `).run(userId, formatId, STARTING_RATING);
    row = { user_id: userId, format: formatId, rating: STARTING_RATING, wins: 0, losses: 0, draws: 0 };
  }
  return row;
}

/* Apply +win/-loss to a rating row, with a soft floor at 0. */
function applyRatingChange(userId, formatId, delta, outcome /* 'win' | 'loss' | 'draw' */) {
  const r = getRating(userId, formatId);
  const newRating = Math.max(0, r.rating + delta);
  const winsInc = outcome === 'win' ? 1 : 0;
  const lossInc = outcome === 'loss' ? 1 : 0;
  const drawInc = outcome === 'draw' ? 1 : 0;
  db.prepare(`
    UPDATE duel_ratings
    SET rating = ?, wins = wins + ?, losses = losses + ?, draws = draws + ?,
        played_at = datetime('now')
    WHERE user_id = ? AND format = ?
  `).run(newRating, winsInc, lossInc, drawInc, userId, formatId);
  return newRating;
}

function rowToDto(row) {
  if (!row) return null;
  const fmt = row.format ? FORMATS[row.format] : null;
  return {
    id: row.id,
    status: row.status,
    format: fmt ? { id: fmt.id, name: fmt.name, icon: fmt.icon, color: fmt.color, minutes: fmt.minutes, points_win: fmt.points_win } : null,
    stake: row.stake,                 // legacy field, kept so old duels still display
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

/* GET /api/duels/leaderboard — top duelists by overall rating. By default
   sums every format. Pass ?format=blitz to scope to one. */
router.get('/leaderboard', (req, res) => {
  expireStale();
  const formatId = req.query.format;
  const where = formatId && FORMAT_IDS.includes(formatId) ? `WHERE r.format = ?` : '';
  const params = formatId && FORMAT_IDS.includes(formatId) ? [formatId] : [];
  const rows = db.prepare(`
    SELECT u.username, u.display_name, u.avatar_url,
           SUM(r.rating - 1000) AS rating_swing,
           SUM(r.wins)          AS wins,
           SUM(r.losses)        AS losses
    FROM duel_ratings r JOIN users u ON u.id = r.user_id
    ${where}
    GROUP BY u.id
    HAVING wins + losses > 0
    ORDER BY rating_swing DESC, wins DESC, u.username ASC
    LIMIT 20
  `).all(...params);
  // Keep `xp_swing` field name for backward compat with the existing client
  res.json({ leaderboard: rows.map((r) => ({ ...r, xp_swing: r.rating_swing })) });
});

/* GET /api/duels/formats — config used by the client to render the picker.
   Defined BEFORE /:id so Express matches the literal "formats" path first. */
router.get('/formats', (_req, res) => {
  res.json({
    formats: FORMAT_IDS.map((id) => {
      const f = FORMATS[id];
      // Count open + active duels per format so the picker can show a "live" badge
      const open = db.prepare(`SELECT COUNT(*) AS c FROM duels WHERE format = ? AND status = 'open' AND opponent_id IS NULL`).get(id).c;
      const active = db.prepare(`SELECT COUNT(*) AS c FROM duels WHERE format = ? AND status = 'active'`).get(id).c;
      return { ...f, open_count: open, active_count: active };
    }),
  });
});

/* GET /api/duels/rating/:username — show a user's per-format rating. */
router.get('/rating/:username', (req, res) => {
  const u = db.prepare('SELECT id, username FROM users WHERE username = ?').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'No such user' });
  const ratings = {};
  for (const id of FORMAT_IDS) {
    const r = db.prepare('SELECT rating, wins, losses, draws FROM duel_ratings WHERE user_id = ? AND format = ?').get(u.id, id);
    ratings[id] = r || { rating: STARTING_RATING, wins: 0, losses: 0, draws: 0 };
  }
  res.json({ user: { username: u.username }, ratings });
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

/* Pick a random unsolved challenge from a format's difficulty pool that
   neither player has already solved. Returns null if the pool is empty. */
function pickChallengeForFormat(formatId, userIds = []) {
  const fmt = FORMATS[formatId];
  if (!fmt) return null;
  const placeholders = fmt.pool.map(() => '?').join(',');
  // Exclude challenges any of the listed users has already solved.
  const exclude = userIds.length
    ? `AND id NOT IN (SELECT challenge_id FROM solves WHERE user_id IN (${userIds.map(() => '?').join(',')}))`
    : '';
  const rows = db.prepare(`
    SELECT id, slug, title, difficulty, points
    FROM challenges
    WHERE published = 1 AND difficulty IN (${placeholders}) ${exclude}
    ORDER BY RANDOM()
    LIMIT 1
  `).all(...fmt.pool, ...userIds);
  return rows[0] || null;
}

/* ============================================================
   POST /api/duels — issue a new duel by FORMAT.
   Body: { format, opponent_username?, message? }
     format          — required. one of: recon | burst | blitz | operation | longform
     opponent_username — optional, calls them out by handle
     message         — optional 280-char trash talk
   No XP staking. Server picks the challenge from the format pool.
   ============================================================ */
router.post('/', requireAuth, (req, res) => {
  const { format, opponent_username, message } = req.body || {};
  if (!FORMAT_IDS.includes(format)) {
    return res.status(400).json({ error: `Pick a format: ${FORMAT_IDS.join(', ')}.` });
  }
  const fmt = FORMATS[format];

  // Cap concurrent duels so one player can't flood the queue
  const existing = db.prepare(`
    SELECT COUNT(*) AS c FROM duels
    WHERE challenger_id = ? AND status IN ('open', 'active')
  `).get(req.user.id).c;
  if (existing >= 3) {
    return res.status(400).json({ error: 'You already have 3 active or open duels. Resolve one first.' });
  }

  let opponentId = null;
  if (opponent_username) {
    const op = db.prepare('SELECT id, username FROM users WHERE username = ?').get(opponent_username);
    if (!op) return res.status(404).json({ error: 'No user with that username.' });
    if (op.id === req.user.id) return res.status(400).json({ error: "You can't duel yourself." });
    opponentId = op.id;
  }

  // Pick a challenge that none of the listed players have already solved.
  const userIds = opponentId ? [req.user.id, opponentId] : [req.user.id];
  const ch = pickChallengeForFormat(format, userIds);
  if (!ch) {
    return res.status(400).json({ error: `No unsolved ${fmt.pool.join('/')} challenges available — try a different format.` });
  }

  const expiresAt = plusHoursIso(OPEN_TIMEOUT_HOURS);
  const info = db.prepare(`
    INSERT INTO duels (challenger_id, opponent_id, challenge_id, format, stake, message, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, opponentId, ch.id, format, fmt.points_win, (message || '').slice(0, 280) || null, expiresAt);

  // Pre-create rating rows so the leaderboard finds everyone
  getRating(req.user.id, format);
  if (opponentId) getRating(opponentId, format);

  if (opponentId) {
    emitNotification({
      userId: opponentId,
      kind: 'duel:invited',
      title: `${req.user.display_name || req.user.username} challenged you — ${fmt.name}`,
      body:  `${fmt.minutes}-min ${fmt.name} · +${fmt.points_win} on win`,
      link:  `/duels/${info.lastInsertRowid}`,
      icon:  'duel',
    });
  }

  res.json({ id: info.lastInsertRowid, format, challenge: { slug: ch.slug, title: ch.title } });
});

/* ============================================================
   POST /api/duels/quick-match/:format — chess.com-style "find game"
   Joins the oldest open duel in this format that the user can take,
   OR creates a new open duel and returns it for someone else to find.
   ============================================================ */
router.post('/quick-match/:format', requireAuth, (req, res) => {
  expireStale();
  const formatId = req.params.format;
  if (!FORMAT_IDS.includes(formatId)) {
    return res.status(400).json({ error: 'Unknown format.' });
  }
  const fmt = FORMATS[formatId];

  // Try to find a matching open duel where I can be the opponent
  const candidate = db.prepare(`
    SELECT d.* FROM duels d
    WHERE d.format = ?
      AND d.status = 'open'
      AND d.opponent_id IS NULL
      AND d.challenger_id != ?
      AND NOT EXISTS (SELECT 1 FROM solves s WHERE s.user_id = ? AND s.challenge_id = d.challenge_id)
    ORDER BY d.created_at ASC
    LIMIT 1
  `).get(formatId, req.user.id, req.user.id);

  if (candidate) {
    // Auto-accept it, kick off the active timer
    const now = nowIso();
    db.prepare(`
      UPDATE duels SET opponent_id = ?, status = 'active', started_at = ?, updated_at = ?, expires_at = ?
      WHERE id = ?
    `).run(req.user.id, now, now, plusMinutesIso(fmt.minutes), candidate.id);

    getRating(req.user.id, formatId);
    emitNotification({
      userId: candidate.challenger_id,
      kind: 'duel:accepted',
      title: `Match found — ${fmt.name}`,
      body:  `${fmt.minutes}-minute clock. Race is on.`,
      link:  `/duels/${candidate.id}`,
      icon:  'duel',
    });
    return res.json({ id: candidate.id, matched: true });
  }

  // No open duel — create a new one and let the caller wait
  const ch = pickChallengeForFormat(formatId, [req.user.id]);
  if (!ch) {
    return res.status(400).json({ error: `No unsolved ${fmt.pool.join('/')} challenges available.` });
  }
  const info = db.prepare(`
    INSERT INTO duels (challenger_id, opponent_id, challenge_id, format, stake, message, expires_at)
    VALUES (?, NULL, ?, ?, ?, NULL, ?)
  `).run(req.user.id, ch.id, formatId, fmt.points_win, plusHoursIso(OPEN_TIMEOUT_HOURS));
  getRating(req.user.id, formatId);
  res.json({ id: info.lastInsertRowid, matched: false });
});

/* POST /api/duels/:id/accept — opponent (or any signed-in user, for an
   open duel) takes the match. Starts the format's clock. */
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

  // Format determines the active timer. Legacy duels (format IS NULL) use 60 min.
  const fmt = d.format ? FORMATS[d.format] : null;
  const minutes = fmt ? fmt.minutes : 60;

  const now = nowIso();
  db.prepare(`
    UPDATE duels SET opponent_id = ?, status = 'active', started_at = ?, updated_at = ?, expires_at = ?
    WHERE id = ?
  `).run(req.user.id, now, now, plusMinutesIso(minutes), id);

  if (d.format) getRating(req.user.id, d.format);

  emitNotification({
    userId: d.challenger_id,
    kind: 'duel:accepted',
    title: `${req.user.display_name || req.user.username} accepted your duel`,
    body:  fmt ? `${fmt.name} · ${fmt.minutes}-min clock` : 'Race is on — 60 minutes',
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

  // Apply rating change
  let ratingDelta = null;
  if (d.format && winnerId) {
    const fmt = FORMATS[d.format];
    if (fmt) {
      applyRatingChange(winnerId, d.format, fmt.points_win, 'win');
      applyRatingChange(req.user.id, d.format, -fmt.points_loss, 'loss');
      ratingDelta = { win: fmt.points_win, loss: fmt.points_loss };
    }
  }

  emitNotification({
    userId: winnerId,
    kind: 'duel:won',
    title: 'Duel forfeit — you won',
    body:  ratingDelta ? `+${ratingDelta.win} rating` : `+${d.stake} XP`,
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
  const fmt = d.format ? FORMATS[d.format] : null;
  let ratingDelta = null;
  if (fmt) {
    applyRatingChange(req.user.id, d.format, fmt.points_win, 'win');
    if (loserId) applyRatingChange(loserId, d.format, -fmt.points_loss, 'loss');
    ratingDelta = { win: fmt.points_win, loss: fmt.points_loss };
  }

  if (loserId) {
    emitNotification({
      userId: loserId,
      kind: 'duel:lost',
      title: 'Duel — opponent flagged first',
      body:  ratingDelta ? `-${ratingDelta.loss} rating` : `-${d.stake} XP`,
      link:  `/duels/${id}`,
      icon:  'duel',
    });
  }

  // Activity entries for both sides so the global feed shows the matchup.
  const chalRow = db.prepare('SELECT title FROM challenges WHERE id = ?').get(d.challenge_id);
  const formatLabel = fmt ? `${fmt.icon} ${fmt.name}` : 'duel';
  const winLabel  = ratingDelta ? `+${ratingDelta.win} rating` : `+${d.stake} XP`;
  const lossLabel = ratingDelta ? `−${ratingDelta.loss} rating` : `−${d.stake} XP`;
  emitActivity({
    userId: req.user.id, kind: 'duel_won',
    title: `Won a ${fmt?.name || 'duel'} · ${winLabel}`,
    body:  `Beat ${loserId ? '@' + (db.prepare('SELECT username FROM users WHERE id = ?').get(loserId)?.username || '') : 'an opponent'} on ${chalRow?.title || 'a challenge'}`,
    link:  `/duels/${id}`,
    visibility: 'public',
    payload: { format: d.format, duel_id: id, ...ratingDelta },
  });
  if (loserId) {
    emitActivity({
      userId: loserId, kind: 'duel_lost',
      title: `Lost a ${fmt?.name || 'duel'} · ${lossLabel}`,
      body:  `Beaten by @${req.user.username} on ${chalRow?.title || 'a challenge'}`,
      link:  `/duels/${id}`,
      visibility: 'self',
      payload: { format: d.format, duel_id: id, ...ratingDelta },
    });
  }

  res.json({ correct: true, won: true, format: d.format, ...(ratingDelta || {}), stake: d.stake });
});

export default router;
