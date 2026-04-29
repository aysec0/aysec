import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Active SSE subscribers, keyed by user id. Each entry is a Set of response
// objects so multiple tabs from the same user all get the same push.
const subscribers = new Map();

function pushToSubscribers(userId, event) {
  const set = subscribers.get(userId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch {}
  }
}

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
  // Fan out to live subscribers for this user
  pushToSubscribers(userId, { id: info.lastInsertRowid, kind, title, body, link, icon });
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

// Server-Sent Events stream — the bell can listen for live pushes instead
// of polling. EventSource sends a Last-Event-Id header on reconnect; we
// don't replay history (the user's already got the panel for that), we
// just resume real-time push.
router.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const set = subscribers.get(req.user.id) ?? new Set();
  set.add(res);
  subscribers.set(req.user.id, set);

  // Heartbeat every 20s so reverse proxies don't kill the idle connection
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    set.delete(res);
    if (set.size === 0) subscribers.delete(req.user.id);
  });
});

export default router;
