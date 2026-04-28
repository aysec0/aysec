import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM assessment_machines m WHERE m.assessment_id = a.id) AS machine_count
    FROM assessments a WHERE a.published = 1 ORDER BY a.id
  `).all();
  res.json({ assessments: rows });
});

router.get('/:slug', optionalAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM assessments WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const machines = db.prepare(`
    SELECT id, position, name, ip, role, points, hint
    FROM assessment_machines WHERE assessment_id = ? ORDER BY position, id
  `).all(a.id);
  let attempts = [];
  if (req.user) {
    attempts = db.prepare(`
      SELECT id, started_at, ended_at, points_earned, passed
      FROM assessment_attempts WHERE user_id = ? AND assessment_id = ?
      ORDER BY started_at DESC LIMIT 5
    `).all(req.user.id, a.id);
  }
  res.json({ assessment: a, machines, attempts });
});

router.post('/:slug/start', requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM assessments WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!a) return res.status(404).json({ error: 'Not found' });
  // If user already has an in-progress attempt, return that
  const open = db.prepare(`
    SELECT * FROM assessment_attempts
    WHERE user_id = ? AND assessment_id = ? AND ended_at IS NULL
    ORDER BY started_at DESC LIMIT 1
  `).get(req.user.id, a.id);
  if (open) return res.json({ attempt: open, resumed: true });
  const info = db.prepare(
    'INSERT INTO assessment_attempts (user_id, assessment_id) VALUES (?, ?)'
  ).run(req.user.id, a.id);
  const attempt = db.prepare('SELECT * FROM assessment_attempts WHERE id = ?').get(info.lastInsertRowid);
  res.json({ attempt, resumed: false });
});

router.get('/:slug/attempt/:id', requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM assessments WHERE slug = ?').get(req.params.slug);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const at = db.prepare(`
    SELECT * FROM assessment_attempts
    WHERE id = ? AND user_id = ? AND assessment_id = ?
  `).get(req.params.id, req.user.id, a.id);
  if (!at) return res.status(404).json({ error: 'Attempt not found' });
  const machines = db.prepare(`
    SELECT m.id, m.position, m.name, m.ip, m.role, m.points, m.hint,
      EXISTS(SELECT 1 FROM assessment_machine_solves s WHERE s.attempt_id = ? AND s.machine_id = m.id) AS solved
    FROM assessment_machines m WHERE m.assessment_id = ? ORDER BY position, id
  `).all(at.id, a.id);
  // Compute time remaining
  const elapsed = Math.floor((Date.now() - Date.parse(at.started_at)) / 1000);
  const remaining = a.time_limit_minutes * 60 - elapsed;
  res.json({ assessment: a, attempt: at, machines, remaining_seconds: remaining });
});

router.post('/:slug/attempt/:id/submit', requireAuth, (req, res) => {
  const { machine_id, flag } = req.body || {};
  if (!machine_id || !flag) return res.status(400).json({ error: 'Missing machine_id or flag' });
  const a = db.prepare('SELECT * FROM assessments WHERE slug = ?').get(req.params.slug);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const at = db.prepare(`
    SELECT * FROM assessment_attempts
    WHERE id = ? AND user_id = ? AND assessment_id = ?
  `).get(req.params.id, req.user.id, a.id);
  if (!at) return res.status(404).json({ error: 'Attempt not found' });
  if (at.ended_at) return res.status(400).json({ error: 'Attempt already ended' });
  const elapsed = Math.floor((Date.now() - Date.parse(at.started_at)) / 1000);
  if (elapsed > a.time_limit_minutes * 60) {
    db.prepare('UPDATE assessment_attempts SET ended_at = datetime(\'now\') WHERE id = ?').run(at.id);
    return res.status(400).json({ error: 'Time limit exceeded' });
  }

  const m = db.prepare(
    'SELECT * FROM assessment_machines WHERE id = ? AND assessment_id = ?'
  ).get(machine_id, a.id);
  if (!m) return res.status(404).json({ error: 'Machine not found' });

  const correct = sha256(flag.trim()) === m.flag_hash;
  if (!correct) return res.json({ correct: false });

  const ins = db.prepare(
    'INSERT OR IGNORE INTO assessment_machine_solves (attempt_id, machine_id) VALUES (?, ?)'
  ).run(at.id, m.id);
  if (ins.changes === 1) {
    db.prepare(
      'UPDATE assessment_attempts SET points_earned = points_earned + ? WHERE id = ?'
    ).run(m.points, at.id);
  }
  // Re-fetch to compute pass / done
  const fresh = db.prepare('SELECT * FROM assessment_attempts WHERE id = ?').get(at.id);
  const allMachines = db.prepare('SELECT id FROM assessment_machines WHERE assessment_id = ?').all(a.id);
  const solvedAll = db.prepare(
    'SELECT COUNT(*) AS c FROM assessment_machine_solves WHERE attempt_id = ?'
  ).get(at.id).c;
  let ended = false;
  if (solvedAll === allMachines.length) {
    db.prepare(
      'UPDATE assessment_attempts SET ended_at = datetime(\'now\'), passed = ? WHERE id = ?'
    ).run(fresh.points_earned >= a.passing_points ? 1 : 0, at.id);
    ended = true;
  }
  res.json({ correct: true, points_earned: fresh.points_earned, ended });
});

router.post('/:slug/attempt/:id/finish', requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM assessments WHERE slug = ?').get(req.params.slug);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const at = db.prepare(`
    SELECT * FROM assessment_attempts WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.user.id);
  if (!at) return res.status(404).json({ error: 'Attempt not found' });
  if (at.ended_at) return res.json({ ended: true, attempt: at });
  db.prepare(
    'UPDATE assessment_attempts SET ended_at = datetime(\'now\'), passed = ? WHERE id = ?'
  ).run(at.points_earned >= a.passing_points ? 1 : 0, at.id);
  const fresh = db.prepare('SELECT * FROM assessment_attempts WHERE id = ?').get(at.id);
  res.json({ ended: true, attempt: fresh });
});

export default router;
