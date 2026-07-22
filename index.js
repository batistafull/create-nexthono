#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = join(__dirname, "template");

// Files/dirs renamed in the published template must be restored on scaffold.
const RENAMES = [
  ["_gitignore", ".gitignore"],
  ["_dev.vars.example", ".dev.vars.example"],
  ["_nexthono", ".nexthono"],
];

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function log(msg = "") {
  console.log(msg);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const flags = new Set();
  let dir = null;
  let pm = null;
  for (const arg of argv) {
    if (arg === "--no-install") flags.add("no-install");
    else if (arg === "--no-seed") flags.add("no-seed");
    else if (arg === "--no-git") flags.add("no-git");
    else if (arg === "--git") flags.add("git");
    else if (arg === "--help" || arg === "-h") flags.add("help");
    else if (arg.startsWith("--pm=")) pm = arg.slice("--pm=".length);
    else if (!arg.startsWith("-") && !dir) dir = arg;
  }
  return { dir, pm, flags };
}

function detectPackageManager() {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

function sanitizePackageName(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-~._]/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "") || "nexthono-app"
  );
}

function exec(cmd, args, cwd, silent = false) {
  // npm/pnpm/yarn/bun/git are .cmd shims on Windows, so they must go through a
  // shell. With shell:true, pass ONE command string (an args array is both
  // deprecated and mis-resolved on Windows) and quote args that contain spaces.
  const stdio = silent ? "ignore" : "inherit";
  const onWindows = process.platform === "win32";
  if (onWindows) {
    const line = [cmd, ...args]
      .map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
      .join(" ");
    return spawnSync(line, { cwd, stdio, shell: true }).status === 0;
  }
  return spawnSync(cmd, args, { cwd, stdio }).status === 0;
}

const run = (cmd, args, cwd) => exec(cmd, args, cwd, false);
const runSilent = (cmd, args, cwd) => exec(cmd, args, cwd, true);

function initGit(targetDir) {
  if (!runSilent("git", ["--version"], targetDir)) {
    return { ok: false, reason: "git not found" };
  }
  if (runSilent("git", ["rev-parse", "--is-inside-work-tree"], targetDir)) {
    return { ok: false, reason: "already inside a git repository" };
  }
  if (
    !runSilent("git", ["init", "-b", "main"], targetDir) &&
    !runSilent("git", ["init"], targetDir)
  ) {
    return { ok: false, reason: "git init failed" };
  }

  runSilent("git", ["add", "-A"], targetDir);
  const msg = "Initial commit from create-nexthono";
  // Use the user's configured identity; fall back to a placeholder so the
  // commit still succeeds on a machine without git user.name/user.email set.
  let committed = runSilent("git", ["commit", "-m", msg], targetDir);
  if (!committed) {
    committed = runSilent(
      "git",
      [
        "-c",
        "user.name=create-nexthono",
        "-c",
        "user.email=create-nexthono@users.noreply.github.com",
        "commit",
        "-m",
        msg,
      ],
      targetDir,
    );
  }
  return { ok: true, committed };
}

function pmCommands(pm) {
  switch (pm) {
    case "pnpm":
      return { install: ["pnpm", ["install"]], runPrefix: ["pnpm", ["run"]] };
    case "yarn":
      return { install: ["yarn", []], runPrefix: ["yarn", []] };
    case "bun":
      return { install: ["bun", ["install"]], runPrefix: ["bun", ["run"]] };
    default:
      return { install: ["npm", ["install"]], runPrefix: ["npm", ["run"]] };
  }
}

function printBanner() {
  const INNER = 34; // visible chars between the side borders (after "│ ")
  const top = `${c.cyan}╭${"─".repeat(INNER + 2)}╮${c.reset}`;
  const bottom = `${c.cyan}╰${"─".repeat(INNER + 2)}╯${c.reset}`;
  const row = (visible, colored) => {
    const pad = " ".repeat(Math.max(0, INNER - visible.length));
    return `${c.cyan}│${c.reset} ${colored}${pad} ${c.cyan}│${c.reset}`;
  };
  log("");
  log(top);
  log(row("", ""));
  log(row("◆  create-nexthono", `${c.bold}${c.cyan}◆  create-nexthono${c.reset}`));
  log(
    row(
      "Next.js · Hono · SQLite · JWT",
      `${c.dim}Next.js · Hono · SQLite · JWT${c.reset}`,
    ),
  );
  log(row("", ""));
  log(bottom);
  log("");
}

function printHelp() {
  log(`
${c.bold}create-nexthono${c.reset} — Next.js (App Router) + Hono starter

${c.bold}Usage${c.reset}
  npm create nexthono@latest ${c.dim}[directory] [options]${c.reset}

${c.bold}Options${c.reset}
  --pm=<npm|pnpm|yarn|bun>   Force a package manager
  --no-install               Skip dependency installation
  --no-seed                  Skip db:migrate + db:seed (no admin user)
  --no-git                   Skip git repository initialization
  -h, --help                 Show this help

${c.bold}Example${c.reset}
  npm create nexthono@latest my-app
`);
}

async function copyTemplate(targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(templateDir, { withFileTypes: true });
  for (const entry of entries) {
    await cp(join(templateDir, entry.name), join(targetDir, entry.name), {
      recursive: true,
    });
  }
  for (const [from, to] of RENAMES) {
    const src = join(targetDir, from);
    if (await exists(src)) await rename(src, join(targetDir, to));
  }
}

async function setProjectName(targetDir, name) {
  const pkgPath = join(targetDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.name = sanitizePackageName(name);
  pkg.version = "0.1.0";
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

async function main() {
  const { dir, pm: forcedPm, flags } = parseArgs(process.argv.slice(2));

  if (flags.has("help")) {
    printHelp();
    return;
  }

  printBanner();

  let targetName = dir;
  if (!targetName) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    targetName = (await rl.question("Project directory (my-app): ")).trim() || "my-app";
    rl.close();
  }

  const targetDir = resolve(process.cwd(), targetName);
  const projectName = basename(targetDir);

  if (await exists(targetDir)) {
    const contents = await readdir(targetDir).catch(() => []);
    if (contents.length > 0) {
      log(`${c.red}✖ Directory "${projectName}" already exists and is not empty.${c.reset}`);
      process.exit(1);
    }
  }

  const pm = forcedPm ?? detectPackageManager();

  log(`${c.dim}Scaffolding in ${targetDir}${c.reset}`);
  await copyTemplate(targetDir);
  await setProjectName(targetDir, projectName);
  log(`${c.green}✔ Project files created${c.reset}`);

  const { install, runPrefix } = pmCommands(pm);
  let installed = false;

  if (!flags.has("no-install")) {
    log(`\n${c.dim}Installing dependencies with ${pm}…${c.reset}`);
    installed = run(install[0], install[1], targetDir);
    if (!installed) {
      log(`${c.yellow}⚠ Dependency install failed — run it manually later.${c.reset}`);
    } else {
      log(`${c.green}✔ Dependencies installed${c.reset}`);
    }
  }

  const doSeed = installed && !flags.has("no-seed");
  if (doSeed) {
    log(`\n${c.dim}Setting up the database (migrate + seed)…${c.reset}`);
    const migrated = run(runPrefix[0], [...runPrefix[1], "db:migrate"], targetDir);
    const seeded = migrated && run(runPrefix[0], [...runPrefix[1], "db:seed"], targetDir);
    if (seeded) {
      log(`${c.green}✔ Database ready — admin user seeded${c.reset}`);
    } else {
      log(`${c.yellow}⚠ Database setup failed — run "${pm} run db:migrate && ${pm} run db:seed" later.${c.reset}`);
    }
  }

  let gitCommitted = false;
  if (!flags.has("no-git")) {
    log(`\n${c.dim}Initializing git repository…${c.reset}`);
    const git = initGit(targetDir);
    if (git.ok) {
      gitCommitted = git.committed;
      log(
        `${c.green}✔ Git repository initialized${
          git.committed ? " (initial commit created)" : ""
        }${c.reset}`,
      );
    } else {
      log(`${c.yellow}⚠ Skipped git — ${git.reason}.${c.reset}`);
    }
  }

  const runCmd = pm === "npm" ? "npm run" : pm;
  log(`\n${c.bold}${c.green}Done!${c.reset} Next steps:\n`);
  log(`  ${c.cyan}cd ${targetName}${c.reset}`);
  if (flags.has("no-install")) log(`  ${c.cyan}${pm} install${c.reset}`);
  if (!doSeed) {
    log(`  ${c.cyan}${runCmd} db:migrate${c.reset}`);
    log(`  ${c.cyan}${runCmd} db:seed${c.reset}`);
  }
  log(`  ${c.cyan}${runCmd} dev${c.reset}`);
  log(`\n${c.dim}Login with the seeded admin:${c.reset}`);
  log(`  ${c.dim}admin@nexthono.dev / admin1234${c.reset}\n`);
}

main().catch((err) => {
  console.error(`${c.red}✖ ${err?.message ?? err}${c.reset}`);
  process.exit(1);
});
