import { Router } from 'express';
import { marked } from 'marked';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, slug, title, subtitle, category, tool_url, updated_at,
           length(COALESCE(content_md, '')) AS body_size
    FROM cheatsheets
    WHERE published = 1
    ORDER BY position ASC, title ASC
  `).all();
  res.json({ cheatsheets: rows });
});

router.get('/:slug', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM cheatsheets WHERE slug = ? AND published = 1'
  ).get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Cheatsheet not found' });
  const html = row.content_md ? marked.parse(row.content_md) : '';
  res.json({ cheatsheet: { ...row, content_html: html } });
});

export default router;
