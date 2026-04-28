import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const PLANS = {
  'team-monthly': { seats: 5, label: 'Team — monthly', price: 199, currency: 'USD', interval: 'month' },
  'team-annual':  { seats: 5, label: 'Team — annual',  price: 1990, currency: 'USD', interval: 'year' },
};

router.get('/plans', (_req, res) => res.json({ plans: PLANS }));

router.get('/me', requireAuth, (req, res) => {
  const teams = db.prepare(`
    SELECT t.*, tm.role,
      (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
    FROM team_members tm JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ? ORDER BY t.created_at DESC
  `).all(req.user.id);
  res.json({ teams });
});

router.post('/', requireAuth, (req, res) => {
  const { name, plan } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing name' });
  const planKey = plan in PLANS ? plan : 'team-monthly';
  let slug = slugify(name);
  if (!slug) slug = 'team-' + randomBytes(3).toString('hex');
  // Ensure unique slug
  let suffix = 0;
  while (db.prepare('SELECT 1 FROM teams WHERE slug = ?').get(suffix === 0 ? slug : `${slug}-${suffix}`)) suffix++;
  if (suffix > 0) slug = `${slug}-${suffix}`;
  const seats = PLANS[planKey].seats;
  const info = db.prepare(`
    INSERT INTO teams (slug, name, owner_id, seats, plan) VALUES (?, ?, ?, ?, ?)
  `).run(slug, name.trim(), req.user.id, seats, planKey);
  db.prepare(
    'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)'
  ).run(info.lastInsertRowid, req.user.id, 'owner');
  res.json({ slug });
});

router.get('/:slug', requireAuth, (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE slug = ?').get(req.params.slug);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const myMembership = db.prepare(
    'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
  ).get(team.id, req.user.id);
  if (!myMembership) return res.status(403).json({ error: 'Not a member' });
  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, tm.role, tm.joined_at,
      (SELECT COUNT(*) FROM solves s WHERE s.user_id = u.id) AS solves
    FROM team_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ? ORDER BY tm.joined_at ASC
  `).all(team.id);
  const invites = myMembership.role === 'owner' || myMembership.role === 'admin'
    ? db.prepare(
        'SELECT id, email, created_at, accepted_at FROM team_invites WHERE team_id = ? AND accepted_at IS NULL ORDER BY created_at DESC'
      ).all(team.id)
    : [];
  res.json({ team, my_role: myMembership.role, members, invites, plan: PLANS[team.plan] });
});

router.post('/:slug/invites', requireAuth, (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });
  const team = db.prepare('SELECT * FROM teams WHERE slug = ?').get(req.params.slug);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const my = db.prepare(
    'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
  ).get(team.id, req.user.id);
  if (!my || (my.role !== 'owner' && my.role !== 'admin')) return res.status(403).json({ error: 'Forbidden' });
  const memberCount = db.prepare(
    'SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?'
  ).get(team.id).c;
  if (memberCount >= team.seats) return res.status(400).json({ error: `All ${team.seats} seats are filled` });
  const token = randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO team_invites (team_id, email, token, invited_by) VALUES (?, ?, ?, ?)
  `).run(team.id, email.trim().toLowerCase(), token, req.user.id);
  // In a real app we'd email this; for now return the join link.
  res.json({ token, joinUrl: `/teams/join/${token}` });
});

router.post('/invites/accept', requireAuth, (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const inv = db.prepare(
    'SELECT * FROM team_invites WHERE token = ? AND accepted_at IS NULL'
  ).get(token);
  if (!inv) return res.status(404).json({ error: 'Invite not found or already used' });
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(inv.team_id);
  if (!team) return res.status(404).json({ error: 'Team gone' });
  const memberCount = db.prepare(
    'SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?'
  ).get(team.id).c;
  if (memberCount >= team.seats) return res.status(400).json({ error: 'Team is full' });
  db.prepare(
    'INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)'
  ).run(team.id, req.user.id, 'member');
  db.prepare(
    'UPDATE team_invites SET accepted_at = datetime(\'now\') WHERE id = ?'
  ).run(inv.id);
  res.json({ slug: team.slug });
});

router.delete('/:slug/members/:userId', requireAuth, (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE slug = ?').get(req.params.slug);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const my = db.prepare(
    'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
  ).get(team.id, req.user.id);
  if (!my || my.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const targetId = Number(req.params.userId);
  if (targetId === team.owner_id) return res.status(400).json({ error: 'Cannot remove the owner' });
  db.prepare(
    'DELETE FROM team_members WHERE team_id = ? AND user_id = ?'
  ).run(team.id, targetId);
  res.json({ removed: true });
});

export default router;
