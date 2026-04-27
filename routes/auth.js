import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';
import { levelFor, computeXP } from './levels.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!USERNAME_RE.test(username || '')) return res.status(400).json({ error: 'Invalid username' });
  if (!EMAIL_RE.test(email || ''))       return res.status(400).json({ error: 'Invalid email' });
  if (!password || password.length < 8)  return res.status(400).json({ error: 'Password must be >= 8 chars' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (exists) return res.status(409).json({ error: 'Username or email already taken' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (username, email, password_hash, display_name)
    VALUES (?, ?, ?, ?)
  `).run(username, email, hash, username);

  const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user });
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: 'Missing credentials' });

  const user = db.prepare(
    'SELECT id, username, email, password_hash, role FROM users WHERE email = ? OR username = ?'
  ).get(identifier, identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  setAuthCookie(res, signToken(user));
  const { password_hash, ...safe } = user;
  res.json({ user: safe });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Update profile (display_name, bio, avatar_url — emoji or HTTPS URL)
router.patch('/me', requireAuth, (req, res) => {
  const { display_name, bio, avatar_url } = req.body || {};
  if (display_name != null && typeof display_name !== 'string') return res.status(400).json({ error: 'Invalid display_name' });
  if (bio != null          && typeof bio !== 'string')          return res.status(400).json({ error: 'Invalid bio' });
  if (avatar_url != null   && typeof avatar_url !== 'string')   return res.status(400).json({ error: 'Invalid avatar_url' });
  if ((display_name?.length || 0) > 64) return res.status(400).json({ error: 'display_name too long' });
  if ((bio?.length || 0) > 500)         return res.status(400).json({ error: 'bio too long' });
  if (avatar_url != null) {
    const v = avatar_url.trim();
    // Allowed: empty (clears), short emoji (≤8 chars), or HTTPS URL ≤200 chars
    if (v.length > 0) {
      if (v.startsWith('https://')) {
        if (v.length > 200) return res.status(400).json({ error: 'avatar_url too long' });
      } else if (v.length > 8) {
        return res.status(400).json({ error: 'avatar must be empty, an emoji, or an https:// URL' });
      }
    }
  }
  const updates = [];
  const args = [];
  if (display_name != null) { updates.push('display_name = ?'); args.push(display_name.trim() || req.user.username); }
  if (bio != null)          { updates.push('bio = ?');          args.push(bio.trim()); }
  if (avatar_url != null)   { updates.push('avatar_url = ?');   args.push(avatar_url.trim() || null); }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updated_at = datetime(\'now\')');
  args.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...args);
  const fresh = db.prepare(
    'SELECT id, username, email, display_name, avatar_url, bio, role FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ user: fresh });
});

// Change password
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be 8+ chars' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(current_password, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(hash, req.user.id);
  res.json({ ok: true });
});

router.get('/dashboard', requireAuth, (req, res) => {
  const enrolled = db.prepare(`
    SELECT c.id, c.slug, c.title, c.subtitle, c.difficulty,
           ca.source, ca.granted_at,
           (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
           (SELECT COUNT(*) FROM lesson_progress lp
              JOIN lessons l2 ON l2.id = lp.lesson_id
              WHERE l2.course_id = c.id AND lp.user_id = ?) AS lessons_done
    FROM course_access ca
    JOIN courses c ON c.id = ca.course_id
    WHERE ca.user_id = ?
    ORDER BY ca.granted_at DESC
  `).all(req.user.id, req.user.id);

  const solved = db.prepare(`
    SELECT ch.id, ch.slug, ch.title, ch.category, ch.difficulty, ch.points, s.solved_at
    FROM solves s
    JOIN challenges ch ON ch.id = s.challenge_id
    WHERE s.user_id = ?
    ORDER BY s.solved_at DESC
    LIMIT 20
  `).all(req.user.id);

  const score = db.prepare(`
    SELECT COALESCE(SUM(c.points), 0) AS score, COUNT(*) AS solves
    FROM solves s JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ?
  `).get(req.user.id);

  // Rank: count of users with strictly higher total score, +1.
  const rankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM (
      SELECT s.user_id, SUM(c.points) AS total
      FROM solves s JOIN challenges c ON c.id = s.challenge_id
      GROUP BY s.user_id
      HAVING total > ?
    )
  `).get(score.score);

  // Score broken down by challenge category.
  const byCategory = db.prepare(`
    SELECT c.category, SUM(c.points) AS score, COUNT(*) AS solves
    FROM solves s JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ?
    GROUP BY c.category
    ORDER BY score DESC
  `).all(req.user.id);

  // Activity over the last 84 days (combined solves + lesson completions).
  const activityRows = db.prepare(`
    SELECT day, SUM(n) AS n FROM (
      SELECT DATE(solved_at)    AS day, COUNT(*) AS n
      FROM solves WHERE user_id = ? AND solved_at >= datetime('now', '-84 days')
      GROUP BY day
      UNION ALL
      SELECT DATE(completed_at) AS day, COUNT(*) AS n
      FROM lesson_progress WHERE user_id = ? AND completed_at >= datetime('now', '-84 days')
      GROUP BY day
    )
    GROUP BY day
  `).all(req.user.id, req.user.id);
  const activityByDay = Object.fromEntries(activityRows.map((r) => [r.day, r.n]));

  // Build dense 84-day series ending today.
  const today = new Date();
  const heatmap = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    heatmap.push({ date: iso, count: activityByDay[iso] || 0 });
  }

  // Streak: consecutive trailing days with activity (counting today only if active).
  let streak = 0;
  for (let i = heatmap.length - 1; i >= 0; i--) {
    if (heatmap[i].count > 0) streak++;
    else break;
  }

  // Certificates earned by this user
  const certificates = db.prepare(`
    SELECT c.code, c.issued_at, co.slug AS course_slug, co.title AS course_title
    FROM certificates c JOIN courses co ON co.id = c.course_id
    WHERE c.user_id = ? ORDER BY c.issued_at DESC
  `).all(req.user.id);

  // First-blood count
  const firstBloods = db.prepare(`
    SELECT COUNT(*) AS c FROM solves s WHERE s.user_id = ? AND s.solved_at = (
      SELECT MIN(s2.solved_at) FROM solves s2 WHERE s2.challenge_id = s.challenge_id
    )
  `).get(req.user.id).c;

  // AI challenge progress
  const aiSolves = db.prepare(`
    SELECT COUNT(*) AS c FROM solves s
    JOIN challenges c ON c.id = s.challenge_id
    WHERE s.user_id = ? AND c.category = 'ai'
  `).get(req.user.id).c;
  const aiTotal = db.prepare(`SELECT COUNT(*) AS c FROM challenges WHERE category = 'ai' AND published = 1`).get().c;

  // Achievements (computed each request — cheap, no extra storage)
  const ACHIEVEMENT_DEFS = [
    { id: 'first_solve',    when: () => score.solves >= 1,                        label: 'First Solve',         desc: 'Plant your first flag',                  icon: 'flag' },
    { id: 'solver_5',       when: () => score.solves >= 5,                        label: 'Solver',              desc: '5 challenge solves',                     icon: 'target' },
    { id: 'solver_10',      when: () => score.solves >= 10,                       label: 'Veteran Solver',      desc: '10 challenge solves',                    icon: 'medal' },
    { id: 'first_blood',    when: () => firstBloods >= 1,                         label: 'First Blood',         desc: `${firstBloods} first-blood${firstBloods === 1 ? '' : 's'}`, icon: 'crown' },
    { id: 'streak_3',       when: () => streak >= 3,                              label: 'On a Roll',           desc: '3-day streak',                            icon: 'flame' },
    { id: 'streak_7',       when: () => streak >= 7,                              label: 'Weekly Warrior',      desc: '7-day streak',                            icon: 'flame' },
    { id: 'streak_30',      when: () => streak >= 30,                             label: 'Untouchable',         desc: '30-day streak',                           icon: 'flame' },
    { id: 'course_done',    when: () => certificates.length >= 1,                 label: 'Course Completed',    desc: `${certificates.length} course${certificates.length === 1 ? '' : 's'} finished`, icon: 'cert' },
    { id: 'enrolled',       when: () => enrolled.length >= 1,                     label: 'Enrolled',            desc: 'Joined your first course',               icon: 'book' },
    { id: 'ai_master',      when: () => aiTotal > 0 && aiSolves === aiTotal,      label: 'AI Security Master',  desc: 'All AI challenges solved',                icon: 'cpu' },
  ];
  const achievements = ACHIEVEMENT_DEFS.filter((a) => a.when()).map(({ when, ...rest }) => rest);

  // ---- Levels (multi-source XP) ----
  const lessonsDoneTotal = db.prepare('SELECT COUNT(*) AS c FROM lesson_progress WHERE user_id = ?').get(req.user.id).c;
  const xpBreakdown = computeXP({
    ctf_points:   score.score,
    lessons_done: lessonsDoneTotal,
    certificates: certificates.length,
    first_bloods: firstBloods,
  });
  const level = levelFor(xpBreakdown.total);

  // ---- Auto-emit notifications for newly-crossed thresholds ----
  // Compare against the level the user was last at (stored in payload of any prior level_up notif).
  // Cheap version: emit if no level_up notification matches the current level yet.
  if (level.level_idx >= 1) {
    const exists = db.prepare(`
      SELECT 1 FROM notifications
      WHERE user_id = ? AND kind = 'level_up' AND link = ?
    `).get(req.user.id, `/levels#lvl-${level.level_idx}`);
    if (!exists) {
      db.prepare(`
        INSERT INTO notifications (user_id, kind, title, body, link, icon)
        VALUES (?, 'level_up', ?, ?, ?, ?)
      `).run(
        req.user.id,
        `Level up — Lv ${level.level_idx + 1} ${level.current.name}`,
        level.current.tagline || '',
        `/levels#lvl-${level.level_idx}`,
        level.current.icon || 'medal'
      );
    }
  }
  // Achievements: one notification per achievement first time it unlocks.
  for (const a of achievements) {
    const exists = db.prepare(`
      SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'achievement' AND link = ?
    `).get(req.user.id, `/dashboard#ach-${a.id}`);
    if (!exists) {
      db.prepare(`
        INSERT INTO notifications (user_id, kind, title, body, link, icon)
        VALUES (?, 'achievement', ?, ?, ?, ?)
      `).run(req.user.id, `Achievement: ${a.label}`, a.desc, `/dashboard#ach-${a.id}`, a.icon || 'medal');
    }
  }
  // First-blood + cert one-shots: emit on first detection
  if (firstBloods >= 1) {
    const ex = db.prepare(`SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'first_blood'`).get(req.user.id);
    if (!ex) {
      db.prepare(`
        INSERT INTO notifications (user_id, kind, title, body, link, icon)
        VALUES (?, 'first_blood', ?, ?, ?, ?)
      `).run(req.user.id, '🩸 First blood!', 'You were the first to solve a challenge.', '/challenges', 'crown');
    }
  }
  for (const c of certificates) {
    const ex = db.prepare(`
      SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'cert' AND link = ?
    `).get(req.user.id, `/cert/${c.code}`);
    if (!ex) {
      db.prepare(`
        INSERT INTO notifications (user_id, kind, title, body, link, icon)
        VALUES (?, 'cert', ?, ?, ?, ?)
      `).run(req.user.id, `Certificate earned: ${c.course_title}`, 'Click to view your shareable cert.', `/cert/${c.code}`, 'cert');
    }
  }

  // ---- Weekly summary (last 7 days) ----
  const weeklyScore = db.prepare(`
    SELECT COALESCE(SUM(c.points), 0) AS s, COUNT(*) AS n
    FROM solves s2 JOIN challenges c ON c.id = s2.challenge_id
    WHERE s2.user_id = ? AND s2.solved_at >= datetime('now', '-7 days')
  `).get(req.user.id);
  const weeklyLessons = db.prepare(`
    SELECT COUNT(*) AS n FROM lesson_progress
    WHERE user_id = ? AND completed_at >= datetime('now', '-7 days')
  `).get(req.user.id).n;
  const weekly = { score: weeklyScore.s, solves: weeklyScore.n, lessons: weeklyLessons };

  // ---- Activity feed (combined recent events) ----
  const activitySolves = db.prepare(`
    SELECT 'solve' AS kind, s2.solved_at AS when_at,
           ch.title AS title, ch.slug AS slug, ch.category AS sub, ch.points AS amount,
           (s2.solved_at = (SELECT MIN(s3.solved_at) FROM solves s3 WHERE s3.challenge_id = s2.challenge_id)) AS first_blood
    FROM solves s2 JOIN challenges ch ON ch.id = s2.challenge_id
    WHERE s2.user_id = ?
    ORDER BY s2.solved_at DESC LIMIT 30
  `).all(req.user.id);
  const activityLessons = db.prepare(`
    SELECT 'lesson' AS kind, lp.completed_at AS when_at,
           l.title AS title, co.slug AS slug, co.title AS sub, l.estimated_minutes AS amount,
           l.slug AS lesson_slug
    FROM lesson_progress lp
    JOIN lessons l ON l.id = lp.lesson_id
    JOIN courses co ON co.id = l.course_id
    WHERE lp.user_id = ?
    ORDER BY lp.completed_at DESC LIMIT 30
  `).all(req.user.id);
  const activityCerts = db.prepare(`
    SELECT 'cert' AS kind, c.issued_at AS when_at,
           co.title AS title, c.code AS slug, co.slug AS sub, NULL AS amount
    FROM certificates c JOIN courses co ON co.id = c.course_id
    WHERE c.user_id = ?
    ORDER BY c.issued_at DESC LIMIT 10
  `).all(req.user.id);
  const activity = [...activitySolves, ...activityLessons, ...activityCerts]
    .sort((a, b) => (b.when_at || '').localeCompare(a.when_at || ''))
    .slice(0, 30);

  // ---- Recommended next challenge ----
  // Strategy: pick the user's strongest-engagement category, then an unsolved challenge in it
  // (preferring the next difficulty up from what they've already solved).
  let recommendedChallenge = null;
  if (byCategory.length) {
    const topCat = byCategory[0].category;
    const next = db.prepare(`
      SELECT slug, title, category, difficulty, points
      FROM challenges
      WHERE published = 1 AND category = ?
        AND id NOT IN (SELECT challenge_id FROM solves WHERE user_id = ?)
      ORDER BY
        CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 4 END ASC,
        points ASC
      LIMIT 1
    `).get(topCat, req.user.id);
    if (next) recommendedChallenge = next;
  }
  if (!recommendedChallenge) {
    // Cold start: pick easiest unsolved challenge
    recommendedChallenge = db.prepare(`
      SELECT slug, title, category, difficulty, points FROM challenges
      WHERE published = 1 AND id NOT IN (SELECT challenge_id FROM solves WHERE user_id = ?)
      ORDER BY points ASC LIMIT 1
    `).get(req.user.id) || null;
  }

  // ---- Continue learning: next incomplete lesson in the most-recent enrolled course ----
  let continueLesson = null;
  if (enrolled.length) {
    for (const c of enrolled) {
      const lesson = db.prepare(`
        SELECT l.slug AS lesson_slug, l.title AS lesson_title, l.position
        FROM lessons l
        WHERE l.course_id = ?
          AND l.id NOT IN (SELECT lesson_id FROM lesson_progress WHERE user_id = ?)
        ORDER BY l.position ASC LIMIT 1
      `).get(c.id, req.user.id);
      if (lesson) {
        continueLesson = {
          course_slug: c.slug, course_title: c.title,
          lesson_slug: lesson.lesson_slug, lesson_title: lesson.lesson_title,
          lessons_done: c.lessons_done, lesson_count: c.lesson_count,
        };
        break;
      }
    }
  }

  // ---- Recommended course (cold start when no progress) ----
  let recommendedCourse = null;
  if (!enrolled.length) {
    recommendedCourse = db.prepare(`
      SELECT slug, title, subtitle, difficulty, is_paid
      FROM courses
      WHERE published = 1 AND is_paid = 0
      ORDER BY created_at ASC LIMIT 1
    `).get() || null;
  }

  res.json({
    user: req.user,
    enrolled,
    solved,
    stats: { score: score.score, solves: score.solves, rank: rankRow.rank, streak, firstBloods },
    level: { ...level, xp_breakdown: xpBreakdown },
    weekly,
    activity,
    recommended: { challenge: recommendedChallenge, course: recommendedCourse, continue_lesson: continueLesson },
    categories: byCategory,
    heatmap,
    certificates,
    achievements,
  });
});

export default router;
