import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import { db, migrate } from './db/index.js';
import authRoutes from './routes/auth.js';
import coursesRoutes from './routes/courses.js';
import challengesRoutes from './routes/challenges.js';
import postsRoutes from './routes/posts.js';
import paymentsRoutes, { stripeWebhook } from './routes/payments.js';
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
import dailyRoutes from './routes/daily.js';
import ctfEventsRoutes from './routes/ctf-events.js';
import assessmentsRoutes from './routes/assessments.js';
import proLabsRoutes from './routes/pro-labs.js';
import teamsRoutes from './routes/teams.js';
import adminRoutes from './routes/admin.js';
import forumRoutes from './routes/forum.js';
import vaultRoutes from './routes/vault.js';
import uploadsRoutes from './routes/uploads.js';
import chatRoutes from './routes/chat.js';
import searchRoutes, { rebuildSearchIndex } from './routes/search.js';
import streaksRoutes from './routes/streaks.js';
import duelsRoutes from './routes/duels.js';
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
app.use('/api/daily',          dailyRoutes);
app.use('/api/ctf-events',     ctfEventsRoutes);
app.use('/api/assessments',    assessmentsRoutes);
app.use('/api/pro-labs',       proLabsRoutes);
app.use('/api/teams',          teamsRoutes);
app.use('/api/admin',          adminRoutes);
app.use('/api/forum',          forumRoutes);
app.use('/api/vault',          vaultRoutes);
app.use('/api/uploads',        uploadsRoutes);
app.use('/api/chat',           chatRoutes);
app.use('/api/search',         searchRoutes);
app.use('/api/streaks',        streaksRoutes);
app.use('/api/duels',          duelsRoutes);

// Build the FTS5 index on startup so /api/search has data to query.
// (Adding/editing entities via admin doesn't auto-trigger a rebuild yet —
//  that's a small follow-up; restart picks up changes for now.)
rebuildSearchIndex();

// Public site settings — readable by anyone so landing/footer can populate
app.get('/api/site-settings', (_req, res) => {
  const SITE_DEFAULTS = {
    hero_eyebrow:  'Now teaching: red-team operations',
    hero_title:    'Hack to learn.',
    hero_subtitle: "Don't learn to hack.",
    hero_tagline:  'Hands-on cybersecurity training by Ammar Yasser — courses, CTF challenges, and writeups built from real engagements, not slideware.',
    cta_primary_label: 'Browse courses',
    cta_primary_href:  '/courses',
    cta_secondary_label: '$ ./play_ctf',
    cta_secondary_href:  '/challenges',
    footer_tagline: 'Personal site, CTF platform, and training for people who want to actually understand security — not just collect badges.',
    about_short:   "I'm Ammar — a red-team operator and instructor.",
    social_github:   'https://github.com/aysec0',
    social_twitter:  '',
    social_discord:  '',
    compete_eyebrow:  '// compete',
    compete_title:    'Daily reps, live events, full networks.',
    compete_subtitle: 'A challenge a day, scheduled CTFs, and multi-machine Pro Labs that simulate real enterprise networks.',
    compete_cta_label: 'Today’s challenge →',
    compete_cta_href:  '/daily',
    about_eyebrow: '// whoami',
    about_title:   'Security engineer, educator, perpetual student.',
    about_p1:      'I build training that respects your time. No 30-minute intros, no recycled slide decks, no "look at this scary screenshot" content. Just labs, code, and the actual mental models you need to do the job.',
    about_p2:      'Everything here — courses, challenges, writeups — is open to feedback. If something’s wrong, broken, or could be better, tell me.',
    show_compete:  '1',
    show_about:    '1',
    about_page_title:    'About me.',
    about_page_subtitle: 'Ammar Yasser. Security engineer, educator, AI red-teamer.',
    about_short_eyebrow: '// the short version',
    about_short_title:   'I help people break things — properly.',
    hire_page_title:     'Hire me.',
    hire_page_subtitle:  'Pentests, AI/LLM red-team engagements, training for engineering teams, and one-off advisory work. Direct, small-team, no junior bait-and-switch.',
    community_title:     'Community.',
    community_subtitle:  "A focused forum for cybersecurity — ask questions, share writeups, post finds. No memes-only feed, no drama. Up/downvote what's actually useful.",
    levels_title:        'Levels.',
    levels_subtitle:     '15 themed tiers from n00b to Legend. XP comes from every dimension of the platform — solve challenges, complete lessons, earn certificates, plant first bloods. Each level has its own colour, icon, and identity.',
    blog_title:          'Blog & Writeups',
    blog_subtitle:       'Field notes, CTF writeups, deep dives, and the occasional rant about the state of the industry.',
  };
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({ settings: { ...SITE_DEFAULTS, ...stored } });
});

// SEO endpoints
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

app.get('/robots.txt', (_req, res) => {
  // VAULT V01 — for the curious robot
  res.type('text/plain').send(
`User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml

# you found me. one of seven.
# flag{vault_robots_remember_what_humans_forget}
# (submit it at /vault for credit)
`);
});

// VAULT V04 — undocumented .well-known endpoint
app.get('/.well-known/security.txt', (_req, res) => {
  res.type('text/plain').send(
`Contact: ${SITE_URL}/hire
Acknowledgements: ${SITE_URL}/about
Preferred-Languages: en
Canonical: ${SITE_URL}/.well-known/security.txt
Policy: ${SITE_URL}/terms

# vault hint:
# flag{security_dot_txt_is_a_starting_line}
# (1 of 7 — submit at /vault)
`);
});

app.get('/sitemap.xml', (_req, res) => {
  const urls = [
    '/', '/courses', '/certifications', '/challenges', '/blog',
    '/daily', '/live', '/pro-labs', '/assessments', '/teams',
    '/tools', '/cheatsheets', '/events', '/community', '/about',
    '/hire', '/talks', '/terms', '/privacy', '/refunds',
    '/vault', '/levels', '/search', '/duels',
  ];
  const courses    = db.prepare('SELECT slug, updated_at FROM courses    WHERE published = 1').all();
  const challenges = db.prepare('SELECT slug, updated_at FROM challenges WHERE published = 1').all();
  const posts      = db.prepare('SELECT slug, updated_at FROM posts      WHERE published = 1').all();
  let certs = [], cheatsheets = [], tools = [];
  try { certs       = db.prepare('SELECT slug FROM cert_prep   WHERE published = 1').all(); } catch {}
  try { cheatsheets = db.prepare('SELECT slug FROM cheatsheets WHERE published = 1').all(); } catch {}

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}
${courses.map((c) =>    `  <url><loc>${SITE_URL}/courses/${c.slug}</loc><lastmod>${(c.updated_at || '').slice(0,10)}</lastmod></url>`).join('\n')}
${challenges.map((c) => `  <url><loc>${SITE_URL}/challenges/${c.slug}</loc><lastmod>${(c.updated_at || '').slice(0,10)}</lastmod></url>`).join('\n')}
${posts.map((p) =>      `  <url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${(p.updated_at || '').slice(0,10)}</lastmod></url>`).join('\n')}
${certs.map((c) =>      `  <url><loc>${SITE_URL}/certifications/${c.slug}</loc></url>`).join('\n')}
${cheatsheets.map((c) =>`  <url><loc>${SITE_URL}/cheatsheets/${c.slug}</loc></url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

// ---- OG / Twitter card injection ---------------------------------------
// Static HTML pages get OG meta tags inserted before </head> on first read.
// Per-path defaults below; paths that aren't here fall back to the homepage
// values. Detail routes (/courses/:slug etc.) extend this further below.

const OG_BY_PATH = {
  '/':                { title: "Aysec — Hack to learn. Don't learn to hack.",
                        desc: 'Hands-on cybersecurity training, CTF challenges, and writeups by Ammar Yasser.' },
  '/courses':         { title: 'Courses — aysec',
                        desc: 'Web hacking, AI red-teaming, OSCP prep, bug bounty. Hands-on labs that make the theory stick.' },
  '/challenges':      { title: 'CTF challenges — aysec',
                        desc: 'Cybersecurity challenges across web, crypto, pwn, AI, and forensics. Climb the leaderboard.' },
  '/blog':            { title: 'Blog & writeups — aysec',
                        desc: 'Field notes, CTF writeups, deep dives on cybersecurity.' },
  '/community':       { title: 'Community — aysec',
                        desc: 'A focused forum for cybersecurity. Ask, share writeups, post finds.' },
  '/certifications':  { title: 'Cert prep — aysec',
                        desc: 'OSCP, OSEP, OSWE, CRTO, CRTP, PNPT, Security+, CEH — mapped courses + CTF challenges.' },
  '/vault':           { title: 'The vault — aysec',
                        desc: 'Seven flags hidden across this website itself. View source. Read robots.txt. Decode the JWT.' },
  '/about':           { title: 'About — Ammar Yasser',
                        desc: 'Security engineer, educator, AI red-teamer. Background and credentials.' },
  '/hire':            { title: 'Hire me — aysec',
                        desc: 'Pentests, AI/LLM red team engagements, training for engineering teams.' },
  '/daily':           { title: 'Daily challenge — aysec',
                        desc: 'One rotating challenge per day. Streak rewards consistency.' },
  '/tools':           { title: 'Security toolbox — aysec',
                        desc: '24 in-browser security tools: JWT decoder, hash ID, encoders, regex, CIDR, more.' },
  '/levels':          { title: 'Levels — aysec',
                        desc: '15 themed tiers from n00b to Legend. XP from every dimension of the platform.' },
  '/events':          { title: 'Events calendar — aysec',
                        desc: 'CTF competitions, security conferences, bug-bounty drops — global calendar with .ics export.' },
  '/cheatsheets':     { title: 'Cheatsheets — aysec',
                        desc: 'Quick reference for tools, syntax, and tactics across the cybersec stack.' },
  '/search':          { title: 'Search — aysec',
                        desc: 'Search across courses, lessons, posts, CTF challenges, cheatsheets, and certs.' },
  '/duels':           { title: 'Duels — aysec',
                        desc: '1v1 challenge races. Stake XP, pick a CTF, first correct flag wins.' },
};

function ogBlock(path, override) {
  const d = override || OG_BY_PATH[path] || OG_BY_PATH['/'];
  const url   = SITE_URL + path;
  const image = SITE_URL + '/img/og.svg';
  const safe = (s = '') => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  // PWA + OG/Twitter tags packaged together so every page is shareable
  // AND installable. The manifest link is what triggers Add-to-Home-Screen
  // on iOS / "Install app" on Chrome.
  return `
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/img/favicon.svg" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="aysec" />
    <meta property="og:type" content="${safe(d.type || 'website')}" />
    <meta property="og:site_name" content="aysec" />
    <meta property="og:title" content="${safe(d.title)}" />
    <meta property="og:description" content="${safe(d.desc)}" />
    <meta property="og:image" content="${safe(image)}" />
    <meta property="og:url" content="${safe(url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${safe(image)}" />
    <meta name="twitter:title" content="${safe(d.title)}" />
    <meta name="twitter:description" content="${safe(d.desc)}" />
    <meta name="description" content="${safe(d.desc)}" />`;
}

// Read-and-inject helper. Cached on first read since static HTML doesn't change.
const _htmlCache = new Map();
function readHtmlWithOg(filePath, ogPath, override) {
  const key = filePath + '|' + ogPath + '|' + (override ? JSON.stringify(override) : '');
  if (_htmlCache.has(key)) return _htmlCache.get(key);
  let html;
  try { html = readFileSync(filePath, 'utf8'); }
  catch { return null; }
  if (!html.includes('property="og:title"')) {
    html = html.replace('</head>', ogBlock(ogPath, override) + '\n  </head>');
  }
  _htmlCache.set(key, html);
  return html;
}

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

// Dynamic detail-page routes — single template per type, JS reads slug from
// URL. We also inject entity-specific OG meta when we can (course title,
// post excerpt, etc.) so shared links preview correctly.
const sendDetail = (file, ogResolver) => (req, res) => {
  const filePath = join(__dirname, 'public', file);
  let override;
  if (typeof ogResolver === 'function') {
    try { override = ogResolver(req); } catch {}
  }
  const html = readHtmlWithOg(filePath, req.path, override);
  if (html) return res.type('html').send(html);
  res.sendFile(filePath);
};

const courseOg = (req) => {
  const c = db.prepare('SELECT title, subtitle, description FROM courses WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!c) return null;
  return { title: `${c.title} — aysec`, desc: c.subtitle || (c.description || '').slice(0, 200) };
};
const postOg = (req) => {
  const p = db.prepare('SELECT title, excerpt FROM posts WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!p) return null;
  return { type: 'article', title: `${p.title} — aysec`, desc: p.excerpt || '' };
};
const challengeOg = (req) => {
  const c = db.prepare('SELECT title, category, difficulty, points, description FROM challenges WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!c) return null;
  return { title: `${c.title} — ${c.category}/${c.difficulty} — aysec`, desc: c.description || `${c.points} points · ${c.category} · ${c.difficulty}` };
};
const certOg = (req) => {
  const c = db.prepare('SELECT cert_name, tagline, description FROM cert_prep WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!c) return null;
  return { title: `${c.cert_name} prep — aysec`, desc: c.tagline || (c.description || '').slice(0, 200) };
};
const toolOg = (req) => ({ title: `${req.params.slug} — aysec tools`, desc: `Free in-browser ${req.params.slug} tool from the aysec security toolbox.` });

app.get('/courses/:slug',    sendDetail('course-detail.html', courseOg));
app.get('/challenges/:slug', sendDetail('challenge-detail.html', challengeOg));
app.get('/blog/:slug',       sendDetail('post-detail.html', postOg));
app.get('/cert/:code',       sendDetail('certificate.html'));
app.get('/tracks/:slug',          sendDetail('track-detail.html'));
app.get('/tools/:slug',           sendDetail('tool-detail.html', toolOg));
app.get('/live/:slug',            sendDetail('live-detail.html'));
app.get('/assessments/:slug',     sendDetail('assessment-detail.html'));
app.get('/assessments/:slug/take/:attemptId', sendDetail('assessment-detail.html'));
app.get('/pro-labs/:slug',        sendDetail('pro-lab-detail.html'));
app.get('/lab-term/:slug',        sendDetail('lab-term.html'));
app.get('/teams/:slug',           sendDetail('team-detail.html'));
app.get('/teams/join/:token',     sendDetail('team-join.html'));
app.get('/community/post/:id',    sendDetail('community-post.html'));
app.get('/community/submit',      sendDetail('community-submit.html'));
app.get('/u/:username',           sendDetail('profile.html'));
app.get('/u/:username/dna',       sendDetail('dna.html'));
app.get('/certifications/:slug',  sendDetail('cert-detail.html', certOg));
app.get('/cheatsheets/:slug',     sendDetail('cheatsheet-detail.html'));
app.get('/events/:slug',          sendDetail('event-detail.html'));
app.get('/duels/:id',             sendDetail('duel-detail.html'));

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

// Static HTML pages with OG injection. Runs BEFORE express.static so we can
// rewrite the head; non-HTML and missing files fall through.
app.get(/^[^.]*$/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/uploads/')) return next();
  // Map "/" → public/index.html, "/about" → public/about.html, etc.
  const stripped = req.path === '/' ? 'index' : req.path.replace(/^\//, '').replace(/\/$/, '');
  if (stripped.includes('..')) return next();   // path-traversal guard
  const filePath = join(__dirname, 'public', stripped + '.html');
  if (!existsSync(filePath)) return next();
  const html = readHtmlWithOg(filePath, req.path);
  if (html) res.type('html').send(html);
  else next();
});

app.use(express.static(join(__dirname, 'public')));

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
