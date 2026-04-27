import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

const SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

export function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('token');
}

function loadUser(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare(
      'SELECT id, username, email, display_name, avatar_url, bio, role FROM users WHERE id = ?'
    ).get(payload.uid);
    return user || null;
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = loadUser(req);
  next();
}

export function requireAuth(req, res, next) {
  const user = loadUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  const user = loadUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  req.user = user;
  next();
}
