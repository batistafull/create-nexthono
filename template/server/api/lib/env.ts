/**
 * Loads `.env` for standalone scripts (migrations, seeds) run via tsx.
 * Next.js loads env vars on its own, so importing this inside the app is a
 * harmless no-op. Safe to import multiple times.
 */
try {
  // Node >= 20.12 / 22 / 24
  (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
} catch {
  // .env is optional — env vars may already be set by the shell.
}
