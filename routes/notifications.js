import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/** Server-side helper: emit a notification. Idempotent on (user_id, kind, link). */
export function emit({ userId, kind, title, body, link, icon, payload }) {
  if (!userId || !kind || !title) return null;
  // Avoid duplicate spam: same (kind, link) within 1h is treated as already-emitted
  const dup = db.prepare(`
    SELECT id FROM notifications WHERE user_id = ? AND kind = ? AND COALESCE(link, '') = ? AND created_at > datetime('now', '-1 hour')
  `).get(userId, kind, link || '');
  if (dup) return dup;
  const info = db.prepare(`
    INSERT INTO notifications (user_id, kind, title, body, link, icon, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, kind, title, body || null, link || null, icon || null, payload ? JSON.stringify(payload) : null);
  return { id: info.lastInsertRowid };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, kind, title, body, link, icon, read_at, created_at
    FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  const unread = db.prepare(`
    SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL
  `).get(req.user.id).c;
  res.json({ notifications: rows, unread });
});

router.post('/read', requireAuth, (req, res) => {
  const { id } = req.body || {};
  if (id) {
    db.prepare('UPDATE notifications SET read_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
      .run(id, req.user.id);
  } else {
    db.prepare('UPDATE notifications SET read_at = datetime(\'now\') WHERE user_id = ? AND read_at IS NULL')
      .run(req.user.id);
  }
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
