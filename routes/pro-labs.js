import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { emit as notify } from './notifications.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM pro_lab_machines m WHERE m.lab_id = l.id) AS machine_count,
      (SELECT COUNT(DISTINCT user_id) FROM pro_lab_solves s WHERE s.lab_id = l.id) AS players
    FROM pro_labs l WHERE l.published = 1 ORDER BY l.id
  `).all();
  res.json({ labs: rows });
});

router.get('/:slug', optionalAuth, (req, res) => {
  const lab = db.prepare('SELECT * FROM pro_labs WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!lab) return res.status(404).json({ error: 'Not found' });
  const machines = db.prepare(`
    SELECT id, position, name, ip, role, user_points, root_points, hint
    FROM pro_lab_machines WHERE lab_id = ? ORDER BY position, id
  `).all(lab.id);
  let solved = [];
  if (req.user) {
    solved = db.prepare(`
      SELECT machine_id, flag_kind FROM pro_lab_solves WHERE user_id = ? AND lab_id = ?
    `).all(req.user.id, lab.id);
  }
  // Top players for this lab
  const board = db.prepare(`
    SELECT u.username, u.display_name,
      SUM(CASE s.flag_kind WHEN 'user' THEN m.user_points WHEN 'root' THEN m.root_points END) AS score,
      COUNT(*) AS flags,
      MAX(s.solved_at) AS last_solve
    FROM pro_lab_solves s
    JOIN pro_lab_machines m ON m.id = s.machine_id
    JOIN users u ON u.id = s.user_id
    WHERE s.lab_id = ?
    GROUP BY s.user_id
    ORDER BY score DESC, last_solve ASC
    LIMIT 20
  `).all(lab.id);
  res.json({ lab, machines, solved, board });
});

router.post('/:slug/submit', requireAuth, (req, res) => {
  const { machine_id, flag_kind, flag } = req.body || {};
  if (!machine_id || !flag_kind || !flag) return res.status(400).json({ error: 'Missing machine_id, flag_kind, or flag' });
  if (!['user','root'].includes(flag_kind)) return res.status(400).json({ error: 'flag_kind must be user|root' });

  const lab = db.prepare('SELECT id FROM pro_labs WHERE slug = ?').get(req.params.slug);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });
  const m = db.prepare('SELECT * FROM pro_lab_machines WHERE id = ? AND lab_id = ?').get(machine_id, lab.id);
  if (!m) return res.status(404).json({ error: 'Machine not in this lab' });

  const target = flag_kind === 'user' ? m.user_flag_hash : m.root_flag_hash;
  if (!target) return res.status(400).json({ error: 'No ' + flag_kind + ' flag configured' });
  const correct = sha256(flag.trim()) === target;
  if (!correct) return res.json({ correct: false });

  const ins = db.prepare(
    'INSERT OR IGNORE INTO pro_lab_solves (user_id, lab_id, machine_id, flag_kind) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, lab.id, m.id, flag_kind);
  if (ins.changes === 1) {
    const labMeta = db.prepare('SELECT title FROM pro_labs WHERE id = ?').get(lab.id);
    notify({
      userId: req.user.id, kind: 'first_blood',
      title: `${m.name} ${flag_kind} flag captured`,
      body: `${labMeta.title} — ${flag_kind === 'root' ? 'system pwned' : 'foothold gained'}.`,
      link: `/pro-labs/${req.params.slug}`, icon: 'medal',
    });
  }
  res.json({ correct: true, points: flag_kind === 'user' ? m.user_points : m.root_points });
});

export default router;
