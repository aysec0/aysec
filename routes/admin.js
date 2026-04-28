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
  ];
  for (const t of tables) {
    try { counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c; }
    catch { counts[t] = null; }
  }
  res.json({ counts });
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

export default router;
