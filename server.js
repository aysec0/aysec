import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, migrate } from './db/index.js';
import authRoutes from './routes/auth.js';
import coursesRoutes from './routes/courses.js';
import challengesRoutes from './routes/challenges.js';
import postsRoutes from './routes/posts.js';
import paymentsRoutes, { stripeWebhook } from './routes/payments.js';
import newsletterRoutes from './routes/newsletter.js';
import socialRoutes from './routes/social.js';
import certificatesRoutes from './routes/certificates.js';
import tracksRoutes from './routes/tracks.js';
import usersRoutes from './routes/users.js';
import certificationsRoutes from './routes/certifications.js';
import cheatsheetsRoutes from './routes/cheatsheets.js';
import eventsRoutes from './routes/events.js';
import levelsRoutes from './routes/levels.js';
import notificationsRoutes from './routes/notifications.js';
import bookmarksRoutes from './routes/bookmarks.js';
import communityRoutes from './routes/community.js';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

migrate();

// Stripe webhook needs the raw body — must be mounted BEFORE express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie-secret'));

app.use('/api/auth',         authRoutes);
app.use('/api/courses',      coursesRoutes);
app.use('/api/challenges',   challengesRoutes);
app.use('/api/posts',        postsRoutes);
app.use('/api/payments',     paymentsRoutes);
app.use('/api/newsletter',   newsletterRoutes);
app.use('/api/social',       socialRoutes);
app.use('/api/certificates', certificatesRoutes);
app.use('/api/tracks',         tracksRoutes);
app.use('/api/users',          usersRoutes);
app.use('/api/certifications', certificationsRoutes);
app.use('/api/cheatsheets',    cheatsheetsRoutes);
app.use('/api/events',         eventsRoutes);
app.use('/api/levels',         levelsRoutes);
app.use('/api/notifications',  notificationsRoutes);
app.use('/api/bookmarks',      bookmarksRoutes);
app.use('/api/community',      communityRoutes);

// SEO endpoints
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
`User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

app.get('/sitemap.xml', (_req, res) => {
  const urls = [
    '/', '/courses', '/challenges', '/blog', '/about', '/pricing',
    '/hire', '/talks', '/newsletter', '/terms', '/privacy', '/refunds',
  ];
  const courses    = db.prepare('SELECT slug, updated_at FROM courses    WHERE published = 1').all();
  const challenges = db.prepare('SELECT slug, updated_at FROM challenges WHERE published = 1').all();
  const posts      = db.prepare('SELECT slug, updated_at FROM posts      WHERE published = 1').all();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}
${courses.map((c) =>    `  <url><loc>${SITE_URL}/courses/${c.slug}</loc><lastmod>${(c.updated_at || '').slice(0,10)}</lastmod></url>`).join('\n')}
${challenges.map((c) => `  <url><loc>${SITE_URL}/challenges/${c.slug}</loc><lastmod>${(c.updated_at || '').slice(0,10)}</lastmod></url>`).join('\n')}
${posts.map((p) =>      `  <url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${(p.updated_at || '').slice(0,10)}</lastmod></url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

app.get('/rss.xml', (_req, res) => {
  const posts = db.prepare(`
    SELECT slug, title, excerpt, content_md, published_at, kind, tags
    FROM posts WHERE published = 1 ORDER BY published_at DESC LIMIT 50
  `).all();
  const escapeXml = (s = '') => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const items = posts.map((p) => {
    const link = `${SITE_URL}/blog/${p.slug}`;
    const html = p.content_md ? marked.parse(p.content_md) : '';
    const pubDate = new Date((p.published_at || '').replace(' ', 'T') + 'Z').toUTCString();
    const cats = (p.tags || '').split(',').filter(Boolean)
      .map((t) => `      <category>${escapeXml(t.trim())}</category>`).join('\n');
    return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(p.excerpt || '')}</description>
      <content:encoded><![CDATA[${html}]]></content:encoded>
${cats}
    </item>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>aysec — blog &amp; writeups</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Posts, notes, and CTF writeups from aysec.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;
  res.type('application/rss+xml').send(xml);
});

// Dynamic detail-page routes — single template per type, JS reads slug from URL.
const sendDetail = (file) => (_req, res) => res.sendFile(join(__dirname, 'public', file));
app.get('/courses/:slug',    sendDetail('course-detail.html'));
app.get('/challenges/:slug', sendDetail('challenge-detail.html'));
app.get('/blog/:slug',       sendDetail('post-detail.html'));
app.get('/cert/:code',       sendDetail('certificate.html'));
app.get('/tracks/:slug',          sendDetail('track-detail.html'));
app.get('/tools/:slug',           sendDetail('tool-detail.html'));
app.get('/u/:username',           sendDetail('profile.html'));
app.get('/u/:username/dna',       sendDetail('dna.html'));
app.get('/certifications/:slug',  sendDetail('cert-detail.html'));
app.get('/cheatsheets/:slug',     sendDetail('cheatsheet-detail.html'));
app.get('/events/:slug',          sendDetail('event-detail.html'));

// Permanent redirects for routes that have been merged elsewhere — covers
// the bare path, the trailing-slash variant, and the legacy .html variant
// so old bookmarks all land in the right place.
app.get(['/pricing', '/pricing/', '/pricing.html'], (_req, res) => res.redirect(301, '/courses'));
app.get(['/lab',     '/lab/',     '/lab.html'],     (_req, res) => res.redirect(301, '/tools'));
app.get(['/tracks',  '/tracks/',  '/tracks.html'],  (_req, res) => res.redirect(301, '/courses#paths'));

// Strip trailing slashes — keeps bookmarked/shared URLs like /courses/ from
// 404'ing because express.static can't find /courses/.html. Skip the root
// itself and any path that genuinely ends in a file (has a dot in the last
// segment), so e.g. /css/styles.css/ would not redirect.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path === '/' || !req.path.endsWith('/')) return next();
  if (/\.[^/]+$/.test(req.path)) return next();
  const q = req.url.slice(req.path.length);
  res.redirect(301, req.path.slice(0, -1) + q);
});

app.use(express.static(join(__dirname, 'public'), { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(join(__dirname, 'public', '404.html'), (err) => {
    if (err) res.status(404).type('text').send('Not found');
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`→ http://localhost:${port}`);
});
