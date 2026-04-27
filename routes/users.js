import { Router } from 'express';
import { db } from '../db/index.js';
import { levelFor, computeXP } from './levels.js';

const router = Router();

router.get('/:username', (req, res) => {
  const user = db.prepare(`
    SELECT id, username, display_name, bio, avatar_url, created_at
    FROM users WHERE username = ?
  `).get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Score / solves / rank
  const scoreRow = db.prepare(`
    SELECT COALESCE(SUM(c.points), 0) AS score, COUNT(*) AS solves
    FROM solves s JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ?
  `).get(user.id);

  const rankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM (
      SELECT s.user_id, SUM(c.points) AS total
      FROM solves s JOIN challenges c ON c.id = s.challenge_id
      GROUP BY s.user_id
      HAVING total > ?
    )
  `).get(scoreRow.score);

  // First-blood count
  const firstBloods = db.prepare(`
    SELECT COUNT(*) AS c FROM solves s
    WHERE s.user_id = ? AND s.solved_at = (
      SELECT MIN(s2.solved_at) FROM solves s2 WHERE s2.challenge_id = s.challenge_id
    )
  `).get(user.id).c;

  // Category breakdown
  const byCategory = db.prepare(`
    SELECT c.category, SUM(c.points) AS score, COUNT(*) AS solves
    FROM solves s JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ?
    GROUP BY c.category
    ORDER BY score DESC
  `).all(user.id);

  // Recent solves (public)
  const recentSolves = db.prepare(`
    SELECT ch.slug, ch.title, ch.category, ch.difficulty, ch.points, s.solved_at
    FROM solves s JOIN challenges ch ON ch.id = s.challenge_id
    WHERE s.user_id = ?
    ORDER BY s.solved_at DESC
    LIMIT 10
  `).all(user.id);

  // ALL solves with category × difficulty info — feeds the Skill DNA visualization
  const allSolves = db.prepare(`
    SELECT ch.slug, ch.category, ch.difficulty, ch.points, s.solved_at,
           CASE WHEN s.solved_at = (
             SELECT MIN(s2.solved_at) FROM solves s2 WHERE s2.challenge_id = s.challenge_id
           ) THEN 1 ELSE 0 END AS first_blood
    FROM solves s JOIN challenges ch ON ch.id = s.challenge_id
    WHERE s.user_id = ?
    ORDER BY s.solved_at ASC
  `).all(user.id);

  // Public certificates earned
  const certificates = db.prepare(`
    SELECT c.code, c.issued_at, co.slug AS course_slug, co.title AS course_title
    FROM certificates c JOIN courses co ON co.id = c.course_id
    WHERE c.user_id = ?
    ORDER BY c.issued_at DESC
  `).all(user.id);

  // Activity heatmap (84 days, same shape as dashboard)
  const activityRows = db.prepare(`
    SELECT day, SUM(n) AS n FROM (
      SELECT DATE(solved_at) AS day, COUNT(*) AS n
      FROM solves WHERE user_id = ? AND solved_at >= datetime('now', '-84 days')
      GROUP BY day
    )
    GROUP BY day
  `).all(user.id);
  const activityByDay = Object.fromEntries(activityRows.map((r) => [r.day, r.n]));
  const today = new Date();
  const heatmap = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    heatmap.push({ date: iso, count: activityByDay[iso] || 0 });
  }

  // Level computation (multi-source XP, same rules as dashboard)
  const lessonsDoneTotal = db.prepare(
    'SELECT COUNT(*) AS c FROM lesson_progress WHERE user_id = ?'
  ).get(user.id).c;
  const xpBreakdown = computeXP({
    ctf_points:   scoreRow.score,
    lessons_done: lessonsDoneTotal,
    certificates: certificates.length,
    first_bloods: firstBloods,
  });
  const level = levelFor(xpBreakdown.total);

  res.json({
    user: {
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      avatar_url: user.avatar_url,
      member_since: user.created_at,
    },
    user_avatar_url: user.avatar_url, // mirror for convenience
    stats: {
      score: scoreRow.score,
      solves: scoreRow.solves,
      rank: rankRow.rank,
      firstBloods,
      certificates: certificates.length,
    },
    level: { ...level, xp_breakdown: xpBreakdown },
    categories: byCategory,
    recentSolves,
    allSolves,
    certificates,
    heatmap,
  });
});

export default router;
