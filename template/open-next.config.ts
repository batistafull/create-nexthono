import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare adapter config. Defaults are enough for this starter;
 * add incremental cache (R2/KV), tag cache, or queue overrides here later.
 * See https://opennext.js.org/cloudflare
 */
export default defineCloudflareConfig();
