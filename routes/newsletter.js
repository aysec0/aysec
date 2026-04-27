import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/subscribe', (req, res) => {
  const { email, source } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanSource = (source && typeof source === 'string') ? source.slice(0, 32) : null;
  try {
    db.prepare(`
      INSERT INTO newsletter_subscribers (email, source)
      VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET unsubscribed_at = NULL
    `).run(cleanEmail, cleanSource);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not subscribe.' });
  }
});

router.get('/stats', (_req, res) => {
  const total = db.prepare(
    'SELECT COUNT(*) AS c FROM newsletter_subscribers WHERE unsubscribed_at IS NULL'
  ).get().c;
  res.json({ subscribers: total });
});

export default router;
