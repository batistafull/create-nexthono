# create-nexthono

Scaffold a **Next.js (App Router) + Hono** full-stack TypeScript starter — layered
by domain, with SQLite, JWT auth, Biome, Tailwind v4, Zustand, and a **seeded admin
user** ready to log in.

## Usage

```bash
npm create nexthono@latest my-app
# or
pnpm create nexthono my-app
yarn create nexthono my-app
bun create nexthono my-app
```

Then:

```bash
cd my-app
npm run dev   # http://localhost:3000
```

Log in with the seeded admin:

```
admin@nexthono.dev / admin1234
```

## What it does

1. Copies the project template into the target directory.
2. Installs dependencies with your package manager (auto-detected).
3. Runs `db:migrate` + `db:seed`, creating the first admin user.
4. Initializes a git repository on `main` with an initial commit.

## Options

| Flag                        | Description                                   |
| --------------------------- | --------------------------------------------- |
| `--pm=<npm\|pnpm\|yarn\|bun>` | Force a package manager                       |
| `--no-install`              | Skip dependency installation                  |
| `--no-seed`                 | Skip `db:migrate` + `db:seed` (no admin user) |
| `--no-git`                  | Skip git repository initialization            |
| `-h`, `--help`              | Show help                                     |

> Git init is skipped automatically when git isn't installed or the target is
> already inside a repository. If your git identity isn't configured, the
> initial commit falls back to a placeholder author so it still succeeds.

## What's inside the generated project

- **Frontend**: Next.js App Router, TypeScript, Tailwind CSS v4, Zustand, Lucide.
- **Backend**: Hono mounted at `/api/v1`, layered `routes → controller → service → repository`.
- **Auth**: JWT login / logout / register / me, role-based access.
- **Database**: better-sqlite3 with migrations, seeds, and mandatory base fields
  (`id`, `date_entered`, `date_modified`, `create_by`, `modified_by`, `deleted`) on every table.

## Maintaining the template

The `template/` folder is a copy of the reference project (with dotfiles renamed
so npm publishes them: `.gitignore` → `_gitignore`, `.env` → `_env`, etc.).
To regenerate it from the parent project:

```bash
npm run sync
```

## License

MIT
