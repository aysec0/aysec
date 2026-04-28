import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const todayDate = () => new Date().toISOString().slice(0, 10);

/* If no daily_challenge row exists for today, auto-pick a published one
   deterministically from the date so the page always has a challenge. */
function getOrSeedToday() {
  const date = todayDate();
  let row = db.prepare('SELECT * FROM daily_challenges WHERE date = ?').get(date);
  if (row) return { ...row, date };
  const all = db.prepare(
    'SELECT id FROM challenges WHERE published = 1 ORDER BY id'
  ).all();
  if (!all.length) return null;
  // Pick one deterministically from date
  const idx = parseInt(date.replace(/-/g, ''), 10) % all.length;
  const challengeId = all[idx].id;
  db.prepare(
    'INSERT OR IGNORE INTO daily_challenges (date, challenge_id) VALUES (?, ?)'
  ).run(date, challengeId);
  row = db.prepare('SELECT * FROM daily_challenges WHERE date = ?').get(date);
  return row;
}

function recomputeStreak(userId) {
  // Walk backwards from today until a gap
  const dates = db.prepare(
    'SELECT date FROM daily_solves WHERE user_id = ? ORDER BY date DESC'
  ).all(userId).map((r) => r.date);
  if (!dates.length) {
    db.prepare(`
      INSERT INTO daily_streaks (user_id, current, longest, last_date)
      VALUES (?, 0, 0, NULL)
      ON CONFLICT(user_id) DO UPDATE SET current = 0
    `).run(userId);
    return { current: 0, longest: 0 };
  }
  // current streak: consecutive days ending today or yesterday
  let cur = 0;
  let cursor = new Date(); cursor.setUTCHours(0, 0, 0, 0);
  // allow yesterday-tail
  const today = cursor.toISOString().slice(0, 10);
  const startIdx = dates[0] === today ? 0 : 1;
  cursor = new Date(dates[startIdx === 0 ? 0 : 0]);
  for (let i = 0; i < dates.length; i++) {
    const expect = new Date(cursor); expect.setUTCDate(expect.getUTCDate() - i);
    if (dates[i] === expect.toISOString().slice(0, 10)) cur++;
    else break;
  }
  // longest streak: walk through all dates ascending
  const asc = [...dates].reverse();
  let longest = 1, run = 1;
  for (let i = 1; i < asc.length; i++) {
    const prev = new Date(asc[i - 1] + 'T00:00:00Z');
    const cur2 = new Date(asc[i]      + 'T00:00:00Z');
    const diff = Math.round((cur2 - prev) / 86400000);
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }
  const existing = db.prepare('SELECT longest FROM daily_streaks WHERE user_id = ?').get(userId);
  const newLongest = Math.max(longest, existing?.longest || 0);
  db.prepare(`
    INSERT INTO daily_streaks (user_id, current, longest, last_date)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET current = excluded.current, longest = excluded.longest, last_date = excluded.last_date
  `).run(userId, cur, newLongest, dates[0]);
  return { current: cur, longest: newLongest };
}

router.get('/today', optionalAuth, (req, res) => {
  const row = getOrSeedToday();
  if (!row) return res.json({ challenge: null });
  const ch = db.prepare(`
    SELECT id, slug, title, category, difficulty, points, description, author
    FROM challenges WHERE id = ?
  `).get(row.challenge_id);
  const date = row.date;

  // Top 10 fastest today
  const top = db.prepare(`
    SELECT u.username, u.display_name, ds.time_seconds, ds.solved_at
    FROM daily_solves ds JOIN users u ON u.id = ds.user_id
    WHERE ds.date = ? ORDER BY ds.time_seconds ASC LIMIT 10
  `).all(date);

  // Your status
  let me = null;
  if (req.user) {
    const mine = db.prepare(
      'SELECT time_seconds, solved_at FROM daily_solves WHERE user_id = ? AND date = ?'
    ).get(req.user.id, date);
    const streak = db.prepare(
      'SELECT current, longest, last_date FROM daily_streaks WHERE user_id = ?'
    ).get(req.user.id) || { current: 0, longest: 0, last_date: null };
    me = { solved: !!mine, time_seconds: mine?.time_seconds || null, streak };
  }
  res.json({ date, bonus_points: row.bonus_points, challenge: ch, top, me });
});

router.post('/start', requireAuth, (req, res) => {
  // Server-set start time; client uses for stopwatch on resume.
  const date = todayDate();
  // Don't reset if already solved
  const solved = db.prepare(
    'SELECT 1 FROM daily_solves WHERE user_id = ? AND date = ?'
  ).get(req.user.id, date);
  if (solved) return res.json({ alreadySolved: true });
  // Use the user's first attempt today as the started_at — store in submissions table existence
  res.json({ startedAt: new Date().toISOString() });
});

router.post('/submit', requireAuth, (req, res) => {
  const { flag, startedAt } = req.body || {};
  if (!flag || typeof flag !== 'string') return res.status(400).json({ error: 'Missing flag' });
  const startMs = startedAt ? Date.parse(startedAt) : Date.now();
  if (isNaN(startMs)) return res.status(400).json({ error: 'Bad startedAt' });

  const row = getOrSeedToday();
  if (!row) return res.status(404).json({ error: 'No challenge today' });
  const ch = db.prepare('SELECT id, flag_hash FROM challenges WHERE id = ?').get(row.challenge_id);
  if (!ch) return res.status(404).json({ error: 'Challenge missing' });

  // Light rate limit (5/min per user across daily)
  const recent = db.prepare(`
    SELECT COUNT(*) AS c FROM submissions
    WHERE user_id = ? AND challenge_id = ? AND submitted_at > datetime('now', '-1 minute')
  `).get(req.user.id, ch.id).c;
  if (recent >= 5) return res.status(429).json({ error: 'Too many attempts. Slow down.' });

  const correct = sha256(flag.trim()) === ch.flag_hash;
  db.prepare(`
    INSERT INTO submissions (user_id, challenge_id, submitted_flag, is_correct, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, ch.id, flag.trim(), correct ? 1 : 0, req.ip);

  if (!correct) return res.json({ correct: false });

  const date = row.date;
  const seconds = Math.max(1, Math.round((Date.now() - startMs) / 1000));
  db.prepare(`
    INSERT OR IGNORE INTO daily_solves (user_id, date, time_seconds) VALUES (?, ?, ?)
  `).run(req.user.id, date, seconds);
  // Also record a normal solve (gives global points + counts toward leaderboard)
  db.prepare(`
    INSERT OR IGNORE INTO solves (user_id, challenge_id) VALUES (?, ?)
  `).run(req.user.id, ch.id);
  const streak = recomputeStreak(req.user.id);
  res.json({ correct: true, time_seconds: seconds, streak });
});

router.get('/streaks/top', (_req, res) => {
  const rows = db.prepare(`
    SELECT u.username, u.display_name, s.current, s.longest
    FROM daily_streaks s JOIN users u ON u.id = s.user_id
    ORDER BY s.current DESC, s.longest DESC LIMIT 20
  `).all();
  res.json({ top: rows });
});

export default router;
