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

  // Idempotent migration: blog posts -> community/forum posts under a
  // dedicated "Writeups & blog" category. Runs on every startup but only
  // touches posts whose migrated_to_forum_id is NULL.
  migrateBlogToForum();
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
