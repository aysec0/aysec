/* Validates Authorization: Bearer aysec_pk_<...> against api_keys.
   Treats the request as an authenticated user but with read-only scope. */
import { createHash } from 'node:crypto';
import { db } from '../db/index.js';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function requireApiKey(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token. Get one at /settings#api-keys.' });
  }
  const token = auth.slice('Bearer '.length).trim();
  if (!token.startsWith('aysec_pk_')) {
    return res.status(401).json({ error: 'Invalid token format.' });
  }
  const row = db.prepare(`
    SELECT k.id, k.user_id, k.scopes, k.revoked_at,
           u.username, u.display_name, u.avatar_url, u.role
    FROM api_keys k JOIN users u ON u.id = k.user_id
    WHERE k.hash = ?
  `).get(sha256(token));
  if (!row || row.revoked_at) {
    return res.status(401).json({ error: 'Invalid or revoked token.' });
  }
  // last_used_at — best-effort, never blocks the request
  try {
    db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
  } catch {}
  req.apiUser = {
    id: row.user_id, username: row.username, display_name: row.display_name,
    avatar_url: row.avatar_url, role: row.role, scopes: row.scopes.split(','),
  };
  next();
}
