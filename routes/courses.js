import { Router } from 'express';
import { marked } from 'marked';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { maybeIssueCertificate } from './certificates.js';
import * as discord from '../lib/discord.js';

const router = Router();

marked.setOptions({ gfm: true, breaks: false });

function userHasAccess(userId, course) {
  if (!course.is_paid) return true;
  if (!userId) return false;
  const row = db.prepare('SELECT 1 FROM course_access WHERE user_id = ? AND course_id = ?').get(userId, course.id);
  return !!row;
}

router.get('/', optionalAuth, (req, res) => {
  const courses = db.prepare(`
    SELECT id, slug, title, subtitle, difficulty, is_paid, price_cents, currency, thumbnail_url, created_at,
           (SELECT COUNT(*) FROM lessons l WHERE l.course_id = courses.id) AS lesson_count
    FROM courses
    WHERE published = 1
    ORDER BY created_at DESC
  `).all();
  res.json({ courses });
});

router.get('/:slug', optionalAuth, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const lessons = db.prepare(`
    SELECT id, slug, title, position, is_preview, estimated_minutes
    FROM lessons
    WHERE course_id = ?
    ORDER BY position ASC
  `).all(course.id);

  const hasAccess = userHasAccess(req.user?.id, course);

  let progress = [];
  let certificate = null;
  if (req.user) {
    progress = db.prepare(`
      SELECT lesson_id FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id
      WHERE l.course_id = ? AND lp.user_id = ?
    `).all(course.id, req.user.id).map((r) => r.lesson_id);
    certificate = db.prepare(
      'SELECT code, issued_at FROM certificates WHERE user_id = ? AND course_id = ?'
    ).get(req.user.id, course.id) || null;
  }

  const studentCount = db.prepare(
    'SELECT COUNT(*) AS c FROM course_access WHERE course_id = ?'
  ).get(course.id).c;

  const testimonials = db.prepare(`
    SELECT author_name, author_title, author_company, quote, rating
    FROM testimonials WHERE course_id = ? AND published = 1 ORDER BY position ASC
  `).all(course.id);

  const faqs = db.prepare(`
    SELECT question, answer FROM faqs
    WHERE published = 1 AND scope = 'course' AND course_id = ? ORDER BY position ASC
  `).all(course.id);

  res.json({ course, lessons, hasAccess, progress, certificate, studentCount, testimonials, faqs });
});

router.get('/:slug/lessons/:lessonSlug', optionalAuth, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND slug = ?').get(course.id, req.params.lessonSlug);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  const access = userHasAccess(req.user?.id, course);
  const allowed = access || lesson.is_preview;
  if (!allowed) return res.status(402).json({ error: 'Purchase required', requiresPurchase: true });

  const html = lesson.content_md ? marked.parse(lesson.content_md) : '';

  let completed = false;
  if (req.user) {
    completed = !!db.prepare('SELECT 1 FROM lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(req.user.id, lesson.id);
  }

  // Sibling navigation
  const siblings = db.prepare(`
    SELECT id, slug, title, position FROM lessons WHERE course_id = ? ORDER BY position ASC
  `).all(course.id);
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;

  res.json({
    course: { slug: course.slug, title: course.title },
    lesson: { ...lesson, content_html: html },
    completed,
    prev: prev ? { slug: prev.slug, title: prev.title } : null,
    next: next ? { slug: next.slug, title: next.title } : null,
  });
});

router.post('/:slug/lessons/:lessonSlug/complete', requireAuth, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lesson = db.prepare('SELECT id, is_preview FROM lessons WHERE course_id = ? AND slug = ?').get(course.id, req.params.lessonSlug);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  if (!userHasAccess(req.user.id, course) && !lesson.is_preview) {
    return res.status(402).json({ error: 'Purchase required' });
  }
  db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)').run(req.user.id, lesson.id);
  // Auto-issue cert if this finishes the course.
  const cert = maybeIssueCertificate(req.user.id, course.id);
  if (cert) {
    discord.announceCertificate({
      userDisplay:  req.user.display_name,
      userUsername: req.user.username,
      courseTitle:  course.title,
      certCode:     cert.code,
    }).catch(() => {});
  }
  res.json({ ok: true, certificate: cert });
});

router.post('/:slug/enroll', requireAuth, (req, res) => {
  const course = db.prepare('SELECT id, is_paid FROM courses WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (course.is_paid) return res.status(402).json({ error: 'Paid course — use checkout' });
  const info = db.prepare(`
    INSERT OR IGNORE INTO course_access (user_id, course_id, source) VALUES (?, ?, 'free')
  `).run(req.user.id, course.id);
  res.json({ enrolled: true, alreadyEnrolled: info.changes === 0 });
});

export default router;
