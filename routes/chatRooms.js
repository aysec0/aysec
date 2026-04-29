/* ============================================================
   /api/chat/* — Discord-style live chat rooms.

   Endpoints:
     GET    /rooms                           — all rooms + last-msg-at + unread count
     GET    /rooms/:slug                     — single room metadata
     GET    /rooms/:slug/messages            — recent messages (paginated)
     POST   /rooms/:slug/messages            — send a message
     DELETE /messages/:id                    — soft-delete own message
     POST   /messages/:id/reactions          — toggle a reaction (own emoji)
     GET    /stream/:slug                    — Server-Sent Events for the room

   New messages and reactions fan out to all SSE subscribers of
   the room over the same connection — no separate websocket.
   ============================================================ */
import { Router } from 'express';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { emit as emitNotification } from './notifications.js';

const router = Router();

// ---- SSE fan-out ------------------------------------------------------
// Map<roomSlug, Set<{ res, userId }>>. We dedupe per (room, res) so
// reconnects from the same tab don't double-fire.
const subscribers = new Map();
function pushToRoom(slug, event) {
  const set = subscribers.get(slug);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const sub of set) {
    try { sub.res.write(payload); } catch {}
  }
}

// ---- Helpers ---------------------------------------------------------
const MENTION_RE = /(?:^|[^\w@])@([a-zA-Z0-9_]{2,32})\b/g;
function findMentionedUsers(body, authorId) {
  if (!body) return [];
  const set = new Set();
  let m;
  while ((m = MENTION_RE.exec(body)) !== null) set.add(m[1].toLowerCase());
  if (!set.size) return [];
  const placeholders = [...set].map(() => '?').join(',');
  return db.prepare(
    `SELECT id, username FROM users WHERE LOWER(username) IN (${placeholders}) AND id != ?`
  ).all(...[...set], authorId);
}

function loadMessageById(id) {
  const row = db.prepare(`
    SELECT m.id, m.room_id, m.user_id, m.body, m.reply_to, m.attachment_url,
           m.edited_at, m.deleted_at, m.created_at,
           u.username, u.display_name, u.avatar_url,
           r.slug AS room_slug
    FROM chat_messages m
    JOIN users u      ON u.id = m.user_id
    JOIN chat_rooms r ON r.id = m.room_id
    WHERE m.id = ?
  `).get(id);
  if (!row) return null;
  return decorateMessage(row);
}

function decorateMessage(row) {
  // Pull reactions grouped by emoji + the count
  const reactions = db.prepare(`
    SELECT emoji,
           COUNT(*) AS count,
           GROUP_CONCAT(user_id) AS user_ids
    FROM chat_reactions
    WHERE message_id = ?
    GROUP BY emoji
    ORDER BY count DESC, emoji
  `).all(row.id).map((r) => ({
    emoji: r.emoji,
    count: r.count,
    user_ids: r.user_ids.split(',').map(Number),
  }));

  // If this is a reply, fetch the parent's snippet for context (1 level only)
  let reply_context = null;
  if (row.reply_to) {
    const p = db.prepare(`
      SELECT m.id, m.body, m.deleted_at, u.username, u.display_name
      FROM chat_messages m JOIN users u ON u.id = m.user_id
      WHERE m.id = ?
    `).get(row.reply_to);
    if (p) {
      reply_context = {
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        body: p.deleted_at ? '[deleted]' : (p.body || '').slice(0, 140),
      };
    }
  }

  return {
    id: row.id,
    room_id: row.room_id,
    room_slug: row.room_slug,
    body: row.deleted_at ? null : row.body,
    deleted: !!row.deleted_at,
    edited: !!row.edited_at,
    attachment_url: row.attachment_url,
    reply_to: row.reply_to,
    reply_context,
    reactions,
    user: { id: row.user_id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url },
    created_at: row.created_at,
  };
}

// ---- Routes ----------------------------------------------------------

/* GET /api/chat/rooms — list every room with last-message + count */
router.get('/rooms', optionalAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.slug, r.name, r.description, r.icon, r.color, r.position, r.is_locked,
           (SELECT COUNT(*) FROM chat_messages m WHERE m.room_id = r.id AND m.deleted_at IS NULL) AS message_count,
           (SELECT MAX(created_at) FROM chat_messages m WHERE m.room_id = r.id) AS last_message_at
    FROM chat_rooms r
    ORDER BY r.position ASC, r.id ASC
  `).all();
  res.json({ rooms: rows });
});

/* GET /api/chat/rooms/:slug — room metadata */
router.get('/rooms/:slug', optionalAuth, (req, res) => {
  const room = db.prepare('SELECT * FROM chat_rooms WHERE slug = ?').get(req.params.slug);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ room });
});

/* GET /api/chat/rooms/:slug/messages — most-recent N (default 50)
   Paginate older with ?before=<id>. Returns oldest-first so the
   client can append in order. */
router.get('/rooms/:slug/messages', optionalAuth, (req, res) => {
  const room = db.prepare('SELECT id FROM chat_rooms WHERE slug = ?').get(req.params.slug);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const before = parseInt(req.query.before, 10) || null;

  const where = before ? 'WHERE m.room_id = ? AND m.id < ?' : 'WHERE m.room_id = ?';
  const params = before ? [room.id, before] : [room.id];
  const rows = db.prepare(`
    SELECT m.id, m.room_id, m.user_id, m.body, m.reply_to, m.attachment_url,
           m.edited_at, m.deleted_at, m.created_at,
           u.username, u.display_name, u.avatar_url,
           ? AS room_slug
    FROM chat_messages m
    JOIN users u ON u.id = m.user_id
    ${where}
    ORDER BY m.id DESC
    LIMIT ?
  `).all(req.params.slug, ...params, limit);

  // Reverse so oldest-first
  const messages = rows.reverse().map(decorateMessage);
  res.json({ messages, has_more: rows.length === limit });
});

/* POST /api/chat/rooms/:slug/messages — send */
router.post('/rooms/:slug/messages', requireAuth, (req, res) => {
  const room = db.prepare('SELECT id, slug, name, is_locked FROM chat_rooms WHERE slug = ?').get(req.params.slug);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.is_locked) return res.status(403).json({ error: 'This room is read-only.' });

  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Empty message.' });
  if (body.length > 4000) return res.status(400).json({ error: 'Too long (max 4000 chars).' });

  const reply_to = req.body?.reply_to ? Number(req.body.reply_to) : null;
  if (reply_to) {
    // Validate the parent exists and lives in the same room
    const parent = db.prepare('SELECT id, room_id FROM chat_messages WHERE id = ? AND deleted_at IS NULL').get(reply_to);
    if (!parent || parent.room_id !== room.id) {
      return res.status(400).json({ error: 'Reply target invalid.' });
    }
  }

  // Throttle: 10 messages / 30s / user (chat is live but we don't want flood)
  const recent = db.prepare(`
    SELECT COUNT(*) AS c FROM chat_messages
    WHERE user_id = ? AND created_at > datetime('now', '-30 seconds')
  `).get(req.user.id).c;
  if (recent >= 10) return res.status(429).json({ error: 'Slow down — 10 messages / 30s.' });

  const info = db.prepare(`
    INSERT INTO chat_messages (room_id, user_id, body, reply_to)
    VALUES (?, ?, ?, ?)
  `).run(room.id, req.user.id, body, reply_to);

  const msg = loadMessageById(info.lastInsertRowid);

  // Notify @mentioned users (skip self, dedupe by user)
  for (const mu of findMentionedUsers(body, req.user.id)) {
    emitNotification({
      userId: mu.id,
      kind: 'chat:mention',
      title: `@${req.user.username} mentioned you in #${room.name}`,
      body: body.slice(0, 200),
      link: `/community#${room.slug}`,
      icon: '@',
    });
  }
  // Notify the parent message's author if it's a reply (and not yourself)
  if (reply_to && msg.reply_context && msg.reply_context.username !== req.user.username) {
    const parentUser = db.prepare('SELECT user_id FROM chat_messages WHERE id = ?').get(reply_to);
    if (parentUser && parentUser.user_id !== req.user.id) {
      emitNotification({
        userId: parentUser.user_id,
        kind: 'chat:reply',
        title: `@${req.user.username} replied in #${room.name}`,
        body: body.slice(0, 200),
        link: `/community#${room.slug}`,
        icon: '↩',
      });
    }
  }

  // Live fan-out to SSE subscribers of this room
  pushToRoom(room.slug, { type: 'message', message: msg });

  res.json({ message: msg });
});

/* DELETE /api/chat/messages/:id — soft-delete OWN message (or admin) */
router.delete('/messages/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT id, user_id, room_id FROM chat_messages WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (m.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not yours.' });
  }
  db.prepare(`UPDATE chat_messages SET deleted_at = datetime('now') WHERE id = ?`).run(id);
  const room = db.prepare('SELECT slug FROM chat_rooms WHERE id = ?').get(m.room_id);
  pushToRoom(room.slug, { type: 'delete', id });
  res.json({ ok: true });
});

/* POST /api/chat/messages/:id/reactions — toggle reaction */
router.post('/messages/:id/reactions', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const emoji = String(req.body?.emoji || '').trim();
  if (!emoji || emoji.length > 16) return res.status(400).json({ error: 'Bad emoji.' });

  const m = db.prepare('SELECT id, room_id FROM chat_messages WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!m) return res.status(404).json({ error: 'Not found' });

  const existing = db.prepare(
    'SELECT 1 FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
  ).get(id, req.user.id, emoji);

  if (existing) {
    db.prepare('DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .run(id, req.user.id, emoji);
  } else {
    // Cap each user to 6 distinct reactions per message
    const own = db.prepare('SELECT COUNT(*) AS c FROM chat_reactions WHERE message_id = ? AND user_id = ?').get(id, req.user.id).c;
    if (own >= 6) return res.status(400).json({ error: '6 reactions max per message per person.' });
    db.prepare('INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
      .run(id, req.user.id, emoji);
  }

  const updated = loadMessageById(id);
  const room = db.prepare('SELECT slug FROM chat_rooms WHERE id = ?').get(m.room_id);
  pushToRoom(room.slug, { type: 'reactions', id, reactions: updated.reactions });
  res.json({ reactions: updated.reactions });
});

/* GET /api/chat/stream/:slug — SSE for live updates */
router.get('/stream/:slug', optionalAuth, (req, res) => {
  const room = db.prepare('SELECT id, slug FROM chat_rooms WHERE slug = ?').get(req.params.slug);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const set = subscribers.get(room.slug) ?? new Set();
  const sub = { res, userId: req.user?.id ?? null };
  set.add(sub);
  subscribers.set(room.slug, set);

  // Heartbeat every 25s so proxies don't kill idle connections
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    set.delete(sub);
    if (set.size === 0) subscribers.delete(room.slug);
  });
});

export default router;
