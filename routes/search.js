/* /api/search — full-text search across courses, posts, challenges,
 * cheatsheets, lessons, and cert prep. Powered by SQLite FTS5
 * (tokenizer: porter + unicode61), rebuilt on server start.
 */
import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

/** Wipe + rebuild the search_fts table from canonical entity tables.
 * Called once on server startup (and exposed for admin triggers). */
export function rebuildSearchIndex() {
  try {
    db.exec('DELETE FROM search_fts');
    const insert = db.prepare(
      'INSERT INTO search_fts (type, title, body, slug, url) VALUES (?, ?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      // Courses
      for (const r of db.prepare(
        `SELECT slug, title, COALESCE(subtitle, '') || ' ' || COALESCE(description, '') AS body
         FROM courses WHERE published = 1`
      ).all()) {
        insert.run('course', r.title, r.body, r.slug, `/courses/${r.slug}`);
      }
      // Lessons
      for (const r of db.prepare(
        `SELECT l.slug AS lslug, c.slug AS cslug, l.title, COALESCE(l.content_md, '') AS body
         FROM lessons l JOIN courses c ON c.id = l.course_id WHERE c.published = 1`
      ).all()) {
        insert.run('lesson', r.title, r.body.slice(0, 4000), r.lslug, `/courses/${r.cslug}#${r.lslug}`);
      }
      // Posts (writeups) — link to the migrated forum-post URL when available;
      // legacy unmigrated rows still resolve via the /blog/:slug redirect.
      for (const r of db.prepare(
        `SELECT slug, title, migrated_to_forum_id,
                COALESCE(excerpt, '') || ' ' || COALESCE(content_md, '') AS body
         FROM posts WHERE published = 1`
      ).all()) {
        const url = r.migrated_to_forum_id
          ? `/community/post/${r.migrated_to_forum_id}`
          : `/blog/${r.slug}`;
        insert.run('post', r.title, r.body.slice(0, 4000), r.slug, url);
      }
      // Forum posts that DON'T come from the blog migration — community-native
      // threads should also be searchable.
      for (const r of db.prepare(
        `SELECT fp.id, fp.title, fp.body_md AS body
         FROM forum_posts fp
         WHERE fp.id NOT IN (SELECT migrated_to_forum_id FROM posts WHERE migrated_to_forum_id IS NOT NULL)`
      ).all()) {
        insert.run('post', r.title, (r.body || '').slice(0, 4000), String(r.id), `/community/post/${r.id}`);
      }
      // Challenges
      for (const r of db.prepare(
        `SELECT slug, title, COALESCE(description, '') || ' ' || category || ' ' || difficulty AS body
         FROM challenges WHERE published = 1`
      ).all()) {
        insert.run('challenge', r.title, r.body, r.slug, `/challenges/${r.slug}`);
      }
      // Cheatsheets
      for (const r of db.prepare(
        `SELECT slug, title, COALESCE(subtitle, '') || ' ' || COALESCE(content_md, '') AS body
         FROM cheatsheets WHERE published = 1`
      ).all()) {
        insert.run('cheatsheet', r.title, r.body.slice(0, 4000), r.slug, `/cheatsheets/${r.slug}`);
      }
      // Cert prep
      for (const r of db.prepare(
        `SELECT slug, cert_name AS title,
          COALESCE(tagline, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(what_covered, '') AS body
         FROM cert_prep WHERE published = 1`
      ).all()) {
        insert.run('cert', r.title, r.body, r.slug, `/certifications/${r.slug}`);
      }
    });
    tx();
    const count = db.prepare('SELECT COUNT(*) AS c FROM search_fts').get().c;
    return { ok: true, count };
  } catch (err) {
    console.warn('search index rebuild failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// Sanitize FTS5 user input — strip operators that would let users break
// out of the match (we want simple "all-words match" semantics).
function buildMatchExpr(q) {
  const tokens = q.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (!tokens.length) return null;
  // Each token gets a prefix wildcard so partial matches still hit
  return tokens.map((t) => `${t}*`).join(' ');
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = req.query.type ? String(req.query.type) : null;
  if (q.length < 2) return res.json({ q, results: [], total: 0 });
  const expr = buildMatchExpr(q);
  if (!expr) return res.json({ q, results: [], total: 0 });

  try {
    const sql = type
      ? `SELECT type, title, body, slug, url
         FROM search_fts WHERE type = ? AND search_fts MATCH ?
         ORDER BY rank LIMIT 50`
      : `SELECT type, title, body, slug, url
         FROM search_fts WHERE search_fts MATCH ?
         ORDER BY rank LIMIT 50`;
    const rows = type
      ? db.prepare(sql).all(type, expr)
      : db.prepare(sql).all(expr);
    // Trim body to a 240-char snippet, keeping tokens visible if possible
    const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    const snippet = (s) => {
      const lower = s.toLowerCase();
      const hit = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
      const start = hit > 60 ? hit - 60 : 0;
      let body = s.slice(start, start + 240).trim();
      if (start > 0) body = '…' + body;
      if (s.length > start + 240) body += '…';
      return body;
    };
    const results = rows.map((r) => ({ type: r.type, title: r.title, slug: r.slug, url: r.url, snippet: snippet(r.body || '') }));
    // Group by type for display
    const grouped = {};
    for (const r of results) (grouped[r.type] ||= []).push(r);
    res.json({ q, results, grouped, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
