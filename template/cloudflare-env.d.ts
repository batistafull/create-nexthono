import type { D1Database } from "@cloudflare/workers-types";

/**
 * Cloudflare bindings available at runtime via `getCloudflareContext().env`.
 *
 * Declared by hand so the data layer typechecks before Workers is wired up
 * (step 4). Once `wrangler.jsonc` exists, `wrangler types` regenerates this
 * from the actual bindings and this file can be replaced by the generated one.
 */
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    JWT_SECRET?: string;
    JWT_EXPIRES_IN?: string;
  }
}

export {};
