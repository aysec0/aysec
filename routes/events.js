import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const { kind, region, when } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const where = ['published = 1'];
  const args  = [];
  if (kind && kind !== 'all') {
    where.push('kind = ?');
    args.push(kind);
  }
  if (region && region !== 'all') {
    where.push('region = ?');
    args.push(region);
  }
  if (when === 'upcoming') {
    where.push('(end_date IS NULL OR end_date >= ?)');
    args.push(today);
  } else if (when === 'past') {
    where.push('end_date IS NOT NULL AND end_date < ?');
    args.push(today);
  }
  const sql = `
    SELECT id, slug, name, kind, format, start_date, end_date, registration_deadline,
           url, location, region, prize_pool, difficulty, description, organizer
    FROM events
    WHERE ${where.join(' AND ')}
    ORDER BY start_date ASC
  `;
  const events = db.prepare(sql).all(...args);
  res.json({ events, today });
});

// Simple ICS export — must come BEFORE /:slug or it's shadowed.
router.get('/:slug.ics', (req, res) => {
  const ev = db.prepare(
    'SELECT * FROM events WHERE slug = ? AND published = 1'
  ).get(req.params.slug);
  if (!ev) return res.status(404).type('text').send('Not found');
  const fmt = (d) => (d || '').replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//aysec//events//EN',
    'BEGIN:VEVENT',
    `UID:${ev.slug}@aysec.me`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${fmt(ev.start_date)}`,
    `DTEND;VALUE=DATE:${fmt(ev.end_date || ev.start_date)}`,
    `SUMMARY:${(ev.name || '').replace(/[\r\n]+/g, ' ')}`,
    `DESCRIPTION:${(ev.description || '').replace(/[\r\n]+/g, ' ')}`,
    `LOCATION:${(ev.location || '').replace(/[\r\n]+/g, ' ')}`,
    ev.url ? `URL:${ev.url}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  res.type('text/calendar').send(ics);
});

router.get('/:slug', (req, res) => {
  const ev = db.prepare(
    'SELECT * FROM events WHERE slug = ? AND published = 1'
  ).get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json({ event: ev });
});

export default router;
