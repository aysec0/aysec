import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function newCode() {
  // 12-char base36 — unique enough, friendly URLs.
  return randomBytes(9).toString('base64url').replace(/[_-]/g, '').slice(0, 12).toLowerCase();
}

/**
 * Issue a cert if the user has completed every lesson in a course.
 * Returns the cert row (existing or new) or null if not yet completed.
 */
export function maybeIssueCertificate(userId, courseId) {
  const total    = db.prepare('SELECT COUNT(*) AS c FROM lessons WHERE course_id = ?').get(courseId).c;
  if (!total) return null;
  const done = db.prepare(`
    SELECT COUNT(*) AS c FROM lesson_progress lp
    JOIN lessons l ON l.id = lp.lesson_id
    WHERE lp.user_id = ? AND l.course_id = ?
  `).get(userId, courseId).c;
  if (done < total) return null;

  const existing = db.prepare(
    'SELECT * FROM certificates WHERE user_id = ? AND course_id = ?'
  ).get(userId, courseId);
  if (existing) return existing;

  // Create with retry on the (extremely unlikely) collision.
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      const info = db.prepare(`
        INSERT INTO certificates (code, user_id, course_id) VALUES (?, ?, ?)
      `).run(code, userId, courseId);
      return db.prepare('SELECT * FROM certificates WHERE id = ?').get(info.lastInsertRowid);
    } catch {}
  }
  return null;
}

router.get('/:code', (req, res) => {
  const cert = db.prepare(`
    SELECT c.code, c.issued_at,
           u.username, u.display_name,
           co.slug AS course_slug, co.title AS course_title, co.subtitle AS course_subtitle, co.difficulty,
           (SELECT COUNT(*) FROM lessons WHERE course_id = co.id) AS lesson_count
    FROM certificates c
    JOIN users   u  ON u.id  = c.user_id
    JOIN courses co ON co.id = c.course_id
    WHERE c.code = ?
  `).get(req.params.code);
  if (!cert) return res.status(404).json({ error: 'Certificate not found' });
  res.json({ certificate: cert });
});

router.get('/me/list', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.code, c.issued_at, co.slug AS course_slug, co.title AS course_title
    FROM certificates c
    JOIN courses co ON co.id = c.course_id
    WHERE c.user_id = ?
    ORDER BY c.issued_at DESC
  `).all(req.user.id);
  res.json({ certificates: rows });
});

export default router;
