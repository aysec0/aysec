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
}
