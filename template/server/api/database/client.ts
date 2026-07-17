import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

/**
 * Single source of truth for the SQLite connection.
 *
 * Local development uses better-sqlite3. For the remote environment
 * (Cloudflare D1) this module is the only place that would need to swap
 * the underlying driver — everything above the repository layer is agnostic.
 */

const dbPath = resolve(process.env.DATABASE_PATH ?? "./data/app.db");

// Ensure the containing folder exists before opening the file.
const dir = dirname(dbPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

export const db = getDb();
