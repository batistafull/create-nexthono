// Regenerates ./template from the parent nexthono project.
// Run from the create-nexthono package root:  node scripts/sync-template.mjs
import { cp, rm, rename, access, readdir, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const projectRoot = resolve(pkgRoot, ".."); // the nexthono project
const templateDir = join(pkgRoot, "template");

// Directories/files that must never be copied into the template.
const EXCLUDES = new Set([
  "node_modules",
  ".next",
  "data",
  ".git",
  "create-nexthono", // this package itself
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "next-env.d.ts",
  ".DS_Store",
]);

// Files renamed so npm won't strip/interpret them when the package is published.
const RENAMES = [
  [".gitignore", "_gitignore"],
  [".env", "_env"],
  [".env.example", "_env.example"],
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await rm(templateDir, { recursive: true, force: true });
  await mkdir(templateDir, { recursive: true });

  // Copy each top-level entry individually so we never copy the package
  // (a subdirectory of the project) into its own template folder.
  const entries = await readdir(projectRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDES.has(entry.name)) continue;
    if (entry.name.endsWith(".tsbuildinfo")) continue;
    await cp(join(projectRoot, entry.name), join(templateDir, entry.name), {
      recursive: true,
    });
  }

  for (const [from, to] of RENAMES) {
    const src = join(templateDir, from);
    if (await exists(src)) {
      await rename(src, join(templateDir, to));
    }
  }

  console.log("✅ template/ regenerated from", projectRoot);
}

main().catch((err) => {
  console.error("❌ sync-template failed:", err);
  process.exit(1);
});
