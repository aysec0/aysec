/* /api/keys — manage your own personal API keys. Used by /settings.
   Tokens are returned in clear ONLY at the moment of creation; everything
   afterwards shows the prefix only. */
import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function rowDto(r) {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes.split(','),
    last_used_at: r.last_used_at,
    created_at: r.created_at,
    revoked_at: r.revoked_at,
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, prefix, scopes, last_used_at, created_at, revoked_at
    FROM api_keys WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.id).map(rowDto);
  res.json({ keys: rows });
});

router.post('/', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Name your key.' });

  // Cap to 10 active keys per user — plenty for a personal site
  const active = db.prepare(
    'SELECT COUNT(*) AS c FROM api_keys WHERE user_id = ? AND revoked_at IS NULL'
  ).get(req.user.id).c;
  if (active >= 10) return res.status(429).json({ error: 'You already have 10 active keys. Revoke one first.' });

  // Generate `aysec_pk_<32 hex chars>`. Hash is what we store; prefix is
  // a 8-char display copy so users can pick a key out of a list later.
  const raw = randomBytes(20).toString('hex');
  const token = `aysec_pk_${raw}`;
  const prefix = raw.slice(0, 8);
  const hash = sha256(token);

  const info = db.prepare(`
    INSERT INTO api_keys (user_id, prefix, hash, name, scopes)
    VALUES (?, ?, ?, ?, 'read')
  `).run(req.user.id, prefix, hash, name);

  res.json({
    id: info.lastInsertRowid, name, prefix, token,
    note: 'Copy this token now — we will never show it again.',
  });
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id, user_id FROM api_keys WHERE id = ?').get(req.params.id);
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'Not found.' });
  db.prepare(`UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?`).run(row.id);
  res.json({ ok: true });
});

export default router;
