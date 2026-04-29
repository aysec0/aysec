import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_URL || join(__dirname, '..', 'data', 'app.db');

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  // Idempotent column additions for tables that already exist.
  // SQLite doesn't have ADD COLUMN IF NOT EXISTS, so we just try and ignore.
  const tryAdd = (sql) => { try { db.exec(sql); } catch {} };
  // Profile customization fields (banner + social links)
  tryAdd(`ALTER TABLE users ADD COLUMN banner_url       TEXT`);
  tryAdd(`ALTER TABLE users ADD COLUMN social_github    TEXT`);
  tryAdd(`ALTER TABLE users ADD COLUMN social_twitter   TEXT`);
  tryAdd(`ALTER TABLE users ADD COLUMN social_linkedin  TEXT`);
  tryAdd(`ALTER TABLE users ADD COLUMN social_website   TEXT`);

  // Track which forum_post each migrated blog post became, so /blog/:slug
  // can 301 to the corresponding /community/post/:id without a second lookup.
  tryAdd(`ALTER TABLE posts ADD COLUMN migrated_to_forum_id INTEGER`);

  // Duels v2: format-based matches (chess.com-style). The legacy `stake`
  // column stays for backward compat but is now optional.
  tryAdd(`ALTER TABLE duels ADD COLUMN format TEXT`);
  // Record the ELO swing applied at the moment a duel finishes so we can
  // display it on detail pages without recomputing it from current ratings.
  tryAdd(`ALTER TABLE duels ADD COLUMN winner_rating_change INTEGER`);
  tryAdd(`ALTER TABLE duels ADD COLUMN loser_rating_change INTEGER`);

  // Duels v3: ELO bookkeeping per (user, format).
  tryAdd(`ALTER TABLE duel_ratings ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`);
  tryAdd(`ALTER TABLE duel_ratings ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0`);
  tryAdd(`ALTER TABLE duel_ratings ADD COLUMN peak_rating INTEGER NOT NULL DEFAULT 1000`);
  // Glicko-2 RD (rating deviation). Default 350 = max uncertainty for new players.
  tryAdd(`ALTER TABLE duel_ratings ADD COLUMN rd REAL NOT NULL DEFAULT 350`);
  // True until the player has finished their first 10 matches in this format.
  tryAdd(`ALTER TABLE duel_ratings ADD COLUMN provisional INTEGER NOT NULL DEFAULT 1`);

  // Real CTF integration: challenges can come from external sources
  // (picoCTF, OverTheWire, cryptohack, etc.) — store the source label,
  // external URL, and a pack identifier so the arena page can deep-link.
  tryAdd(`ALTER TABLE challenges ADD COLUMN source TEXT NOT NULL DEFAULT 'aysec'`);
  tryAdd(`ALTER TABLE challenges ADD COLUMN external_url TEXT`);
  tryAdd(`ALTER TABLE challenges ADD COLUMN source_pack TEXT`);

  // Forum v2 — three differentiators on top of the Reddit-style base:
  //  - live_until: 60-min window after a post is created during which it
  //    pins to the top of the feed and replies stream in real-time.
  //  - claimed_challenge_id: writeup posts can claim a specific CTF
  //    challenge they're explaining; a corresponding solves row makes
  //    the writeup "verified" automatically.
  //  - daily_winner_at: post earned the daily category-trophy on this date.
  tryAdd(`ALTER TABLE forum_posts ADD COLUMN live_until TEXT`);
  tryAdd(`ALTER TABLE forum_posts ADD COLUMN claimed_challenge_id INTEGER`);
  tryAdd(`ALTER TABLE forum_posts ADD COLUMN daily_winner_at TEXT`);
  // Skill-weighted votes: cache the weight at the moment the vote was
  // cast so the post score is a pure SUM(weight) — no recompute on every
  // page load. Default 1 for the legacy votes already in the table.
  tryAdd(`ALTER TABLE forum_post_votes ADD COLUMN weight REAL NOT NULL DEFAULT 1.0`);
  tryAdd(`ALTER TABLE forum_comment_votes ADD COLUMN weight REAL NOT NULL DEFAULT 1.0`);

  // Idempotent migration: blog posts -> community/forum posts under a
  // dedicated "Writeups & blog" category. Runs on every startup but only
  // touches posts whose migrated_to_forum_id is NULL.
  migrateBlogToForum();

  // Seed default chat rooms (idempotent — only inserts new slugs).
  seedDefaultChatRooms();
}

function seedDefaultChatRooms() {
  const defaults = [
    { slug: 'general',    name: 'general',     icon: '💬', color: '#39ff7a', position: 0,  description: "the lobby. say hi, tell us what you're working on." },
    { slug: 'web',        name: 'web',         icon: '🌐', color: '#7aa2f7', position: 1,  description: 'web hacking, bug bounty, OWASP Top 10 sparring.' },
    { slug: 'crypto',     name: 'crypto',      icon: '🔐', color: '#bb88ff', position: 2,  description: 'cryptography & cryptanalysis. bring the math.' },
    { slug: 'pwn',        name: 'pwn',         icon: '💥', color: '#ffb74d', position: 3,  description: 'binary exploitation, RE, low-level chaos.' },
    { slug: 'ai',         name: 'ai-security', icon: '🤖', color: '#88e8a3', position: 4,  description: 'prompt injection, LLM red-team, model theft.' },
    { slug: 'forensics',  name: 'forensics',   icon: '🔍', color: '#f25555', position: 5,  description: 'memory dumps, packet caps, file carving.' },
    { slug: 'help',       name: 'help',        icon: '❓', color: '#5b9cff', position: 6,  description: "stuck on a challenge? ask here. don't ask to ask, just ask." },
    { slug: 'showcase',   name: 'showcase',    icon: '🏆', color: '#f0c060', position: 7,  description: 'tools, scripts, finds, writeups, trophies.' },
    { slug: 'off-topic',  name: 'off-topic',   icon: '🎉', color: '#a8b1c2', position: 8,  description: 'memes, music, dogs, chess. anything but ai-slop.' },
  ];
  const ins = db.prepare(`
    INSERT INTO chat_rooms (slug, name, description, icon, color, position)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO NOTHING
  `);
  for (const r of defaults) ins.run(r.slug, r.name, r.description, r.icon, r.color, r.position);
}

/* Mirror the legacy `posts` rows into `forum_posts` so the community is
   the single home for long-form writing. Idempotent — re-running is a no-op
   for any post that's already been migrated. */
function migrateBlogToForum() {
  // Find or create the writeups category. Position 0 puts it at the top.
  let cat = db.prepare(`SELECT id FROM forum_categories WHERE slug = 'writeups'`).get();
  if (!cat) {
    db.prepare(`
      INSERT INTO forum_categories (slug, name, description, color, position)
      VALUES (?, ?, ?, ?, ?)
    `).run('writeups', 'Writeups & blog', 'Long-form writeups, field notes, and CTF post-mortems.', '#7aa2f7', 0);
    cat = db.prepare(`SELECT id FROM forum_categories WHERE slug = 'writeups'`).get();
  }

  // Pick an owner: prefer the original post-author table-less posts ascribed
  // to admin (id=1), but fall back to any admin if id=1 is gone.
  let owner = db.prepare(`SELECT id FROM users WHERE id = 1`).get()
           || db.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get();
  if (!owner) return; // Nothing to attribute to — skip until an admin exists.

  const pending = db.prepare(`
    SELECT id, slug, title, content_md, excerpt, published, published_at, created_at, updated_at
    FROM posts
    WHERE migrated_to_forum_id IS NULL AND published = 1
  `).all();

  if (!pending.length) return;

  const insertForum = db.prepare(`
    INSERT INTO forum_posts (category_id, user_id, title, body_md, score, comment_count, pinned, locked, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
  `);
  const markMigrated = db.prepare(`UPDATE posts SET migrated_to_forum_id = ? WHERE id = ?`);

  const tx = db.transaction((rows) => {
    for (const p of rows) {
      // Body keeps the original markdown intact; if there's an excerpt, prepend
      // it as a TL;DR so feed scanners get the gist.
      const tldr = p.excerpt ? `> **TL;DR** — ${p.excerpt}\n\n` : '';
      const body = `${tldr}${p.content_md || ''}`.trim();
      const created = p.published_at || p.created_at;
      const info = insertForum.run(cat.id, owner.id, p.title, body, 1, created, p.updated_at || created);
      markMigrated.run(info.lastInsertRowid, p.id);
    }
  });
  tx(pending);
}
