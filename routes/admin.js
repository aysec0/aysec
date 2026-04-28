import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

router.use(requireAdmin);

// ===== Overview =====
router.get('/overview', (_req, res) => {
  const counts = {};
  const tables = [
    'users', 'courses', 'lessons', 'challenges', 'solves', 'submissions',
    'posts', 'cheatsheets', 'events', 'tracks', 'cert_prep',
    'daily_challenges', 'daily_solves', 'ctf_events', 'ctf_event_solves',
    'assessments', 'assessment_attempts', 'pro_labs', 'pro_lab_solves',
    'teams', 'newsletter_subscribers', 'certificates', 'notifications',
    'forum_posts', 'forum_comments', 'vault_solves',
  ];
  for (const t of tables) {
    try { counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c; }
    catch { counts[t] = null; }
  }

  const recent_users = db.prepare(
    `SELECT id, username, display_name, role, created_at
     FROM users ORDER BY created_at DESC LIMIT 5`
  ).all();

  let recent_posts = [];
  try {
    recent_posts = db.prepare(
      `SELECT p.id, p.title, p.created_at, u.username, c.slug AS cat_slug, c.color AS cat_color
       FROM forum_posts p
       JOIN users u ON u.id = p.user_id
       JOIN forum_categories c ON c.id = p.category_id
       ORDER BY p.created_at DESC LIMIT 5`
    ).all();
  } catch {}

  let recent_solves = [];
  try {
    recent_solves = db.prepare(
      `SELECT s.solved_at, u.username, ch.title AS challenge_title, ch.slug AS challenge_slug, ch.points
       FROM solves s
       JOIN users u ON u.id = s.user_id
       JOIN challenges ch ON ch.id = s.challenge_id
       ORDER BY s.solved_at DESC LIMIT 5`
    ).all();
  } catch {}

  let recent_signups_7d = 0, recent_solves_7d = 0, recent_posts_7d = 0;
  try { recent_signups_7d = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now','-7 days')`).get().c; } catch {}
  try { recent_solves_7d  = db.prepare(`SELECT COUNT(*) AS c FROM solves WHERE solved_at >= datetime('now','-7 days')`).get().c; } catch {}
  try { recent_posts_7d   = db.prepare(`SELECT COUNT(*) AS c FROM forum_posts WHERE created_at >= datetime('now','-7 days')`).get().c; } catch {}

  res.json({
    counts,
    recent_users,
    recent_posts,
    recent_solves,
    deltas_7d: { signups: recent_signups_7d, solves: recent_solves_7d, forum_posts: recent_posts_7d },
  });
});

// ===== Daily timeline for the overview sparklines =====
// Returns last N days of {date, signups, solves, forum_posts} including zero days
router.get('/timeline', (req, res) => {
  const days = Math.max(1, Math.min(30, Number(req.query.days) || 7));
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const dayMap = (rows) => Object.fromEntries(rows.map((r) => [r.day, r.c]));
  let signupRows = [], solveRows = [], postRows = [];
  try {
    signupRows = db.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c
       FROM users WHERE created_at >= datetime('now', ?)
       GROUP BY day`
    ).all(`-${days - 1} days`);
  } catch {}
  try {
    solveRows = db.prepare(
      `SELECT substr(solved_at, 1, 10) AS day, COUNT(*) AS c
       FROM solves WHERE solved_at >= datetime('now', ?)
       GROUP BY day`
    ).all(`-${days - 1} days`);
  } catch {}
  try {
    postRows = db.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c
       FROM forum_posts WHERE created_at >= datetime('now', ?)
       GROUP BY day`
    ).all(`-${days - 1} days`);
  } catch {}
  const signupsByDay = dayMap(signupRows);
  const solvesByDay  = dayMap(solveRows);
  const postsByDay   = dayMap(postRows);
  res.json({
    days: buckets,
    series: {
      signups:     buckets.map((d) => signupsByDay[d] || 0),
      solves:      buckets.map((d) => solvesByDay[d]  || 0),
      forum_posts: buckets.map((d) => postsByDay[d]   || 0),
    },
  });
});

// ===== Bulk delete (used by table bulk-select) =====
// Body: { table: 'challenges'|'posts'|'cheatsheets'|..., ids: number[] }
router.post('/bulk-delete', (req, res) => {
  const ALLOWED = {
    challenges: 'challenges',
    posts: 'posts',
    cheatsheets: 'cheatsheets',
    courses: 'courses',
    cert_prep: 'cert_prep',
    daily_challenges: 'daily_challenges',
    ctf_events: 'ctf_events',
    assessments: 'assessments',
    pro_labs: 'pro_labs',
    events: 'events',
    talks: 'talks',
    testimonials: 'testimonials',
    faqs: 'faqs',
    forum_posts: 'forum_posts',
  };
  const { table, ids } = req.body || {};
  const tbl = ALLOWED[table];
  if (!tbl) return res.status(400).json({ error: 'unsupported table' });
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'no ids' });
  const cleanIds = ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
  if (!cleanIds.length) return res.status(400).json({ error: 'invalid ids' });

  // daily_challenges uses date as PK, not id — special-cased below
  if (tbl === 'daily_challenges') {
    return res.status(400).json({ error: 'use /api/admin/daily/:date instead' });
  }

  const placeholders = cleanIds.map(() => '?').join(',');
  const info = db.prepare(`DELETE FROM ${tbl} WHERE id IN (${placeholders})`).run(...cleanIds);
  res.json({ deleted: info.changes });
});

// ===== Users =====
router.get('/users', (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at,
      (SELECT COUNT(*) FROM solves WHERE user_id = u.id) AS solves
    FROM users u ORDER BY u.created_at DESC LIMIT 200
  `).all();
  res.json({ users: rows });
});

router.patch('/users/:id', (req, res) => {
  const { role } = req.body || {};
  if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be user|admin' });
  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

// ===== Challenges =====
router.get('/challenges', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM solves WHERE challenge_id = c.id) AS solves
    FROM challenges c ORDER BY c.id DESC
  `).all();
  // Don't ship flag_hash to admin UI either — they enter the new flag fresh
  rows.forEach((r) => delete r.flag_hash);
  res.json({ challenges: rows });
});

router.post('/challenges', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title || !b.flag) return res.status(400).json({ error: 'Need slug, title, flag' });
  const info = db.prepare(`
    INSERT INTO challenges (slug, title, category, difficulty, points, description, hints, author, published, flag_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.slug, b.title, b.category || 'misc', b.difficulty || 'easy',
    b.points || 100, b.description || null, b.hints || null,
    b.author || null, b.published ? 1 : 0, sha256(b.flag.trim())
  );
  res.json({ id: info.lastInsertRowid });
});

router.patch('/challenges/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const next = {
    slug:        b.slug        ?? cur.slug,
    title:       b.title       ?? cur.title,
    category:    b.category    ?? cur.category,
    difficulty:  b.difficulty  ?? cur.difficulty,
    points:      b.points      ?? cur.points,
    description: b.description ?? cur.description,
    hints:       b.hints       ?? cur.hints,
    author:      b.author      ?? cur.author,
    published:   b.published == null ? cur.published : (b.published ? 1 : 0),
    flag_hash:   b.flag ? sha256(b.flag.trim()) : cur.flag_hash,
  };
  db.prepare(`
    UPDATE challenges SET slug=?, title=?, category=?, difficulty=?, points=?, description=?, hints=?, author=?, published=?, flag_hash=?, updated_at=datetime('now') WHERE id=?
  `).run(next.slug, next.title, next.category, next.difficulty, next.points, next.description, next.hints, next.author, next.published, next.flag_hash, req.params.id);
  res.json({ ok: true });
});

router.delete('/challenges/:id', (req, res) => {
  db.prepare('DELETE FROM challenges WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Daily Challenge assignment =====
router.get('/daily', (_req, res) => {
  const rows = db.prepare(`
    SELECT dc.date, dc.challenge_id, dc.bonus_points, c.title, c.slug,
      (SELECT COUNT(*) FROM daily_solves WHERE date = dc.date) AS solves
    FROM daily_challenges dc JOIN challenges c ON c.id = dc.challenge_id
    ORDER BY dc.date DESC LIMIT 60
  `).all();
  res.json({ daily: rows });
});

router.put('/daily/:date', (req, res) => {
  const { challenge_id, bonus_points } = req.body || {};
  if (!challenge_id) return res.status(400).json({ error: 'Need challenge_id' });
  db.prepare(`
    INSERT INTO daily_challenges (date, challenge_id, bonus_points) VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET challenge_id = excluded.challenge_id, bonus_points = excluded.bonus_points
  `).run(req.params.date, challenge_id, bonus_points ?? 50);
  res.json({ ok: true });
});

router.delete('/daily/:date', (req, res) => {
  db.prepare('DELETE FROM daily_challenges WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

// ===== CTF Events =====
router.get('/ctf-events', (_req, res) => {
  const rows = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM ctf_event_challenges WHERE event_id = e.id) AS chal_count,
      (SELECT COUNT(*) FROM ctf_event_participants WHERE event_id = e.id) AS participants
    FROM ctf_events e ORDER BY starts_at DESC
  `).all();
  res.json({ events: rows });
});

router.get('/ctf-events/:id/challenges', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.slug, c.title, ec.points AS event_points, ec.position
    FROM ctf_event_challenges ec JOIN challenges c ON c.id = ec.challenge_id
    WHERE ec.event_id = ? ORDER BY ec.position, c.id
  `).all(req.params.id);
  res.json({ challenges: rows });
});

router.post('/ctf-events', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title || !b.starts_at || !b.ends_at) return res.status(400).json({ error: 'Need slug, title, starts_at, ends_at' });
  const info = db.prepare(`
    INSERT INTO ctf_events (slug, title, description, starts_at, ends_at, banner_url, prize)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(b.slug, b.title, b.description || null, b.starts_at, b.ends_at, b.banner_url || null, b.prize || null);
  res.json({ id: info.lastInsertRowid });
});

router.patch('/ctf-events/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM ctf_events WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE ctf_events SET slug=?, title=?, description=?, starts_at=?, ends_at=?, banner_url=?, prize=? WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.title ?? cur.title, b.description ?? cur.description,
    b.starts_at ?? cur.starts_at, b.ends_at ?? cur.ends_at,
    b.banner_url ?? cur.banner_url, b.prize ?? cur.prize, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/ctf-events/:id', (req, res) => {
  db.prepare('DELETE FROM ctf_events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/ctf-events/:id/challenges', (req, res) => {
  const { challenge_id, points, position } = req.body || {};
  if (!challenge_id) return res.status(400).json({ error: 'Need challenge_id' });
  db.prepare(`
    INSERT OR REPLACE INTO ctf_event_challenges (event_id, challenge_id, points, position) VALUES (?, ?, ?, ?)
  `).run(req.params.id, challenge_id, points ?? null, position ?? 0);
  res.json({ ok: true });
});

router.delete('/ctf-events/:id/challenges/:cid', (req, res) => {
  db.prepare('DELETE FROM ctf_event_challenges WHERE event_id = ? AND challenge_id = ?').run(req.params.id, req.params.cid);
  res.json({ ok: true });
});

// ===== Assessments =====
router.get('/assessments', (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM assessment_machines WHERE assessment_id = a.id) AS machine_count
    FROM assessments a ORDER BY id
  `).all();
  res.json({ assessments: rows });
});

router.get('/assessments/:id/machines', (req, res) => {
  const rows = db.prepare(
    'SELECT id, position, name, ip, role, points, hint FROM assessment_machines WHERE assessment_id = ? ORDER BY position, id'
  ).all(req.params.id);
  res.json({ machines: rows });
});

router.post('/assessments', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title) return res.status(400).json({ error: 'Need slug, title' });
  const info = db.prepare(`
    INSERT INTO assessments (slug, title, cert_code, difficulty, time_limit_minutes, passing_points, description, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.slug, b.title, b.cert_code || null, b.difficulty || null, b.time_limit_minutes || 1440, b.passing_points || 70, b.description || null, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

router.patch('/assessments/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE assessments SET slug=?, title=?, cert_code=?, difficulty=?, time_limit_minutes=?, passing_points=?, description=?, published=? WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.title ?? cur.title, b.cert_code ?? cur.cert_code,
    b.difficulty ?? cur.difficulty, b.time_limit_minutes ?? cur.time_limit_minutes,
    b.passing_points ?? cur.passing_points, b.description ?? cur.description,
    b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id
  );
  res.json({ ok: true });
});

router.delete('/assessments/:id', (req, res) => {
  db.prepare('DELETE FROM assessments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/assessments/:id/machines', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.flag) return res.status(400).json({ error: 'Need name + flag' });
  db.prepare(`
    INSERT INTO assessment_machines (assessment_id, position, name, ip, role, points, flag_hash, hint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, b.position || 0, b.name, b.ip || null, b.role || null, b.points || 20, sha256(b.flag.trim()), b.hint || null);
  res.json({ ok: true });
});

router.delete('/assessments/:id/machines/:mid', (req, res) => {
  db.prepare('DELETE FROM assessment_machines WHERE id = ? AND assessment_id = ?').run(req.params.mid, req.params.id);
  res.json({ ok: true });
});

// ===== Pro Labs =====
router.get('/pro-labs', (_req, res) => {
  const rows = db.prepare(`
    SELECT l.*, (SELECT COUNT(*) FROM pro_lab_machines WHERE lab_id = l.id) AS machine_count
    FROM pro_labs l ORDER BY id
  `).all();
  res.json({ labs: rows });
});

router.get('/pro-labs/:id/machines', (req, res) => {
  const rows = db.prepare(
    'SELECT id, position, name, ip, role, user_points, root_points, hint FROM pro_lab_machines WHERE lab_id = ? ORDER BY position, id'
  ).all(req.params.id);
  res.json({ machines: rows });
});

router.post('/pro-labs', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title) return res.status(400).json({ error: 'Need slug, title' });
  const info = db.prepare(`
    INSERT INTO pro_labs (slug, title, difficulty, scenario, description, network_diagram, published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(b.slug, b.title, b.difficulty || null, b.scenario || null, b.description || null, b.network_diagram || null, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

router.patch('/pro-labs/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM pro_labs WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE pro_labs SET slug=?, title=?, difficulty=?, scenario=?, description=?, network_diagram=?, published=? WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.title ?? cur.title, b.difficulty ?? cur.difficulty,
    b.scenario ?? cur.scenario, b.description ?? cur.description,
    b.network_diagram ?? cur.network_diagram,
    b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id
  );
  res.json({ ok: true });
});

router.delete('/pro-labs/:id', (req, res) => {
  db.prepare('DELETE FROM pro_labs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/pro-labs/:id/machines', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Need name' });
  db.prepare(`
    INSERT INTO pro_lab_machines (lab_id, position, name, ip, role, user_flag_hash, root_flag_hash, user_points, root_points, hint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.id, b.position || 0, b.name, b.ip || null, b.role || null,
    b.user_flag ? sha256(b.user_flag.trim()) : null,
    b.root_flag ? sha256(b.root_flag.trim()) : null,
    b.user_points || 10, b.root_points || 20, b.hint || null
  );
  res.json({ ok: true });
});

router.delete('/pro-labs/:id/machines/:mid', (req, res) => {
  db.prepare('DELETE FROM pro_lab_machines WHERE id = ? AND lab_id = ?').run(req.params.mid, req.params.id);
  res.json({ ok: true });
});

// ===== Posts =====
router.get('/posts', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, slug, title, kind, published, created_at FROM posts ORDER BY id DESC'
  ).all();
  res.json({ posts: rows });
});

router.post('/posts', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title) return res.status(400).json({ error: 'Need slug, title' });
  const info = db.prepare(`
    INSERT INTO posts (slug, title, kind, excerpt, content_md, tags, published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(b.slug, b.title, b.kind || 'note', b.excerpt || null, b.content_md || '', b.tags || null, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

router.get('/posts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ post: row });
});

router.patch('/posts/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE posts SET slug=?, title=?, kind=?, excerpt=?, content_md=?, tags=?, published=?, updated_at=datetime('now') WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.title ?? cur.title, b.kind ?? cur.kind,
    b.excerpt ?? cur.excerpt, b.content_md ?? cur.content_md,
    b.tags ?? cur.tags,
    b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id
  );
  res.json({ ok: true });
});

router.delete('/posts/:id', (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Courses (basic CRUD; lessons remain hand-edited) =====
router.get('/courses', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) AS lesson_count
    FROM courses c ORDER BY id DESC
  `).all();
  res.json({ courses: rows });
});

router.post('/courses', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title) return res.status(400).json({ error: 'Need slug, title' });
  const info = db.prepare(`
    INSERT INTO courses (slug, title, subtitle, description, difficulty, is_paid, price_cents, currency, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.slug, b.title, b.subtitle || null, b.description || null,
    b.difficulty || 'beginner', b.is_paid ? 1 : 0,
    b.price_cents || 0, b.currency || 'USD', b.published ? 1 : 0
  );
  res.json({ id: info.lastInsertRowid });
});

router.patch('/courses/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE courses SET slug=?, title=?, subtitle=?, description=?, difficulty=?, is_paid=?, price_cents=?, currency=?, published=?, updated_at=datetime('now') WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.title ?? cur.title, b.subtitle ?? cur.subtitle,
    b.description ?? cur.description, b.difficulty ?? cur.difficulty,
    b.is_paid == null ? cur.is_paid : (b.is_paid ? 1 : 0),
    b.price_cents ?? cur.price_cents, b.currency ?? cur.currency,
    b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id
  );
  res.json({ ok: true });
});

router.delete('/courses/:id', (req, res) => {
  db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Lessons (per course) =====
router.get('/courses/:id/lessons', (req, res) => {
  const rows = db.prepare(`
    SELECT id, slug, title, position, is_preview, estimated_minutes, video_url
    FROM lessons WHERE course_id = ? ORDER BY position, id
  `).all(req.params.id);
  res.json({ lessons: rows });
});

router.post('/courses/:id/lessons', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title) return res.status(400).json({ error: 'Need slug + title' });
  const info = db.prepare(`
    INSERT INTO lessons (course_id, slug, title, content_md, video_url, position, is_preview, estimated_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, b.slug, b.title, b.content_md || '', b.video_url || null,
         b.position || 0, b.is_preview ? 1 : 0, b.estimated_minutes || 10);
  res.json({ id: info.lastInsertRowid });
});

router.get('/lessons/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ lesson: row });
});

router.patch('/lessons/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE lessons SET slug=?, title=?, content_md=?, video_url=?, position=?, is_preview=?, estimated_minutes=?, updated_at=datetime('now') WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.title ?? cur.title, b.content_md ?? cur.content_md,
    b.video_url ?? cur.video_url, b.position ?? cur.position,
    b.is_preview == null ? cur.is_preview : (b.is_preview ? 1 : 0),
    b.estimated_minutes ?? cur.estimated_minutes, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/lessons/:id', (req, res) => {
  db.prepare('DELETE FROM lessons WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Tracks (learning paths) =====
router.get('/tracks', (_req, res) => {
  const rows = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM track_courses WHERE track_id = t.id) AS course_count
    FROM tracks t ORDER BY position, id
  `).all();
  res.json({ tracks: rows });
});

router.post('/tracks', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title) return res.status(400).json({ error: 'Need slug + title' });
  const info = db.prepare(`
    INSERT INTO tracks (slug, title, subtitle, description, bundle_price_cents, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(b.slug, b.title, b.subtitle || null, b.description || null,
         b.bundle_price_cents || 0, b.position || 0, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

router.patch('/tracks/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE tracks SET slug=?, title=?, subtitle=?, description=?, bundle_price_cents=?, position=?, published=? WHERE id=?
  `).run(b.slug ?? cur.slug, b.title ?? cur.title, b.subtitle ?? cur.subtitle,
         b.description ?? cur.description, b.bundle_price_cents ?? cur.bundle_price_cents,
         b.position ?? cur.position,
         b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id);
  res.json({ ok: true });
});

router.delete('/tracks/:id', (req, res) => {
  db.prepare('DELETE FROM tracks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/tracks/:id/courses', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.slug, c.title, tc.position
    FROM track_courses tc JOIN courses c ON c.id = tc.course_id
    WHERE tc.track_id = ? ORDER BY tc.position, c.id
  `).all(req.params.id);
  res.json({ courses: rows });
});

router.post('/tracks/:id/courses', (req, res) => {
  const { course_id, position } = req.body || {};
  if (!course_id) return res.status(400).json({ error: 'Need course_id' });
  db.prepare(`
    INSERT OR REPLACE INTO track_courses (track_id, course_id, position) VALUES (?, ?, ?)
  `).run(req.params.id, course_id, position ?? 0);
  res.json({ ok: true });
});

router.delete('/tracks/:id/courses/:cid', (req, res) => {
  db.prepare('DELETE FROM track_courses WHERE track_id = ? AND course_id = ?').run(req.params.id, req.params.cid);
  res.json({ ok: true });
});

// ===== Cert prep paths =====
router.get('/cert-prep', (_req, res) => {
  const rows = db.prepare(`
    SELECT cp.*,
      (SELECT COUNT(*) FROM cert_prep_courses    WHERE cert_id = cp.id) AS course_count,
      (SELECT COUNT(*) FROM cert_prep_challenges WHERE cert_id = cp.id) AS chal_count
    FROM cert_prep cp ORDER BY position, id
  `).all();
  res.json({ certs: rows });
});

router.post('/cert-prep', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.cert_name) return res.status(400).json({ error: 'Need slug + cert_name' });
  const info = db.prepare(`
    INSERT INTO cert_prep (slug, cert_name, cert_full_name, cert_issuer, exam_cost_cents, exam_currency, exam_url, difficulty, duration_estimate, tagline, description, what_covered, what_not_covered, exam_tips, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.slug, b.cert_name, b.cert_full_name || null, b.cert_issuer || 'Unknown',
         b.exam_cost_cents || null, b.exam_currency || 'USD', b.exam_url || null,
         b.difficulty || null, b.duration_estimate || null, b.tagline || null,
         b.description || null, b.what_covered || null, b.what_not_covered || null,
         b.exam_tips || null, b.position || 0, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

router.patch('/cert-prep/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM cert_prep WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE cert_prep SET slug=?, cert_name=?, cert_full_name=?, cert_issuer=?, exam_cost_cents=?, exam_currency=?, exam_url=?, difficulty=?, duration_estimate=?, tagline=?, description=?, what_covered=?, what_not_covered=?, exam_tips=?, position=?, published=? WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.cert_name ?? cur.cert_name, b.cert_full_name ?? cur.cert_full_name,
    b.cert_issuer ?? cur.cert_issuer, b.exam_cost_cents ?? cur.exam_cost_cents,
    b.exam_currency ?? cur.exam_currency, b.exam_url ?? cur.exam_url,
    b.difficulty ?? cur.difficulty, b.duration_estimate ?? cur.duration_estimate,
    b.tagline ?? cur.tagline, b.description ?? cur.description,
    b.what_covered ?? cur.what_covered, b.what_not_covered ?? cur.what_not_covered,
    b.exam_tips ?? cur.exam_tips, b.position ?? cur.position,
    b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id
  );
  res.json({ ok: true });
});

router.delete('/cert-prep/:id', (req, res) => {
  db.prepare('DELETE FROM cert_prep WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Cheatsheets =====
router.get('/cheatsheets', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, slug, title, subtitle, category, position, published, created_at FROM cheatsheets ORDER BY category, position, id'
  ).all();
  res.json({ cheatsheets: rows });
});

router.get('/cheatsheets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM cheatsheets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ cheatsheet: row });
});

router.post('/cheatsheets', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.title) return res.status(400).json({ error: 'Need slug + title' });
  const info = db.prepare(`
    INSERT INTO cheatsheets (slug, title, subtitle, category, tool_url, content_md, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.slug, b.title, b.subtitle || null, b.category || null,
         b.tool_url || null, b.content_md || '', b.position || 0, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

router.patch('/cheatsheets/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM cheatsheets WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE cheatsheets SET slug=?, title=?, subtitle=?, category=?, tool_url=?, content_md=?, position=?, published=?, updated_at=datetime('now') WHERE id=?
  `).run(b.slug ?? cur.slug, b.title ?? cur.title, b.subtitle ?? cur.subtitle,
         b.category ?? cur.category, b.tool_url ?? cur.tool_url,
         b.content_md ?? cur.content_md, b.position ?? cur.position,
         b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id);
  res.json({ ok: true });
});

router.delete('/cheatsheets/:id', (req, res) => {
  db.prepare('DELETE FROM cheatsheets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Events (calendar) — distinct from CTF events above =====
router.get('/calendar-events', (_req, res) => {
  const rows = db.prepare(
    'SELECT * FROM events ORDER BY start_date DESC, id DESC'
  ).all();
  res.json({ events: rows });
});

router.post('/calendar-events', (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.name || !b.kind || !b.start_date) return res.status(400).json({ error: 'Need slug + name + kind + start_date' });
  const info = db.prepare(`
    INSERT INTO events (slug, name, kind, format, start_date, end_date, registration_deadline, url, location, region, prize_pool, difficulty, description, organizer, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.slug, b.name, b.kind, b.format || null, b.start_date, b.end_date || null,
    b.registration_deadline || null, b.url || null, b.location || null,
    b.region || null, b.prize_pool || null, b.difficulty || null,
    b.description || null, b.organizer || null, b.position || 0, b.published ? 1 : 0
  );
  res.json({ id: info.lastInsertRowid });
});

router.patch('/calendar-events/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE events SET slug=?, name=?, kind=?, format=?, start_date=?, end_date=?, registration_deadline=?, url=?, location=?, region=?, prize_pool=?, difficulty=?, description=?, organizer=?, position=?, published=? WHERE id=?
  `).run(
    b.slug ?? cur.slug, b.name ?? cur.name, b.kind ?? cur.kind, b.format ?? cur.format,
    b.start_date ?? cur.start_date, b.end_date ?? cur.end_date,
    b.registration_deadline ?? cur.registration_deadline, b.url ?? cur.url,
    b.location ?? cur.location, b.region ?? cur.region, b.prize_pool ?? cur.prize_pool,
    b.difficulty ?? cur.difficulty, b.description ?? cur.description,
    b.organizer ?? cur.organizer, b.position ?? cur.position,
    b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id
  );
  res.json({ ok: true });
});

router.delete('/calendar-events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Newsletter subscribers (read-only + CSV export + remove) =====
router.get('/newsletter', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, email, source, confirmed, subscribed_at, unsubscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC'
  ).all();
  res.json({ subscribers: rows });
});

router.get('/newsletter.csv', (_req, res) => {
  const rows = db.prepare(
    'SELECT email, source, confirmed, subscribed_at, unsubscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC'
  ).all();
  const lines = ['email,source,confirmed,subscribed_at,unsubscribed_at'];
  for (const r of rows) {
    lines.push([r.email, r.source || '', r.confirmed, r.subscribed_at || '', r.unsubscribed_at || '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  res.type('text/csv').attachment('aysec-newsletter.csv').send(lines.join('\n'));
});

router.delete('/newsletter/:id', (req, res) => {
  db.prepare(
    'UPDATE newsletter_subscribers SET unsubscribed_at = datetime(\'now\') WHERE id = ?'
  ).run(req.params.id);
  res.json({ ok: true });
});

// ===== Talks =====
router.get('/talks', (_req, res) => {
  const rows = db.prepare('SELECT * FROM talks ORDER BY position, date DESC').all();
  res.json({ talks: rows });
});
router.post('/talks', (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.venue || !b.date) return res.status(400).json({ error: 'Need title + venue + date' });
  const info = db.prepare(`
    INSERT INTO talks (title, venue, date, url, description, kind, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.title, b.venue, b.date, b.url || null, b.description || null,
         b.kind || 'talk', b.position || 0, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});
router.patch('/talks/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM talks WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE talks SET title=?, venue=?, date=?, url=?, description=?, kind=?, position=?, published=? WHERE id=?
  `).run(b.title ?? cur.title, b.venue ?? cur.venue, b.date ?? cur.date,
         b.url ?? cur.url, b.description ?? cur.description, b.kind ?? cur.kind,
         b.position ?? cur.position,
         b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id);
  res.json({ ok: true });
});
router.delete('/talks/:id', (req, res) => {
  db.prepare('DELETE FROM talks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Testimonials =====
router.get('/testimonials', (_req, res) => {
  const rows = db.prepare(`
    SELECT t.*, c.title AS course_title FROM testimonials t
    LEFT JOIN courses c ON c.id = t.course_id ORDER BY t.position, t.id
  `).all();
  res.json({ testimonials: rows });
});
router.post('/testimonials', (req, res) => {
  const b = req.body || {};
  if (!b.author_name || !b.quote) return res.status(400).json({ error: 'Need author_name + quote' });
  const info = db.prepare(`
    INSERT INTO testimonials (course_id, author_name, author_title, author_company, quote, rating, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.course_id || null, b.author_name, b.author_title || null,
         b.author_company || null, b.quote, b.rating || null,
         b.position || 0, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});
router.patch('/testimonials/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE testimonials SET course_id=?, author_name=?, author_title=?, author_company=?, quote=?, rating=?, position=?, published=? WHERE id=?
  `).run(b.course_id ?? cur.course_id, b.author_name ?? cur.author_name,
         b.author_title ?? cur.author_title, b.author_company ?? cur.author_company,
         b.quote ?? cur.quote, b.rating ?? cur.rating, b.position ?? cur.position,
         b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id);
  res.json({ ok: true });
});
router.delete('/testimonials/:id', (req, res) => {
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== FAQs =====
router.get('/faqs', (_req, res) => {
  const rows = db.prepare(`
    SELECT f.*, c.title AS course_title FROM faqs f
    LEFT JOIN courses c ON c.id = f.course_id ORDER BY f.scope, f.position, f.id
  `).all();
  res.json({ faqs: rows });
});
router.post('/faqs', (req, res) => {
  const b = req.body || {};
  if (!b.question || !b.answer) return res.status(400).json({ error: 'Need question + answer' });
  const info = db.prepare(`
    INSERT INTO faqs (scope, course_id, question, answer, position, published)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(b.scope || 'general', b.course_id || null, b.question, b.answer,
         b.position || 0, b.published ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});
router.patch('/faqs/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE faqs SET scope=?, course_id=?, question=?, answer=?, position=?, published=? WHERE id=?
  `).run(b.scope ?? cur.scope, b.course_id ?? cur.course_id,
         b.question ?? cur.question, b.answer ?? cur.answer,
         b.position ?? cur.position,
         b.published == null ? cur.published : (b.published ? 1 : 0), req.params.id);
  res.json({ ok: true });
});
router.delete('/faqs/:id', (req, res) => {
  db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Site settings (key/value) =====
const SITE_DEFAULTS = {
  hero_eyebrow:  'Now teaching: red-team operations',
  hero_title:    'Hack to learn.',
  hero_subtitle: "Don't learn to hack.",
  hero_tagline:  'Hands-on cybersecurity training by Ammar Yasser — courses, CTF challenges, and writeups built from real engagements, not slideware.',
  cta_primary_label: 'Browse courses',
  cta_primary_href:  '/courses',
  cta_secondary_label: '$ ./play_ctf',
  cta_secondary_href:  '/challenges',
  footer_tagline: 'Personal site, CTF platform, and training for people who want to actually understand security — not just collect badges.',
  about_short:   "I'm Ammar — a red-team operator and instructor.",
  social_github:   'https://github.com/aysec0',
  social_twitter:  '',
  social_discord:  '',
  compete_eyebrow:  '// compete',
  compete_title:    'Daily reps, live events, full networks.',
  compete_subtitle: 'A challenge a day, scheduled CTFs, and multi-machine Pro Labs that simulate real enterprise networks.',
  compete_cta_label: 'Today’s challenge →',
  compete_cta_href:  '/daily',
  about_eyebrow: '// whoami',
  about_title:   'Security engineer, educator, perpetual student.',
  about_p1:      'I build training that respects your time. No 30-minute intros, no recycled slide decks, no "look at this scary screenshot" content. Just labs, code, and the actual mental models you need to do the job.',
  about_p2:      'Everything here — courses, challenges, writeups — is open to feedback. If something’s wrong, broken, or could be better, tell me.',
  show_compete:  '1',
  show_about:    '1',
  about_page_title:    'About me.',
  about_page_subtitle: 'Ammar Yasser. Security engineer, educator, AI red-teamer.',
  about_short_eyebrow: '// the short version',
  about_short_title:   'I help people break things — properly.',
  hire_page_title:     'Hire me.',
  hire_page_subtitle:  'Pentests, AI/LLM red-team engagements, training for engineering teams, and one-off advisory work. Direct, small-team, no junior bait-and-switch.',
};

router.get('/site-settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // Merge defaults for keys that don't exist yet
  const settings = { ...SITE_DEFAULTS, ...stored };
  res.json({ settings, defaults: SITE_DEFAULTS });
});

router.put('/site-settings', (req, res) => {
  const b = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) stmt.run(k, String(v ?? ''));
  });
  tx(Object.entries(b));
  res.json({ ok: true });
});

export default router;
