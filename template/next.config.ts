import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// Makes the Cloudflare bindings (D1, etc.) available to `getCloudflareContext()`
// during `next dev`, so the data layer works locally without a full deploy.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
