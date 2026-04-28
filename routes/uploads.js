/* /api/uploads — image uploads for forum posts/comments.
 *
 * - Auth required (any logged-in user can upload).
 * - Stores under public/uploads/<yyyy-mm>/<random>.<ext>.
 * - Allowed: png/jpg/jpeg/gif/webp. Max 4 MB.
 * - Returns { url } pointing at the public path so the client can paste
 *   it as Markdown image syntax.
 */
import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = join(__dirname, '..', 'public', 'uploads');
mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const d = new Date();
    const sub = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const dir = join(UPLOAD_ROOT, sub);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = (extname(file.originalname || '') || '').toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('Unsupported image type'));
    cb(null, `${randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = (extname(file.originalname || '') || '').toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('Unsupported image type'));
    cb(null, true);
  },
});

const router = Router();

router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const sub = req.file.destination.split('/uploads/').pop();
    const url = `/uploads/${sub}/${req.file.filename}`;
    res.json({ url, name: req.file.originalname, size: req.file.size });
  });
});

export default router;
