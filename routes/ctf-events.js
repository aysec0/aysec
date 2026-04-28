import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const now = () => new Date().toISOString();

function statusOf(ev) {
  const t = Date.now();
  if (Date.parse(ev.starts_at) > t) return 'upcoming';
  if (Date.parse(ev.ends_at)   < t) return 'ended';
  return 'live';
}

router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM ctf_event_participants p WHERE p.event_id = e.id) AS participants,
      (SELECT COUNT(*) FROM ctf_event_challenges c    WHERE c.event_id = e.id) AS challenge_count
    FROM ctf_events e ORDER BY e.starts_at DESC LIMIT 50
  `).all();
  res.json({ events: rows.map((r) => ({ ...r, status: statusOf(r) })) });
});

router.get('/:slug', optionalAuth, (req, res) => {
  const ev = db.prepare('SELECT * FROM ctf_events WHERE slug = ?').get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  ev.status = statusOf(ev);

  const challenges = db.prepare(`
    SELECT c.id, c.slug, c.title, c.category, c.difficulty,
           COALESCE(ec.points, c.points) AS points,
           ec.position
    FROM ctf_event_challenges ec
    JOIN challenges c ON c.id = ec.challenge_id
    WHERE ec.event_id = ?
    ORDER BY ec.position ASC, c.id ASC
  `).all(ev.id);

  const participants = db.prepare(
    'SELECT COUNT(*) AS c FROM ctf_event_participants WHERE event_id = ?'
  ).get(ev.id).c;

  // Leaderboard within the event window
  const board = db.prepare(`
    SELECT u.username, u.display_name,
           SUM(COALESCE(ec.points, c.points)) AS score,
           COUNT(*) AS solves,
           MAX(es.solved_at) AS last_solve
    FROM ctf_event_solves es
    JOIN users u            ON u.id = es.user_id
    JOIN challenges c       ON c.id = es.challenge_id
    JOIN ctf_event_challenges ec
      ON ec.event_id = es.event_id AND ec.challenge_id = es.challenge_id
    WHERE es.event_id = ?
    GROUP BY es.user_id
    ORDER BY score DESC, last_solve ASC
    LIMIT 50
  `).all(ev.id);

  // Your status
  let me = null;
  if (req.user) {
    const joined = db.prepare(
      'SELECT 1 FROM ctf_event_participants WHERE event_id = ? AND user_id = ?'
    ).get(ev.id, req.user.id);
    const solved = db.prepare(`
      SELECT challenge_id FROM ctf_event_solves WHERE event_id = ? AND user_id = ?
    `).all(ev.id, req.user.id).map((r) => r.challenge_id);
    me = { joined: !!joined, solved };
  }

  res.json({ event: ev, challenges, participants, board, me });
});

router.post('/:slug/join', requireAuth, (req, res) => {
  const ev = db.prepare('SELECT id, ends_at FROM ctf_events WHERE slug = ?').get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  if (Date.parse(ev.ends_at) < Date.now()) return res.status(400).json({ error: 'Event has ended' });
  db.prepare(
    'INSERT OR IGNORE INTO ctf_event_participants (event_id, user_id) VALUES (?, ?)'
  ).run(ev.id, req.user.id);
  res.json({ joined: true });
});

router.post('/:slug/submit', requireAuth, (req, res) => {
  const { challenge_slug, flag } = req.body || {};
  if (!challenge_slug || !flag) return res.status(400).json({ error: 'Missing challenge_slug or flag' });

  const ev = db.prepare('SELECT id, starts_at, ends_at FROM ctf_events WHERE slug = ?').get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const t = Date.now();
  if (Date.parse(ev.starts_at) > t) return res.status(400).json({ error: 'Event hasn’t started' });
  if (Date.parse(ev.ends_at)   < t) return res.status(400).json({ error: 'Event has ended' });

  const ch = db.prepare('SELECT id, flag_hash FROM challenges WHERE slug = ?').get(challenge_slug);
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });
  const inEvent = db.prepare(
    'SELECT 1 FROM ctf_event_challenges WHERE event_id = ? AND challenge_id = ?'
  ).get(ev.id, ch.id);
  if (!inEvent) return res.status(400).json({ error: 'Challenge not in this event' });

  // Light rate limit
  const recent = db.prepare(`
    SELECT COUNT(*) AS c FROM submissions
    WHERE user_id = ? AND challenge_id = ? AND submitted_at > datetime('now', '-1 minute')
  `).get(req.user.id, ch.id).c;
  if (recent >= 5) return res.status(429).json({ error: 'Too many attempts' });

  const correct = sha256(flag.trim()) === ch.flag_hash;
  db.prepare(`
    INSERT INTO submissions (user_id, challenge_id, submitted_flag, is_correct, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, ch.id, flag.trim(), correct ? 1 : 0, req.ip);

  if (correct) {
    db.prepare(
      'INSERT OR IGNORE INTO ctf_event_solves (event_id, user_id, challenge_id) VALUES (?, ?, ?)'
    ).run(ev.id, req.user.id, ch.id);
    db.prepare(
      'INSERT OR IGNORE INTO ctf_event_participants (event_id, user_id) VALUES (?, ?)'
    ).run(ev.id, req.user.id);
    db.prepare(
      'INSERT OR IGNORE INTO solves (user_id, challenge_id) VALUES (?, ?)'
    ).run(req.user.id, ch.id);
  }
  res.json({ correct });
});

export default router;
