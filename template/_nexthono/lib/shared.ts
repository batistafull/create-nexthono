import { spawnSync } from "node:child_process";
import type { Interface } from "node:readline/promises";

/**
 * Shared building blocks for the nexthono module generator
 * (.nexthono/create-module.ts) and field adder (.nexthono/add-field.ts): case
 * helpers, the field model, per-field code snippet builders, prompts, and a
 * few small process helpers. Kept dependency-free (no filesystem paths) so
 * both entry scripts can resolve their own project root.
 */

export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function log(msg = "") {
  console.log(msg);
}

// ---------------------------------------------------------------------------
// Case helpers
// ---------------------------------------------------------------------------

export function toWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function toSnake(input: string): string {
  return toWords(input).join("_");
}

export function toPascal(input: string): string {
  return toWords(input).map(capitalizeWord).join("");
}

export function toCamel(input: string): string {
  const words = toWords(input);
  if (words.length === 0) return "";
  return [words[0], ...words.slice(1).map(capitalizeWord)].join("");
}

export function toLabel(input: string): string {
  return toWords(input).map(capitalizeWord).join(" ");
}

function pluralizeWord(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function pluralizeSnake(snake: string): string {
  const words = snake.split("_");
  words[words.length - 1] = pluralizeWord(words[words.length - 1]);
  return words.join("_");
}

export const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;

export const BASE_FIELD_NAMES = new Set([
  "id",
  "date_entered",
  "date_modified",
  "create_by",
  "modified_by",
  "deleted",
]);

// ---------------------------------------------------------------------------
// Field model
// ---------------------------------------------------------------------------

export type FieldType = "string" | "integer" | "decimal" | "boolean" | "date";

export const FIELD_TYPES: readonly FieldType[] = [
  "string",
  "integer",
  "decimal",
  "boolean",
  "date",
];

export const TS_TYPE: Record<FieldType, string> = {
  string: "string",
  integer: "number",
  decimal: "number",
  boolean: "boolean",
  date: "string",
};

export const SQL_TYPE: Record<FieldType, string> = {
  string: "TEXT",
  integer: "INTEGER",
  decimal: "REAL",
  boolean: "INTEGER",
  date: "TEXT",
};

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  length?: number;
  required: boolean;
  unique: boolean;
  /** SQL-ready default literal (already quoted for strings). Only used by
   *  `nexthono-field` to satisfy SQLite's ALTER TABLE ... NOT NULL constraint. */
  sqlDefault?: string;
}

export interface ModuleNames {
  table: string; // snake_case plural — also the frontend route segment
  singularSnake: string;
  Pascal: string; // Product
  PascalPlural: string; // Products
  camelSingular: string; // product
  camelPlural: string; // products
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export async function ask(rl: Interface, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

export async function askMenu(rl: Interface, question: string, options: string[]): Promise<number> {
  log(question);
  for (const [i, opt] of options.entries()) log(`  ${i + 1}) ${opt}`);
  for (;;) {
    const raw = await ask(rl, `${c.cyan}>${c.reset} `);
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n;
    log(`${c.red}Opción inválida. Elige un número entre 1 y ${options.length}.${c.reset}`);
  }
}

export async function askYesNo(rl: Interface, question: string): Promise<boolean> {
  const choice = await askMenu(rl, question, ["Sí", "No"]);
  return choice === 1;
}

export async function promptFieldCore(
  rl: Interface,
  existing: Set<string>,
): Promise<Pick<FieldDef, "name" | "label" | "type" | "length" | "required" | "unique">> {
  let name: string | undefined;
  while (!name) {
    const raw = await ask(rl, "\nNombre del campo (ej: price): ");
    const snake = toSnake(raw);
    if (!snake || !IDENTIFIER_RE.test(snake)) {
      log(
        `${c.red}Nombre inválido. Usa letras, números y guiones bajos (debe empezar con una letra).${c.reset}`,
      );
      continue;
    }
    if (BASE_FIELD_NAMES.has(snake)) {
      log(`${c.red}"${snake}" ya es un campo base. Elige otro nombre.${c.reset}`);
      continue;
    }
    if (existing.has(snake)) {
      log(`${c.red}El campo "${snake}" ya existe en este módulo.${c.reset}`);
      continue;
    }
    name = snake;
  }

  const typeChoice = await askMenu(rl, "\nTipo de dato:", [
    "string (texto corto)",
    "integer (número entero)",
    "decimal (número decimal)",
    "boolean (sí/no)",
    "date (fecha)",
  ]);
  const type = FIELD_TYPES[typeChoice - 1];

  let length: number | undefined;
  if (type === "string") {
    const raw = await ask(rl, "Longitud máxima (Enter para omitir): ");
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (Number.isInteger(n) && n > 0) length = n;
    }
  }

  const required = await askYesNo(rl, "\n¿Es requerido?");
  const unique = await askYesNo(rl, "\n¿Debe ser único (unique key)?");

  return { name, label: toLabel(name), type, length, required, unique };
}

// ---------------------------------------------------------------------------
// Per-field code snippet builders (shared by the generator and the patcher)
// ---------------------------------------------------------------------------

export function zodExpr(f: FieldDef, forUpdate: boolean): string {
  let base: string;
  switch (f.type) {
    case "string":
      base = f.required ? `z.string().min(1, "${f.label} is required")` : "z.string()";
      if (f.length) base += `.max(${f.length})`;
      break;
    case "integer":
      base = "z.number().int()";
      break;
    case "decimal":
      base = "z.number()";
      break;
    case "boolean":
      base = "z.boolean()";
      break;
    case "date":
      base = f.required ? `z.string().min(1, "${f.label} is required")` : "z.string()";
      break;
  }
  if (forUpdate || !f.required) base += ".optional()";
  return base;
}

export function insertValueExpr(f: FieldDef): string {
  if (f.type === "boolean") {
    return f.required
      ? `data.${f.name} ? 1 : 0`
      : `data.${f.name} === undefined ? null : data.${f.name} ? 1 : 0`;
  }
  return f.required ? `data.${f.name}` : `data.${f.name} ?? null`;
}

export function updateAssignExpr(f: FieldDef): string {
  return f.type === "boolean" ? `data.${f.name} ? 1 : 0` : `data.${f.name}`;
}

export function payloadFieldExpr(f: FieldDef): string {
  if (f.type === "integer" || f.type === "decimal") {
    return f.required
      ? `Number(form.${f.name})`
      : `form.${f.name} === "" ? undefined : Number(form.${f.name})`;
  }
  if (f.type === "boolean") return `Boolean(form.${f.name})`;
  return f.required
    ? `String(form.${f.name})`
    : `form.${f.name} === "" ? undefined : String(form.${f.name})`;
}

export function editPopulateExpr(f: FieldDef): string {
  if (f.type === "boolean") return `Boolean(item.${f.name})`;
  return `item.${f.name} == null ? "" : String(item.${f.name})`;
}

export function tableCellExpr(f: FieldDef): string {
  return f.type === "boolean" ? `item.${f.name} ? "Sí" : "No"` : `item.${f.name} ?? "—"`;
}

export function formInputJsx(f: FieldDef): string {
  if (f.type === "boolean") {
    return `          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.${f.name})}
              onChange={(e) => setForm((prev) => ({ ...prev, ${f.name}: e.target.checked }))}
            />
            ${f.label}
          </label>`;
  }
  const inputType =
    f.type === "date" ? "date" : f.type === "integer" || f.type === "decimal" ? "number" : "text";
  const stepAttr = f.type === "decimal" ? '\n              step="any"' : "";
  return `          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted-foreground)]">${f.label}${f.required ? " *" : ""}</span>
            <input
              type="${inputType}"${stepAttr}
              required={${f.required}}
              value={String(form.${f.name} ?? "")}
              onChange={(e) => setForm((prev) => ({ ...prev, ${f.name}: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </label>`;
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

export function formatWithBiome(projectRoot: string, paths: string[]) {
  if (paths.length === 0) return;
  const onWindows = process.platform === "win32";
  const cmd = "npx";
  const args = ["--yes", "biome", "check", "--write", ...paths];
  if (onWindows) {
    const line = [cmd, ...args].map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(" ");
    spawnSync(line, { cwd: projectRoot, stdio: "ignore", shell: true });
  } else {
    spawnSync(cmd, args, { cwd: projectRoot, stdio: "ignore" });
  }
}

export function detectPackageManager(): "npm" | "pnpm" | "yarn" | "bun" {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

export function runMigration(projectRoot: string, pm: string): boolean {
  const onWindows = process.platform === "win32";
  const args = pm === "yarn" ? ["db:migrate"] : ["run", "db:migrate"];
  if (onWindows) {
    const line = [pm, ...args].join(" ");
    return spawnSync(line, { cwd: projectRoot, stdio: "inherit", shell: true }).status === 0;
  }
  return spawnSync(pm, args, { cwd: projectRoot, stdio: "inherit" }).status === 0;
}

export function nextMigrationPrefix(migrationFiles: string[]): string {
  let max = 0;
  for (const f of migrationFiles) {
    const m = f.match(/^(\d+)_/);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  // 4 digits to match wrangler's convention (0001_, 0002_, ...).
  return String(max + 1).padStart(4, "0");
}
