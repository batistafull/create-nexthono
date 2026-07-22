import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";

/**
 * Generates the seed SQL that `db:seed` then applies with `wrangler d1 execute`.
 * Kept as a pure file-writer — NO child processes — so wrangler is invoked by
 * the npm script itself and resolves the same way on every platform (spawning
 * npx.cmd directly is blocked on Windows).
 *
 * Idempotent: INSERT OR IGNORE + the partial unique index on (email) WHERE
 * deleted = 0 make re-applying the seed a no-op.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, ".seed.sql");

const email = "admin@nexthono.dev";
const passwordHash = await bcrypt.hash("admin1234", 10);
const now = new Date().toISOString();
const id = randomUUID();

const sql = `INSERT OR IGNORE INTO users
  (id, date_entered, date_modified, create_by, modified_by, deleted,
   name, email, password_hash, role)
VALUES
  ('${id}', '${now}', '${now}', NULL, NULL, 0,
   'Admin', '${email}', '${passwordHash}', 'admin');
`;

writeFileSync(outFile, sql);
console.log(`✔ Seed SQL generated for ${email} (password: admin1234)`);
