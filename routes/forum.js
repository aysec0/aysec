/* /api/forum/* — Reddit-style community forum.
   Categories ("subs"), posts (text + optional URL), one level of comment
   threading (nested replies render flat for MVP), up/downvotes on both.
   Score is denormalised on the row so list queries stay cheap. */
import { Router } from 'express';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { emit as emitNotification } from './notifications.js';
import { emitActivity } from './activity.js';

// ---- @mention parser ---------------------------------------------------
// Pulls every @username out of a markdown body, deduplicates, returns the
// matching user rows (existing users only, never the author themselves).
function findMentions(body, authorId) {
  if (!body) return [];
  const set = new Set();
  const re = /(?:^|[^\w@])@([a-zA-Z0-9_]{2,32})\b/g;
  let m;
  while ((m = re.exec(body)) !== null) set.add(m[1].toLowerCase());
  if (!set.size) return [];
  const placeholders = [...set].map(() => '?').join(',');
  return db.prepare(
    `SELECT id, username FROM users WHERE LOWER(username) IN (${placeholders}) AND id != ?`
  ).all(...[...set], authorId);
}

const router = Router();

// ===== Categories =====
router.get('/categories', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM forum_posts WHERE category_id = c.id) AS post_count
    FROM forum_categories c ORDER BY position, id
  `).all();
  res.json({ categories: rows });
});

// ===== Posts list =====
// /api/forum/posts?cat=slug&sort=hot|new|top&limit=30
router.get('/posts', optionalAuth, (req, res) => {
  const cat = req.query.cat;
  const sort = ['hot','new','top'].includes(req.query.sort) ? req.query.sort : 'hot';
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 25));
  const orderBy = sort === 'new'
    ? 'p.pinned DESC, p.created_at DESC'
    : sort === 'top'
      ? 'p.pinned DESC, p.score DESC, p.created_at DESC'
      // hot — log10(max(score,1)) + ageHours decay (Reddit's-ish, in SQL)
      : 'p.pinned DESC, (p.score * 1.0 / (POWER(((julianday(\'now\') - julianday(p.created_at)) * 24 + 2), 1.5))) DESC';

  const where = cat ? 'WHERE c.slug = ?' : '';
  const rows = db.prepare(`
    SELECT p.id, p.title, p.body_md, p.url, p.score, p.comment_count, p.pinned, p.locked, p.created_at,
           u.username, u.display_name,
           c.slug AS cat_slug, c.name AS cat_name, c.color AS cat_color,
           ${req.user ? '(SELECT vote FROM forum_post_votes WHERE post_id = p.id AND user_id = ?)' : 'NULL'} AS my_vote
    FROM forum_posts p
    JOIN forum_categories c ON c.id = p.category_id
    JOIN users u            ON u.id = p.user_id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ?
  `).all(...(req.user ? [req.user.id] : []), ...(cat ? [cat] : []), limit);
  res.json({ posts: rows, sort, cat });
});

// ===== Single post (with comments) =====
router.get('/posts/:id', optionalAuth, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.username, u.display_name,
      c.slug AS cat_slug, c.name AS cat_name, c.color AS cat_color,
      ${req.user ? '(SELECT vote FROM forum_post_votes WHERE post_id = p.id AND user_id = ?)' : 'NULL'} AS my_vote
    FROM forum_posts p
    JOIN forum_categories c ON c.id = p.category_id
    JOIN users u            ON u.id = p.user_id
    WHERE p.id = ?
  `).get(...(req.user ? [req.user.id] : []), req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const comments = db.prepare(`
    SELECT cm.id, cm.parent_id, cm.body_md, cm.score, cm.created_at,
      u.username, u.display_name,
      ${req.user ? '(SELECT vote FROM forum_comment_votes WHERE comment_id = cm.id AND user_id = ?)' : 'NULL'} AS my_vote
    FROM forum_comments cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.post_id = ?
    ORDER BY cm.score DESC, cm.created_at ASC
  `).all(...(req.user ? [req.user.id] : []), req.params.id);

  res.json({ post, comments });
});

// ===== Create post =====
router.post('/posts', requireAuth, (req, res) => {
  const { category, title, body_md, url } = req.body || {};
  if (!category || !title) return res.status(400).json({ error: 'Need category + title' });
  if (title.length > 280)  return res.status(400).json({ error: 'Title too long' });
  const cat = db.prepare('SELECT id FROM forum_categories WHERE slug = ?').get(category);
  if (!cat) return res.status(400).json({ error: 'Unknown category' });
  const info = db.prepare(`
    INSERT INTO forum_posts (category_id, user_id, title, body_md, url, score)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(cat.id, req.user.id, title.trim(), (body_md || '').trim(), url || null);
  // Author auto-upvotes
  db.prepare(
    'INSERT INTO forum_post_votes (post_id, user_id, vote) VALUES (?, ?, 1)'
  ).run(info.lastInsertRowid, req.user.id);
  // Mention notifications — anyone @mentioned in the post body gets pinged
  for (const mu of findMentions(body_md, req.user.id)) {
    emitNotification({
      userId: mu.id,
      kind: 'mention',
      title: `@${req.user.username} mentioned you`,
      body: title.trim(),
      link: `/community/post/${info.lastInsertRowid}`,
      icon: '@',
    });
  }
  emitActivity({
    userId: req.user.id, kind: 'post',
    title: `Posted "${title.trim().slice(0, 80)}"`,
    body:  `in /community/${category}`,
    link:  `/community/post/${info.lastInsertRowid}`,
    visibility: 'public',
  });
  res.json({ id: info.lastInsertRowid });
});

// ===== Vote on post =====
router.post('/posts/:id/vote', requireAuth, (req, res) => {
  const v = parseInt(req.body?.vote, 10);
  if (![1, -1, 0].includes(v)) return res.status(400).json({ error: 'vote must be 1, -1, or 0' });
  const post = db.prepare('SELECT id, score FROM forum_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const cur = db.prepare('SELECT vote FROM forum_post_votes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
  const oldV = cur?.vote || 0;
  const delta = v - oldV;
  if (v === 0) {
    db.prepare('DELETE FROM forum_post_votes WHERE post_id = ? AND user_id = ?').run(post.id, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO forum_post_votes (post_id, user_id, vote) VALUES (?, ?, ?)
      ON CONFLICT(post_id, user_id) DO UPDATE SET vote = excluded.vote, voted_at = datetime('now')
    `).run(post.id, req.user.id, v);
  }
  if (delta !== 0) {
    db.prepare('UPDATE forum_posts SET score = score + ? WHERE id = ?').run(delta, post.id);
  }
  const fresh = db.prepare('SELECT score FROM forum_posts WHERE id = ?').get(post.id);
  res.json({ score: fresh.score, my_vote: v });
});

// ===== Mod actions: pin / lock (admin only) =====
router.post('/posts/:id/mod', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const cur = db.prepare('SELECT id, pinned, locked FROM forum_posts WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Post not found' });
  const updates = {};
  if (typeof req.body?.pinned === 'boolean') updates.pinned = req.body.pinned ? 1 : 0;
  if (typeof req.body?.locked === 'boolean') updates.locked = req.body.locked ? 1 : 0;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Need pinned or locked' });
  db.prepare(`UPDATE forum_posts SET pinned = ?, locked = ? WHERE id = ?`).run(
    updates.pinned ?? cur.pinned, updates.locked ?? cur.locked, cur.id
  );
  res.json({ ok: true });
});

// ===== Delete post (own or admin) =====
router.delete('/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT user_id FROM forum_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM forum_posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Add comment =====
router.post('/posts/:id/comments', requireAuth, (req, res) => {
  const { body_md, parent_id } = req.body || {};
  if (!body_md || !body_md.trim()) return res.status(400).json({ error: 'Need body_md' });
  if (body_md.length > 10000) return res.status(400).json({ error: 'Comment too long' });
  const post = db.prepare(
    'SELECT id, user_id, title, locked FROM forum_posts WHERE id = ?'
  ).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.locked) return res.status(400).json({ error: 'Post is locked' });
  let parent = null;
  if (parent_id) {
    parent = db.prepare(
      'SELECT id, user_id FROM forum_comments WHERE id = ? AND post_id = ?'
    ).get(parent_id, post.id);
    if (!parent) return res.status(400).json({ error: 'Bad parent_id' });
  }
  const info = db.prepare(`
    INSERT INTO forum_comments (post_id, parent_id, user_id, body_md, score) VALUES (?, ?, ?, ?, 1)
  `).run(post.id, parent_id || null, req.user.id, body_md.trim());
  // Author auto-upvotes their own comment
  db.prepare(
    'INSERT INTO forum_comment_votes (comment_id, user_id, vote) VALUES (?, ?, 1)'
  ).run(info.lastInsertRowid, req.user.id);
  db.prepare('UPDATE forum_posts SET comment_count = comment_count + 1 WHERE id = ?').run(post.id);

  // ---- Notifications ----
  const cid = info.lastInsertRowid;
  const link = `/community/post/${post.id}#c${cid}`;
  const titleSnippet = body_md.trim().slice(0, 120);
  // 1) Reply to a comment → ping that comment's author
  if (parent && parent.user_id !== req.user.id) {
    emitNotification({
      userId: parent.user_id,
      kind: 'forum_reply',
      title: `@${req.user.username} replied to you`,
      body: titleSnippet,
      link,
      icon: '↩',
    });
  }
  // 2) Top-level comment → ping the post author (unless self-reply or already
  //    notified via the parent above)
  if (!parent && post.user_id !== req.user.id) {
    emitNotification({
      userId: post.user_id,
      kind: 'forum_reply',
      title: `@${req.user.username} commented on your post`,
      body: post.title,
      link,
      icon: '↩',
    });
  }
  // 3) @mentions in the body → ping each mentioned user (skip everyone we
  //    already pinged above to avoid double-notif)
  const alreadyNotified = new Set();
  if (parent?.user_id) alreadyNotified.add(parent.user_id);
  if (!parent && post.user_id !== req.user.id) alreadyNotified.add(post.user_id);
  for (const mu of findMentions(body_md, req.user.id)) {
    if (alreadyNotified.has(mu.id)) continue;
    emitNotification({
      userId: mu.id,
      kind: 'mention',
      title: `@${req.user.username} mentioned you`,
      body: titleSnippet,
      link,
      icon: '@',
    });
  }

  res.json({ id: cid });
});

// ===== Vote on comment =====
router.post('/comments/:id/vote', requireAuth, (req, res) => {
  const v = parseInt(req.body?.vote, 10);
  if (![1, -1, 0].includes(v)) return res.status(400).json({ error: 'vote must be 1, -1, or 0' });
  const c = db.prepare('SELECT id FROM forum_comments WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found' });
  const cur = db.prepare('SELECT vote FROM forum_comment_votes WHERE comment_id = ? AND user_id = ?').get(c.id, req.user.id);
  const oldV = cur?.vote || 0;
  const delta = v - oldV;
  if (v === 0) {
    db.prepare('DELETE FROM forum_comment_votes WHERE comment_id = ? AND user_id = ?').run(c.id, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO forum_comment_votes (comment_id, user_id, vote) VALUES (?, ?, ?)
      ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = excluded.vote, voted_at = datetime('now')
    `).run(c.id, req.user.id, v);
  }
  if (delta !== 0) {
    db.prepare('UPDATE forum_comments SET score = score + ? WHERE id = ?').run(delta, c.id);
  }
  const fresh = db.prepare('SELECT score FROM forum_comments WHERE id = ?').get(c.id);
  res.json({ score: fresh.score, my_vote: v });
});

// ===== Delete comment (own or admin) =====
router.delete('/comments/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT user_id, post_id FROM forum_comments WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found' });
  if (c.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM forum_comments WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE forum_posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?').run(c.post_id);
  res.json({ ok: true });
});

export default router;
