import { Router } from 'express';
import { marked } from 'marked';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const certs = db.prepare(`
    SELECT id, slug, cert_name, cert_full_name, cert_issuer, exam_cost_cents, exam_currency,
           difficulty, duration_estimate, tagline,
           (SELECT COUNT(*) FROM cert_prep_courses    cc WHERE cc.cert_id    = cert_prep.id) AS course_count,
           (SELECT COUNT(*) FROM cert_prep_challenges cx WHERE cx.cert_id    = cert_prep.id) AS challenge_count
    FROM cert_prep
    WHERE published = 1
    ORDER BY position ASC
  `).all();
  res.json({ certifications: certs });
});

router.get('/:slug', (req, res) => {
  const cert = db.prepare(
    'SELECT * FROM cert_prep WHERE slug = ? AND published = 1'
  ).get(req.params.slug);
  if (!cert) return res.status(404).json({ error: 'Certification not found' });

  const courses = db.prepare(`
    SELECT c.id, c.slug, c.title, c.subtitle, c.difficulty, c.is_paid, c.price_cents, c.currency,
           cc.position, cc.why_relevant,
           (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
           (SELECT COALESCE(SUM(estimated_minutes), 0) FROM lessons l WHERE l.course_id = c.id) AS total_minutes
    FROM cert_prep_courses cc
    JOIN courses c ON c.id = cc.course_id AND c.published = 1
    WHERE cc.cert_id = ?
    ORDER BY cc.position ASC
  `).all(cert.id);

  const challenges = db.prepare(`
    SELECT ch.slug, ch.title, ch.category, ch.difficulty, ch.points, cx.position
    FROM cert_prep_challenges cx
    JOIN challenges ch ON ch.id = cx.challenge_id AND ch.published = 1
    WHERE cx.cert_id = ?
    ORDER BY cx.position ASC
  `).all(cert.id);

  // Render markdown fields
  const md = (s) => s ? marked.parse(s) : '';
  res.json({
    certification: {
      ...cert,
      description_html:      md(cert.description),
      what_covered_html:     md(cert.what_covered),
      what_not_covered_html: md(cert.what_not_covered),
      exam_tips_html:        md(cert.exam_tips),
    },
    courses,
    challenges,
    summary: {
      total_lessons: courses.reduce((s, c) => s + c.lesson_count, 0),
      total_minutes: courses.reduce((s, c) => s + c.total_minutes, 0),
      paid_courses_total_cents: courses.reduce((s, c) => s + (c.is_paid ? c.price_cents : 0), 0),
    },
  });
});

export default router;
