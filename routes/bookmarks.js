import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const KIND_QUERY = {
  course:     'SELECT id, slug, title, subtitle FROM courses WHERE id = ? AND published = 1',
  challenge:  'SELECT id, slug, title, category, difficulty, points FROM challenges WHERE id = ? AND published = 1',
  post:       'SELECT id, slug, title, excerpt, kind FROM posts WHERE id = ? AND published = 1',
  cheatsheet: 'SELECT id, slug, title, subtitle, category FROM cheatsheets WHERE id = ? AND published = 1',
  event:      'SELECT id, slug, name AS title, kind, start_date FROM events WHERE id = ? AND published = 1',
};

/** Resolve a bookmark to an item by querying the right table. */
function lookupItem(kind, id) {
  const sql = KIND_QUERY[kind];
  if (!sql) return null;
  return db.prepare(sql).get(id);
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, item_kind, item_id, created_at FROM bookmarks
    WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  const enriched = rows.map((r) => ({
    bookmark_id: r.id,
    kind: r.item_kind,
    bookmarked_at: r.created_at,
    item: lookupItem(r.item_kind, r.item_id),
  })).filter((x) => x.item);
  res.json({ bookmarks: enriched });
});

router.get('/check', requireAuth, (req, res) => {
  const { kind, slug } = req.query;
  if (!kind || !slug || !KIND_QUERY[kind]) return res.json({ bookmarked: false });
  // Resolve slug → id
  const tbl = { course: 'courses', challenge: 'challenges', post: 'posts', cheatsheet: 'cheatsheets', event: 'events' }[kind];
  const row = db.prepare(`SELECT id FROM ${tbl} WHERE slug = ?`).get(slug);
  if (!row) return res.json({ bookmarked: false });
  const exists = db.prepare(
    'SELECT 1 FROM bookmarks WHERE user_id = ? AND item_kind = ? AND item_id = ?'
  ).get(req.user.id, kind, row.id);
  res.json({ bookmarked: !!exists, item_id: row.id });
});

router.post('/', requireAuth, (req, res) => {
  const { kind, slug } = req.body || {};
  if (!kind || !slug || !KIND_QUERY[kind]) return res.status(400).json({ error: 'Invalid bookmark kind' });
  const tbl = { course: 'courses', challenge: 'challenges', post: 'posts', cheatsheet: 'cheatsheets', event: 'events' }[kind];
  const row = db.prepare(`SELECT id FROM ${tbl} WHERE slug = ?`).get(slug);
  if (!row) return res.status(404).json({ error: 'Item not found' });
  try {
    db.prepare('INSERT INTO bookmarks (user_id, item_kind, item_id) VALUES (?, ?, ?)')
      .run(req.user.id, kind, row.id);
    res.json({ bookmarked: true });
  } catch (e) {
    // unique-constraint: already bookmarked
    res.json({ bookmarked: true });
  }
});

router.delete('/', requireAuth, (req, res) => {
  const { kind, slug } = req.body || {};
  if (!kind || !slug) return res.status(400).json({ error: 'Missing kind/slug' });
  const tbl = { course: 'courses', challenge: 'challenges', post: 'posts', cheatsheet: 'cheatsheets', event: 'events' }[kind];
  const row = db.prepare(`SELECT id FROM ${tbl} WHERE slug = ?`).get(slug);
  if (!row) return res.status(404).json({ error: 'Item not found' });
  db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND item_kind = ? AND item_id = ?')
    .run(req.user.id, kind, row.id);
  res.json({ bookmarked: false });
});

export default router;
