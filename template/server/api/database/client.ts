import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

/**
 * Single source of truth for the D1 connection.
 *
 * Unlike better-sqlite3 there is NO ambient, long-lived connection on Workers:
 * D1 is exposed as a per-request binding (`env.DB`). We pull it from the
 * Cloudflare request context instead of opening a file. Everything above the
 * repository layer stays agnostic — it just calls `getDb()`.
 *
 * `getCloudflareContext()` only resolves inside the request lifecycle (route
 * handlers, server components), which is exactly where the repository runs.
 */
export type Db = D1Database;

export function getDb(): D1Database {
  const { env } = getCloudflareContext();
  const db = env.DB;
  if (!db) {
    throw new Error(
      "D1 binding `DB` is not configured. Add a `d1_databases` entry to " +
        "wrangler.jsonc and run `wrangler types` to generate the binding type.",
    );
  }
  return db;
}
