import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../lib/env";
import { db } from "./client";

/**
 * Minimal forward-only migration runner.
 *
 *   pnpm db:migrate           apply any pending migrations
 *   pnpm db:migrate --fresh   drop everything and re-apply from scratch
 *
 * Migrations live in ./migrations/*.sql and run in filename order, so keep
 * the numeric prefix (001_, 002_, ...).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "migrations");
const schemaPath = join(__dirname, "schema.sql");

function ensureMigrationsTable() {
  db.exec(readFileSync(schemaPath, "utf8"));
}

function appliedMigrations(): Set<string> {
  const rows = db.prepare("SELECT name FROM _migrations").all() as {
    name: string;
  }[];
  return new Set(rows.map((r) => r.name));
}

function dropAllTables() {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  db.pragma("foreign_keys = OFF");
  const drop = db.transaction(() => {
    for (const { name } of tables) {
      db.exec(`DROP TABLE IF EXISTS "${name}"`);
    }
  });
  drop();
  db.pragma("foreign_keys = ON");
  console.log(`🗑️  Dropped ${tables.length} table(s).`);
}

function run() {
  const fresh = process.argv.includes("--fresh");
  if (fresh) dropAllTables();

  ensureMigrationsTable();
  const done = appliedMigrations();

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let applied = 0;
  const record = db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)");

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    });
    tx();
    applied += 1;
    console.log(`✅ Applied ${file}`);
  }

  console.log(
    applied === 0 ? "✨ Database already up to date." : `✨ Applied ${applied} migration(s).`,
  );
}

run();
