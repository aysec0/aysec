import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import * as discord from '../lib/discord.js';
import { emitActivity } from './activity.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

router.get('/', optionalAuth, (req, res) => {
  const challenges = db.prepare(`
    SELECT c.id, c.slug, c.title, c.category, c.difficulty, c.points, c.author,
           (SELECT COUNT(*) FROM solves s WHERE s.challenge_id = c.id) AS solves,
           CASE WHEN ? IS NULL THEN 0
                ELSE EXISTS(SELECT 1 FROM solves s WHERE s.challenge_id = c.id AND s.user_id = ?)
           END AS solved
    FROM challenges c
    WHERE c.published = 1
    ORDER BY c.points ASC, c.created_at DESC
  `).all(req.user?.id ?? null, req.user?.id ?? null);
  res.json({ challenges });
});

router.get('/:slug', optionalAuth, (req, res) => {
  const ch = db.prepare(`
    SELECT id, slug, title, category, difficulty, points, description, attachment_url, remote_url, hints, author
    FROM challenges WHERE slug = ? AND published = 1
  `).get(req.params.slug);
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });

  let hints = [];
  if (ch.hints) {
    try { hints = JSON.parse(ch.hints); if (!Array.isArray(hints)) hints = []; } catch { hints = []; }
  }

  const solves = db.prepare('SELECT COUNT(*) AS c FROM solves WHERE challenge_id = ?').get(ch.id).c;
  let solved = false;
  if (req.user) {
    solved = !!db.prepare('SELECT 1 FROM solves WHERE challenge_id = ? AND user_id = ?').get(ch.id, req.user.id);
  }

  const solvers = db.prepare(`
    SELECT u.username, u.display_name, s.solved_at
    FROM solves s
    JOIN users u ON u.id = s.user_id
    WHERE s.challenge_id = ?
    ORDER BY s.solved_at ASC
    LIMIT 10
  `).all(ch.id).map((r, i) => ({ ...r, first_blood: i === 0 }));

  // Don't ship the raw hints column to clients
  delete ch.hints;
  res.json({ challenge: ch, solves, solved, solvers, hints });
});

router.post('/:slug/submit', requireAuth, (req, res) => {
  const { flag } = req.body || {};
  if (!flag || typeof flag !== 'string') return res.status(400).json({ error: 'Missing flag' });

  const ch = db.prepare('SELECT id, flag_hash FROM challenges WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });

  // 5 attempts per minute per user per challenge
  const recent = db.prepare(`
    SELECT COUNT(*) AS c FROM submissions
    WHERE user_id = ? AND challenge_id = ? AND submitted_at > datetime('now', '-1 minute')
  `).get(req.user.id, ch.id).c;
  if (recent >= 5) return res.status(429).json({ error: 'Too many attempts. Slow down.' });

  const isCorrect = sha256(flag.trim()) === ch.flag_hash;

  db.prepare(`
    INSERT INTO submissions (user_id, challenge_id, submitted_flag, is_correct, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, ch.id, flag.trim(), isCorrect ? 1 : 0, req.ip);

  if (isCorrect) {
    const info = db.prepare(`
      INSERT OR IGNORE INTO solves (user_id, challenge_id) VALUES (?, ?)
    `).run(req.user.id, ch.id);

    // Only emit activity / announce first-blood on the genuine first solve
    // for this user (info.changes === 0 means a duplicate INSERT OR IGNORE).
    if (info.changes === 1) {
      const fullChal = db.prepare(
        'SELECT title, slug, points, category, difficulty FROM challenges WHERE id = ?'
      ).get(ch.id);
      const totalSolves = db.prepare(
        'SELECT COUNT(*) AS c FROM solves WHERE challenge_id = ?'
      ).get(ch.id).c;
      const isFirstBlood = totalSolves === 1;

      if (isFirstBlood) {
        discord.announceFirstBlood({
          userDisplay:    req.user.display_name,
          userUsername:   req.user.username,
          challengeTitle: fullChal.title,
          challengeSlug:  fullChal.slug,
          points:         fullChal.points,
        }).catch(() => {});
      }

      emitActivity({
        userId: req.user.id,
        kind: isFirstBlood ? 'first_blood' : 'solve',
        title: isFirstBlood
          ? `🩸 First blood on ${fullChal.title}`
          : `Solved ${fullChal.title}`,
        body: `${fullChal.category} · ${fullChal.difficulty} · ${fullChal.points} pts`,
        link: `/challenges/${fullChal.slug}`,
        visibility: 'public',
        payload: { points: fullChal.points, category: fullChal.category, difficulty: fullChal.difficulty },
      });
    }
  }

  res.json({ correct: isCorrect });
});

router.get('/leaderboard/top', async (_req, res) => {
  const { levelFor, computeXP } = await import('./levels.js');
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name,
           SUM(c.points) AS score,
           COUNT(s.id)   AS solves,
           MAX(s.solved_at) AS last_solve,
           (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = u.id) AS lessons_done,
           (SELECT COUNT(*) FROM certificates ct WHERE ct.user_id = u.id) AS certs,
           (SELECT COUNT(*) FROM solves s2 WHERE s2.user_id = u.id AND s2.solved_at = (
              SELECT MIN(s3.solved_at) FROM solves s3 WHERE s3.challenge_id = s2.challenge_id
           )) AS first_bloods
    FROM solves s
    JOIN users u      ON u.id = s.user_id
    JOIN challenges c ON c.id = s.challenge_id
    GROUP BY u.id
    ORDER BY score DESC, last_solve ASC
    LIMIT 50
  `).all();

  // Pull avatar_url for each user too
  const avById = Object.fromEntries(
    db.prepare('SELECT id, avatar_url FROM users').all().map((u) => [u.id, u.avatar_url])
  );
  const enriched = rows.map((r) => {
    const xp = computeXP({ ctf_points: r.score, lessons_done: r.lessons_done, certificates: r.certs, first_bloods: r.first_bloods });
    const level = levelFor(xp.total);
    return {
      username: r.username,
      display_name: r.display_name,
      avatar_url: avById[r.id] || null,
      score: r.score,
      solves: r.solves,
      last_solve: r.last_solve,
      level: { idx: level.level_idx, name: level.current.name, color: level.current.color, icon: level.current.icon },
    };
  });
  res.json({ leaderboard: enriched });
});

export default router;
