import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";

/**
 * Seeds baseline data into D1 by generating SQL and piping it through
 * `wrangler d1 execute`. Idempotent: INSERT OR IGNORE + the partial unique
 * index on (email) WHERE deleted = 0 make a second run a no-op.
 *
 *   npm run db:seed            seed the local D1 (.wrangler/state)
 *   npm run db:seed:remote     seed the deployed D1
 */
const remote = process.argv.includes("--remote");
const email = "admin@nexthono.dev";

const passwordHash = await bcrypt.hash("admin1234", 10);
const now = new Date().toISOString();
const id = randomUUID();

const sql = `INSERT OR IGNORE INTO users
  (id, date_entered, date_modified, create_by, modified_by, deleted,
   name, email, password_hash, role)
VALUES
  ('${id}', '${now}', '${now}', NULL, NULL, 0,
   'Admin', '${email}', '${passwordHash}', 'admin');`;

// Write to a temp file so wrangler receives the SQL verbatim — no shell
// escaping of the '$' / '/' characters bcrypt hashes contain.
const file = join(tmpdir(), `nexthono-seed-${id}.sql`);
writeFileSync(file, sql);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  [
    "wrangler",
    "d1",
    "execute",
    "nexthono",
    remote ? "--remote" : "--local",
    "--file",
    file,
    "--yes",
  ],
  { stdio: "inherit" },
);
rmSync(file, { force: true });

if (result.status !== 0) {
  console.error("❌ Seed failed.");
  process.exit(1);
}
console.log(`✅ Seeded admin user (${email} / admin1234)`);
