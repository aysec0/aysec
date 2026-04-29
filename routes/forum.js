/* /api/forum/* — Reddit-style community forum, with three differentiators:

     1. SKILL-WEIGHTED VOTES — a user's vote in #web carries weight that
        scales with their actual web skill (duels rating + challenge
        solves in that category). A pwn expert's upvote on a pwn post
        counts ~5× a beginner's. Weight is cached at vote-cast time so
        the post score is a pure SUM(weight) and list queries stay O(1).

     2. VERIFIED WRITEUPS — when a post claims to write up a specific
        challenge, the platform auto-verifies via the solves table.
        Verified posts get a green ✓ badge and surface higher.

     3. LIVE WINDOWS — every new post is "live" for 60 minutes. During
        the window it pins to the top of the feed, replies stream over
        SSE, and an active-now counter is shown. After the hour it
        becomes a normal async thread forever.
*/
import { Router } from 'express';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { emit as emitNotification } from './notifications.js';
import { emitActivity } from './activity.js';

const LIVE_WINDOW_MIN = 60;

// Map forum category slug → CTF challenge category. Most line up directly;
// careers/news/showcase fall through to a "general" weight.
const CAT_TO_CHALLENGE_CATEGORY = {
  web: 'web', crypto: 'crypto', pwn: 'pwn', ai: 'ai',
  forensics: 'forensics', misc: 'misc', osint: 'misc',
  beginner: null, careers: null, news: null, showcase: null, writeups: null,
};

/* Skill-weighted vote — returns a multiplier 1..6 based on the user's
   demonstrated expertise in the post's category. Components:
     - challenge points solved in that category (capped 1000)
     - duel rating in the closest matching format (0..3000 mapped 0..3)
   Total: 1 (everyone gets at least 1) + skill bonus, max 6.
   Returns 1.0 for general categories with no clear mapping.            */
function voteWeightFor(userId, categorySlug) {
  const ctfCat = CAT_TO_CHALLENGE_CATEGORY[categorySlug];
  if (!ctfCat) return 1.0;
  // Solved-points component
  let solvedPts = 0;
  try {
    const r = db.prepare(`
      SELECT COALESCE(SUM(c.points), 0) AS pts
      FROM solves s JOIN challenges c ON c.id = s.challenge_id
      WHERE s.user_id = ? AND c.category = ?
    `).get(userId, ctfCat);
    solvedPts = Math.min(1000, r?.pts || 0);
  } catch {}
  // Duel rating component — pick the highest format rating we have
  let duelRating = 1000;
  try {
    const r = db.prepare(`
      SELECT MAX(rating) AS r FROM duel_ratings WHERE user_id = ?
    `).get(userId);
    if (r?.r) duelRating = r.r;
  } catch {}
  // Compose: 1 + (solvedPts/200) + ((duelRating-1000)/500), clamp 1..6
  const w = 1 + (solvedPts / 200) + Math.max(0, (duelRating - 1000) / 500);
  return Math.max(1.0, Math.min(6.0, +w.toFixed(2)));
}

/* Recompute a post's score from its vote rows (sum of weights, with
   negatives subtracted). Cheaper to call this once on vote-toggle than
   to maintain a separate denormalised counter that drifts. */
function recomputePostScore(postId) {
  const r = db.prepare(`
    SELECT COALESCE(SUM(vote * weight), 0) AS score
    FROM forum_post_votes WHERE post_id = ?
  `).get(postId);
  const score = Math.round(r.score || 0);
  db.prepare('UPDATE forum_posts SET score = ? WHERE id = ?').run(score, postId);
  return score;
}
function recomputeCommentScore(commentId) {
  const r = db.prepare(`
    SELECT COALESCE(SUM(vote * weight), 0) AS score
    FROM forum_comment_votes WHERE comment_id = ?
  `).get(commentId);
  const score = Math.round(r.score || 0);
  db.prepare('UPDATE forum_comments SET score = ? WHERE id = ?').run(score, commentId);
  return score;
}

/* Compute "verified" state for a writeup post. A post is verified iff:
     - It claims a challenge_id (set at create time)
     - The author has a solves row for that challenge
   Returns the resolved challenge object so the UI can deep-link.        */
function verifyWriteup(post) {
  if (!post?.claimed_challenge_id || !post?.user_id) return null;
  const ch = db.prepare(
    'SELECT id, slug, title, category, difficulty, points, source FROM challenges WHERE id = ?'
  ).get(post.claimed_challenge_id);
  if (!ch) return null;
  const solved = db.prepare(
    'SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?'
  ).get(post.user_id, ch.id);
  return solved ? ch : null;
}

/* Live-window helper: returns a Date for the live-until timestamp. */
function liveUntilNow(min = LIVE_WINDOW_MIN) {
  return new Date(Date.now() + min * 60_000)
    .toISOString().replace('T', ' ').slice(0, 19);
}

/* SSE fan-out keyed by post_id — when a comment lands during the live
   window, push to subscribers of that post. */
const liveSubscribers = new Map();
function pushLive(postId, event) {
  const set = liveSubscribers.get(Number(postId));
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch {}
  }
}

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
// /api/forum/posts?cat=slug&sort=hot|live|new|top&limit=30
router.get('/posts', optionalAuth, (req, res) => {
  const cat = req.query.cat;
  const sort = ['hot','live','new','top'].includes(req.query.sort) ? req.query.sort : 'hot';
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 25));

  // Live posts always sit above non-live posts in the default Hot view —
  // makes the platform "feel alive" because the recently-created stuff
  // is impossible to miss for the first hour.
  const orderBy = sort === 'new'
    ? 'p.pinned DESC, p.created_at DESC'
    : sort === 'top'
      ? 'p.pinned DESC, p.score DESC, p.created_at DESC'
      : sort === 'live'
        ? 'p.pinned DESC, (p.live_until > datetime(\'now\')) DESC, p.live_until DESC, p.created_at DESC'
        // hot — pinned, then live, then weighted-score / age decay
        : 'p.pinned DESC, (p.live_until > datetime(\'now\')) DESC, (p.score * 1.0 / (POWER(((julianday(\'now\') - julianday(p.created_at)) * 24 + 2), 1.5))) DESC';

  const where = cat ? 'WHERE c.slug = ?' : '';
  const rows = db.prepare(`
    SELECT p.id, p.title, p.body_md, p.url, p.score, p.comment_count, p.pinned, p.locked, p.created_at,
           p.live_until, p.claimed_challenge_id,
           u.id AS user_id, u.username, u.display_name,
           c.slug AS cat_slug, c.name AS cat_name, c.color AS cat_color,
           ${req.user ? '(SELECT vote FROM forum_post_votes WHERE post_id = p.id AND user_id = ?)' : 'NULL'} AS my_vote
    FROM forum_posts p
    JOIN forum_categories c ON c.id = p.category_id
    JOIN users u            ON u.id = p.user_id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ?
  `).all(...(req.user ? [req.user.id] : []), ...(cat ? [cat] : []), limit);

  const now = Date.now();
  const enriched = rows.map((p) => {
    const verified = verifyWriteup(p);
    const isLive = p.live_until && new Date(p.live_until.replace(' ', 'T') + 'Z').getTime() > now;
    return {
      ...p,
      is_live: !!isLive,
      verified_writeup: verified ? { challenge: verified } : null,
    };
  });
  res.json({ posts: enriched, sort, cat });
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

  const verified = verifyWriteup(post);
  const isLive = post.live_until && new Date(post.live_until.replace(' ', 'T') + 'Z').getTime() > Date.now();

  const comments = db.prepare(`
    SELECT cm.id, cm.parent_id, cm.body_md, cm.score, cm.created_at,
      u.username, u.display_name,
      ${req.user ? '(SELECT vote FROM forum_comment_votes WHERE comment_id = cm.id AND user_id = ?)' : 'NULL'} AS my_vote
    FROM forum_comments cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.post_id = ?
    ORDER BY cm.score DESC, cm.created_at ASC
  `).all(...(req.user ? [req.user.id] : []), req.params.id);

  res.json({
    post: {
      ...post,
      is_live: !!isLive,
      verified_writeup: verified ? { challenge: verified } : null,
    },
    comments,
  });
});

// ===== Create post =====
router.post('/posts', requireAuth, (req, res) => {
  const { category, title, body_md, url, claimed_challenge_slug, go_live } = req.body || {};
  if (!category || !title) return res.status(400).json({ error: 'Need category + title' });
  if (title.length > 280)  return res.status(400).json({ error: 'Title too long' });
  const cat = db.prepare('SELECT id, slug FROM forum_categories WHERE slug = ?').get(category);
  if (!cat) return res.status(400).json({ error: 'Unknown category' });

  // Optional writeup-claim — verify the user has solved this challenge
  let claimedId = null;
  if (claimed_challenge_slug) {
    const ch = db.prepare('SELECT id FROM challenges WHERE slug = ? AND published = 1').get(claimed_challenge_slug);
    if (!ch) return res.status(400).json({ error: 'Unknown challenge slug' });
    const solved = db.prepare('SELECT 1 FROM solves WHERE user_id = ? AND challenge_id = ?').get(req.user.id, ch.id);
    if (!solved) return res.status(400).json({ error: "You haven't solved that challenge — can't claim a writeup for it." });
    claimedId = ch.id;
  }

  // Live window — opt-in via go_live=true. Default off so people writing
  // long-form drafts don't pin themselves to the top by accident.
  const liveUntil = go_live ? liveUntilNow() : null;

  // Author's own upvote — its weight reflects their category expertise
  const authorWeight = voteWeightFor(req.user.id, cat.slug);

  const info = db.prepare(`
    INSERT INTO forum_posts (category_id, user_id, title, body_md, url, score,
                             live_until, claimed_challenge_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cat.id, req.user.id, title.trim(), (body_md || '').trim(), url || null,
         Math.round(authorWeight), liveUntil, claimedId);
  // Author auto-upvotes (with weighted vote)
  db.prepare(
    'INSERT INTO forum_post_votes (post_id, user_id, vote, weight) VALUES (?, ?, 1, ?)'
  ).run(info.lastInsertRowid, req.user.id, authorWeight);
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
  res.json({
    id: info.lastInsertRowid,
    live_until: liveUntil,
    claimed_challenge_id: claimedId,
  });
});

// ===== Vote on post (skill-weighted) =====
router.post('/posts/:id/vote', requireAuth, (req, res) => {
  const v = parseInt(req.body?.vote, 10);
  if (![1, -1, 0].includes(v)) return res.status(400).json({ error: 'vote must be 1, -1, or 0' });
  const post = db.prepare(`
    SELECT p.id, p.score, c.slug AS cat_slug FROM forum_posts p
    JOIN forum_categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (v === 0) {
    db.prepare('DELETE FROM forum_post_votes WHERE post_id = ? AND user_id = ?').run(post.id, req.user.id);
  } else {
    // Cache the user's category weight at vote-cast time so list queries
    // can sort by SUM(vote * weight) without a per-vote recompute.
    const weight = voteWeightFor(req.user.id, post.cat_slug);
    db.prepare(`
      INSERT INTO forum_post_votes (post_id, user_id, vote, weight)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(post_id, user_id) DO UPDATE SET
        vote = excluded.vote,
        weight = excluded.weight,
        voted_at = datetime('now')
    `).run(post.id, req.user.id, v, weight);
  }
  const score = recomputePostScore(post.id);
  res.json({ score, my_vote: v });
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
  // Author's own upvote weight (skill-weighted) — also caches as the post's
  // category weight so a comment by a domain expert immediately scores higher.
  const cat = db.prepare(`
    SELECT cat.slug FROM forum_categories cat
    JOIN forum_posts p ON p.category_id = cat.id WHERE p.id = ?
  `).get(post.id);
  const authorWeight = voteWeightFor(req.user.id, cat?.slug || null);
  const info = db.prepare(`
    INSERT INTO forum_comments (post_id, parent_id, user_id, body_md, score)
    VALUES (?, ?, ?, ?, ?)
  `).run(post.id, parent_id || null, req.user.id, body_md.trim(), Math.round(authorWeight));
  db.prepare(
    'INSERT INTO forum_comment_votes (comment_id, user_id, vote, weight) VALUES (?, ?, 1, ?)'
  ).run(info.lastInsertRowid, req.user.id, authorWeight);
  db.prepare('UPDATE forum_posts SET comment_count = comment_count + 1 WHERE id = ?').run(post.id);

  // Live SSE — push the new comment to anyone watching this post
  pushLive(post.id, {
    type: 'comment',
    comment: {
      id: info.lastInsertRowid,
      post_id: post.id,
      parent_id: parent_id || null,
      body_md: body_md.trim(),
      score: Math.round(authorWeight),
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      username: req.user.username,
      display_name: req.user.display_name,
      my_vote: 1,
    },
  });

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

// ===== Vote on comment (skill-weighted) =====
router.post('/comments/:id/vote', requireAuth, (req, res) => {
  const v = parseInt(req.body?.vote, 10);
  if (![1, -1, 0].includes(v)) return res.status(400).json({ error: 'vote must be 1, -1, or 0' });
  const c = db.prepare(`
    SELECT cm.id, cat.slug AS cat_slug
    FROM forum_comments cm
    JOIN forum_posts p     ON p.id = cm.post_id
    JOIN forum_categories cat ON cat.id = p.category_id
    WHERE cm.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found' });

  if (v === 0) {
    db.prepare('DELETE FROM forum_comment_votes WHERE comment_id = ? AND user_id = ?').run(c.id, req.user.id);
  } else {
    const weight = voteWeightFor(req.user.id, c.cat_slug);
    db.prepare(`
      INSERT INTO forum_comment_votes (comment_id, user_id, vote, weight)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(comment_id, user_id) DO UPDATE SET
        vote = excluded.vote,
        weight = excluded.weight,
        voted_at = datetime('now')
    `).run(c.id, req.user.id, v, weight);
  }
  const score = recomputeCommentScore(c.id);
  res.json({ score, my_vote: v });
});

/* ===== Live-post SSE stream =====
   Subscribe to live updates for one post — we push every new comment
   (and comment-vote score change) to all open tabs. The connection
   stays open as long as the user keeps the post page open. */
router.get('/posts/:id/live', optionalAuth, (req, res) => {
  const post = db.prepare('SELECT id, live_until FROM forum_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`: connected — live_until=${post.live_until || 'expired'}\n\n`);

  const set = liveSubscribers.get(post.id) ?? new Set();
  set.add(res);
  liveSubscribers.set(post.id, set);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    set.delete(res);
    if (set.size === 0) liveSubscribers.delete(post.id);
  });
});

/* GET /api/forum/me/weight — the signed-in user's vote weight per
   category. Used by the UI to render "your vote counts as 3.4× here"
   tooltips, plus the profile-rank section. */
router.get('/me/weight', requireAuth, (req, res) => {
  const cats = db.prepare('SELECT slug FROM forum_categories ORDER BY position').all();
  const out = {};
  for (const c of cats) out[c.slug] = voteWeightFor(req.user.id, c.slug);
  res.json({ weights: out });
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
