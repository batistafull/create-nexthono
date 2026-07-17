import bcrypt from "bcryptjs";
import "../lib/env";
import { newBaseFields } from "./base";
import { db } from "./client";

/**
 * Seeds baseline data. Idempotent: running it twice will not duplicate rows.
 *   pnpm db:seed
 */
async function seed() {
  const email = "admin@nexthono.dev";

  const existing = db.prepare("SELECT id FROM users WHERE email = ? AND deleted = 0").get(email);

  if (existing) {
    console.log("✨ Seed skipped — admin user already exists.");
    return;
  }

  const base = newBaseFields(null);
  const passwordHash = await bcrypt.hash("admin1234", 10);

  db.prepare(
    `INSERT INTO users
       (id, date_entered, date_modified, create_by, modified_by, deleted,
        name, email, password_hash, role)
     VALUES
       (@id, @date_entered, @date_modified, @create_by, @modified_by, @deleted,
        @name, @email, @password_hash, @role)`,
  ).run({
    ...base,
    name: "Admin",
    email,
    password_hash: passwordHash,
    role: "admin",
  });

  console.log(`✅ Seeded admin user (${email} / admin1234)`);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
