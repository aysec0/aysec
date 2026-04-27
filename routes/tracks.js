import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const tracks = db.prepare(`
    SELECT id, slug, title, subtitle, description, bundle_price_cents
    FROM tracks WHERE published = 1
    ORDER BY position ASC
  `).all();

  const stats = db.prepare(`
    SELECT
      tc.track_id,
      COUNT(*)                                            AS course_count,
      SUM(CASE WHEN c.is_paid = 1 THEN c.price_cents ELSE 0 END) AS sum_price_cents,
      SUM((SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id))  AS lesson_count,
      COALESCE(SUM((
        SELECT COALESCE(SUM(estimated_minutes), 0)
        FROM lessons l WHERE l.course_id = c.id
      )), 0)                                              AS total_minutes
    FROM track_courses tc
    JOIN courses c ON c.id = tc.course_id AND c.published = 1
    GROUP BY tc.track_id
  `).all();
  const byTrack = Object.fromEntries(stats.map((s) => [s.track_id, s]));

  res.json({
    tracks: tracks.map((t) => ({
      ...t,
      ...(byTrack[t.id] || { course_count: 0, sum_price_cents: 0, lesson_count: 0, total_minutes: 0 }),
    })),
  });
});

router.get('/:slug', (req, res) => {
  const track = db.prepare(
    'SELECT * FROM tracks WHERE slug = ? AND published = 1'
  ).get(req.params.slug);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const courses = db.prepare(`
    SELECT c.id, c.slug, c.title, c.subtitle, c.difficulty, c.is_paid, c.price_cents, c.currency,
           tc.position,
           (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
           (SELECT COALESCE(SUM(estimated_minutes), 0) FROM lessons l WHERE l.course_id = c.id) AS total_minutes
    FROM track_courses tc
    JOIN courses c ON c.id = tc.course_id AND c.published = 1
    WHERE tc.track_id = ?
    ORDER BY tc.position ASC
  `).all(track.id);

  const sumPrice = courses.reduce((s, c) => s + (c.is_paid ? c.price_cents : 0), 0);
  const totalLessons = courses.reduce((s, c) => s + c.lesson_count, 0);
  const totalMinutes = courses.reduce((s, c) => s + c.total_minutes, 0);
  const savings = sumPrice && track.bundle_price_cents
    ? Math.max(0, sumPrice - track.bundle_price_cents)
    : 0;

  res.json({
    track,
    courses,
    summary: { sum_price_cents: sumPrice, total_lessons: totalLessons, total_minutes: totalMinutes, savings },
  });
});

export default router;
