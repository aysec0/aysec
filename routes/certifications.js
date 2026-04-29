import { Router } from 'express';
import { marked } from 'marked';
import { db } from '../db/index.js';
import { optionalAuth } from '../middleware/auth.js';

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

router.get('/:slug', optionalAuth, (req, res) => {
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

  // Pull the week-by-week syllabus, plus per-user completion if signed in.
  const modules = db.prepare(`
    SELECT id, week_num, title, goal, topics_md, daily_tasks_md, resources_md, lab_targets_md
    FROM cert_prep_modules WHERE cert_id = ?
    ORDER BY week_num ASC, position ASC
  `).all(cert.id);
  let completedSet = new Set();
  if (req.user) {
    completedSet = new Set(
      db.prepare(
        'SELECT module_id FROM cert_prep_module_progress WHERE user_id = ?'
      ).all(req.user.id).map((r) => r.module_id)
    );
  }
  const modulesOut = modules.map((m) => ({
    id: m.id,
    week_num: m.week_num,
    title: m.title,
    goal: m.goal,
    topics_html:      md(m.topics_md),
    daily_tasks_html: md(m.daily_tasks_md),
    resources_html:   md(m.resources_md),
    lab_targets_html: md(m.lab_targets_md),
    completed:        completedSet.has(m.id),
  }));

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
    modules: modulesOut,
    summary: {
      total_lessons: courses.reduce((s, c) => s + c.lesson_count, 0),
      total_minutes: courses.reduce((s, c) => s + c.total_minutes, 0),
      paid_courses_total_cents: courses.reduce((s, c) => s + (c.is_paid ? c.price_cents : 0), 0),
      total_modules: modulesOut.length,
      completed_modules: modulesOut.filter((m) => m.completed).length,
    },
  });
});

// Toggle a module's completed state for the signed-in user.
// Body: { completed: true|false } — if true, upsert; if false, delete the row.
router.post('/modules/:moduleId/toggle', optionalAuth, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'sign in to track progress' });
  const moduleId = Number(req.params.moduleId);
  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return res.status(400).json({ error: 'bad module id' });
  }
  const completed = req.body?.completed === true;
  if (completed) {
    db.prepare(
      `INSERT OR IGNORE INTO cert_prep_module_progress (user_id, module_id) VALUES (?, ?)`
    ).run(req.user.id, moduleId);
  } else {
    db.prepare(
      `DELETE FROM cert_prep_module_progress WHERE user_id = ? AND module_id = ?`
    ).run(req.user.id, moduleId);
  }
  // Recompute progress for this module's cert
  const row = db.prepare(`
    SELECT m.cert_id,
      (SELECT COUNT(*) FROM cert_prep_modules WHERE cert_id = m.cert_id) AS total,
      (SELECT COUNT(*) FROM cert_prep_module_progress p
       JOIN cert_prep_modules mm ON mm.id = p.module_id
       WHERE mm.cert_id = m.cert_id AND p.user_id = ?) AS done
    FROM cert_prep_modules m WHERE m.id = ?
  `).get(req.user.id, moduleId);
  res.json({ ok: true, completed, progress: { done: row?.done ?? 0, total: row?.total ?? 0 } });
});

export default router;
