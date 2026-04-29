import { Router } from 'express';
import { marked } from 'marked';
import { db } from '../db/index.js';

const router = Router();

marked.setOptions({ gfm: true, breaks: false });

router.get('/', (req, res) => {
  const { kind } = req.query;
  // Include migrated_to_forum_id so callers can link straight to the new
  // home (/community/post/:id) rather than chasing the /blog/:slug redirect.
  const sql = `
    SELECT id, slug, title, excerpt, cover_url, tags, kind, published_at, migrated_to_forum_id
    FROM posts
    WHERE published = 1 ${kind ? 'AND kind = ?' : ''}
    ORDER BY published_at DESC
    LIMIT 50
  `;
  const rows = kind ? db.prepare(sql).all(kind) : db.prepare(sql).all();
  res.json({ posts: rows });
});

router.get('/:slug', (req, res) => {
  const post = db.prepare(
    'SELECT * FROM posts WHERE slug = ? AND published = 1'
  ).get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const html = post.content_md ? marked.parse(post.content_md) : '';
  const wordCount = (post.content_md || '').trim().split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / 220));

  // Related posts: same kind, share at least one tag, exclude self, max 3.
  const myTags = (post.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  let related = [];
  if (myTags.length) {
    const candidates = db.prepare(`
      SELECT id, slug, title, excerpt, tags, kind, published_at
      FROM posts
      WHERE published = 1 AND id != ?
      ORDER BY published_at DESC
      LIMIT 50
    `).all(post.id);
    related = candidates
      .map((p) => {
        const theirs = (p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
        const overlap = theirs.filter((t) => myTags.includes(t)).length;
        return { ...p, _overlap: overlap };
      })
      .filter((p) => p._overlap > 0)
      .sort((a, b) => b._overlap - a._overlap)
      .slice(0, 3)
      .map(({ _overlap, ...p }) => p);
  }

  res.json({ post: { ...post, content_html: html, reading_minutes: readingMinutes }, related });
});

export default router;
