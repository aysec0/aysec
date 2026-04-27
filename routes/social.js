import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/testimonials', (req, res) => {
  const { course_id } = req.query;
  let rows;
  if (course_id) {
    rows = db.prepare(`
      SELECT id, course_id, author_name, author_title, author_company, quote, rating
      FROM testimonials
      WHERE published = 1 AND course_id = ?
      ORDER BY position ASC
    `).all(course_id);
  } else {
    rows = db.prepare(`
      SELECT id, course_id, author_name, author_title, author_company, quote, rating
      FROM testimonials
      WHERE published = 1 AND course_id IS NULL
      ORDER BY position ASC
    `).all();
  }
  res.json({ testimonials: rows });
});

router.get('/faqs', (req, res) => {
  const { scope, course_id } = req.query;
  let rows;
  if (scope === 'course' && course_id) {
    rows = db.prepare(`
      SELECT id, question, answer FROM faqs
      WHERE published = 1 AND scope = 'course' AND course_id = ?
      ORDER BY position ASC
    `).all(course_id);
  } else if (scope) {
    rows = db.prepare(`
      SELECT id, question, answer FROM faqs
      WHERE published = 1 AND scope = ?
      ORDER BY position ASC
    `).all(scope);
  } else {
    rows = db.prepare(`
      SELECT id, scope, question, answer FROM faqs
      WHERE published = 1
      ORDER BY scope, position ASC
    `).all();
  }
  res.json({ faqs: rows });
});

router.get('/talks', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, title, venue, date, url, description, kind
    FROM talks
    WHERE published = 1
    ORDER BY date DESC
  `).all();
  res.json({ talks: rows });
});

router.post('/contact', (req, res) => {
  // Stub: no email send wired up. Stores the request as a special "post" with kind=contact for now.
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  // For now: just acknowledge. Real SMTP integration is out of scope.
  console.log('[CONTACT]', { name, email, subject, message_len: (message || '').length });
  res.json({ ok: true });
});

export default router;
