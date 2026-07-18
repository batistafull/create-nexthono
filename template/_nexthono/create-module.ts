import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type Interface, createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  type FieldDef,
  IDENTIFIER_RE,
  type ModuleNames,
  SQL_TYPE,
  TS_TYPE,
  askYesNo,
  c,
  detectPackageManager,
  editPopulateExpr,
  formInputJsx,
  formatWithBiome,
  insertValueExpr,
  log,
  nextMigrationPrefix,
  payloadFieldExpr,
  pluralizeSnake,
  promptFieldCore,
  runMigration,
  tableCellExpr,
  toCamel,
  toLabel,
  toPascal,
  toSnake,
  updateAssignExpr,
  zodExpr,
} from "./lib/shared";

/**
 * Interactive scaffolder for a full backend + frontend CRUD module, following
 * the layered pattern documented in AGENTS.md (the `users` module is the
 * reference). Run with:
 *
 *   npm run nexthono-module
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const BACKEND_V1_DIR = join(projectRoot, "server", "api", "v1");
const MIGRATIONS_DIR = join(projectRoot, "server", "api", "database", "migrations");
const INDEX_TS = join(projectRoot, "server", "api", "index.ts");
const SRC_TYPES_DIR = join(projectRoot, "src", "types");
const SRC_SERVICES_DIR = join(projectRoot, "src", "services");
const SRC_HOOKS_DIR = join(projectRoot, "src", "hooks");
const SRC_APP_DIR = join(projectRoot, "src", "app");

async function promptModuleName(rl: Interface): Promise<string> {
  for (;;) {
    const raw = await rl.question("Nombre del módulo, en singular (ej: product): ");
    const snake = toSnake(raw.trim());
    if (!snake || !IDENTIFIER_RE.test(snake)) {
      log(
        `${c.red}Nombre inválido. Usa letras, números y guiones (debe empezar con una letra).${c.reset}`,
      );
      continue;
    }
    return snake;
  }
}

async function promptField(rl: Interface, existing: Set<string>): Promise<FieldDef> {
  return promptFieldCore(rl, existing);
}

// ---------------------------------------------------------------------------
// Backend codegen
// ---------------------------------------------------------------------------

function genTypesTs(n: ModuleNames, fields: FieldDef[]): string {
  const rowFields = fields
    .map((f) => `  ${f.name}: ${TS_TYPE[f.type]}${f.required ? "" : " | null"};`)
    .join("\n");
  const createFields = fields
    .map((f) => `  ${f.name}${f.required ? "" : "?"}: ${TS_TYPE[f.type]};`)
    .join("\n");

  return `import type { BaseFields } from "../../database/base";

export type ${n.Pascal}Row = BaseFields & {
${rowFields}
};

/** ${n.Pascal} as returned by the API. */
export type ${n.Pascal} = ${n.Pascal}Row;

export type Create${n.Pascal}Input = {
${createFields}
};

export type Update${n.Pascal}Input = Partial<Create${n.Pascal}Input>;
`;
}

function genSchemaTs(n: ModuleNames, fields: FieldDef[]): string {
  const createLines = fields.map((f) => `  ${f.name}: ${zodExpr(f, false)},`).join("\n");
  const updateLines = fields.map((f) => `  ${f.name}: ${zodExpr(f, true)},`).join("\n");
  const refine =
    fields.length > 0
      ? `\n  .refine((d) => Object.keys(d).length > 0, { message: "At least one field is required" })`
      : "";

  return `import { z } from "zod";

export const create${n.Pascal}Schema = z.object({
${createLines}
});

export const update${n.Pascal}Schema = z
  .object({
${updateLines}
  })${refine};

export const ${n.camelSingular}IdParamSchema = z.object({
  id: z.string().uuid("Invalid ${n.singularSnake} id"),
});
`;
}

function genRepositoryTs(n: ModuleNames, fields: FieldDef[]): string {
  const booleanFields = fields.filter((f) => f.type === "boolean");
  const uniqueFields = fields.filter((f) => f.unique);

  const omitUnion = ["deleted", ...booleanFields.map((f) => f.name)]
    .map((k) => `"${k}"`)
    .join(" | ");
  const rawExtra = ["deleted: number", ...booleanFields.map((f) => `${f.name}: number`)].join("; ");
  const mapRowBooleanLines = booleanFields
    .map((f) => `    ${f.name}: Boolean(row.${f.name}),`)
    .join("\n");

  const insertCols = [
    "id",
    "date_entered",
    "date_modified",
    "create_by",
    "modified_by",
    "deleted",
    ...fields.map((f) => f.name),
  ];
  const insertAtCols = insertCols.map((col) => `@${col}`);
  const insertParamsLines = fields.map((f) => `      ${f.name}: ${insertValueExpr(f)},`).join("\n");

  const updateIfBlocks = fields
    .map(
      (f) => `    if (data.${f.name} !== undefined) {
      sets.push("${f.name} = @${f.name}");
      params.${f.name} = ${updateAssignExpr(f)};
    }`,
    )
    .join("\n");

  const findByUniqueMethods = uniqueFields
    .map(
      (f) => `
  findBy${toPascal(f.name)}(${f.name}: ${TS_TYPE[f.type]}): ${n.Pascal}Row | null {
    const row = db
      .prepare("SELECT * FROM ${n.table} WHERE ${f.name} = ? AND deleted = 0")
      .get(${f.name}) as Raw${n.Pascal}Row | undefined;
    return row ? mapRow(row) : null;
  },`,
    )
    .join("\n");

  return `import { mapDeleted, newBaseFields, touchBaseFields } from "../../database/base";
import { db } from "../../database/client";
import type { Create${n.Pascal}Input, ${n.Pascal}Row, Update${n.Pascal}Input } from "./types";

/** A row as SQLite returns it: 0/1 columns are not yet converted to booleans. */
type Raw${n.Pascal}Row = Omit<${n.Pascal}Row, ${omitUnion}> & { ${rawExtra} };

function mapRow(row: Raw${n.Pascal}Row): ${n.Pascal}Row {
  return {
    ...mapDeleted(row),
${mapRowBooleanLines}
  };
}

/**
 * Data-access layer for ${n.table}. The ONLY layer that talks to the database.
 * Soft deletes are respected everywhere (deleted = 0).
 */
export const ${n.camelSingular}Repository = {
  findAll(): ${n.Pascal}Row[] {
    const rows = db
      .prepare("SELECT * FROM ${n.table} WHERE deleted = 0 ORDER BY date_entered DESC")
      .all() as Raw${n.Pascal}Row[];
    return rows.map(mapRow);
  },

  findById(id: string): ${n.Pascal}Row | null {
    const row = db.prepare("SELECT * FROM ${n.table} WHERE id = ? AND deleted = 0").get(id) as
      | Raw${n.Pascal}Row
      | undefined;
    return row ? mapRow(row) : null;
  },
${findByUniqueMethods}

  create(data: Create${n.Pascal}Input, actorId: string | null = null): ${n.Pascal}Row {
    const base = newBaseFields(actorId);
    db.prepare(
      \`INSERT INTO ${n.table}
         (${insertCols.join(", ")})
       VALUES
         (${insertAtCols.join(", ")})\`,
    ).run({
      ...base,
${insertParamsLines}
    });
    return this.findById(base.id)!;
  },

  update(id: string, data: Update${n.Pascal}Input, actorId: string | null = null): ${n.Pascal}Row | null {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

${updateIfBlocks}

    const touch = touchBaseFields(actorId);
    sets.push("date_modified = @date_modified", "modified_by = @modified_by");
    params.date_modified = touch.date_modified;
    params.modified_by = touch.modified_by;

    db.prepare(\`UPDATE ${n.table} SET \${sets.join(", ")} WHERE id = @id AND deleted = 0\`).run(params);

    return this.findById(id);
  },

  /** Soft delete. */
  softDelete(id: string, actorId: string | null = null): boolean {
    const touch = touchBaseFields(actorId);
    const result = db
      .prepare(
        \`UPDATE ${n.table}
           SET deleted = 1, date_modified = @date_modified, modified_by = @modified_by
         WHERE id = @id AND deleted = 0\`,
      )
      .run({ id, ...touch });
    return result.changes > 0;
  },
};
`;
}

function genServiceTs(n: ModuleNames, fields: FieldDef[]): string {
  const uniqueFields = fields.filter((f) => f.unique);

  const createChecks = uniqueFields
    .map(
      (f) => `    if (
      input.${f.name} !== undefined &&
      ${n.camelSingular}Repository.findBy${toPascal(f.name)}(input.${f.name})
    ) {
      throw conflict("${f.label} already in use");
    }
`,
    )
    .join("");

  const updateChecks = uniqueFields
    .map(
      (f) => `    if (input.${f.name} !== undefined && input.${f.name} !== existing.${f.name}) {
      const clash = ${n.camelSingular}Repository.findBy${toPascal(f.name)}(input.${f.name});
      if (clash && clash.id !== id) throw conflict("${f.label} already in use");
    }
`,
    )
    .join("");

  return `import { conflict, notFound } from "../../lib/http-error";
import { ${n.camelSingular}Repository } from "./repository";
import type { Create${n.Pascal}Input, ${n.Pascal}, Update${n.Pascal}Input } from "./types";

/** Business logic for ${n.table}. */
export const ${n.camelSingular}Service = {
  list(): ${n.Pascal}[] {
    return ${n.camelSingular}Repository.findAll();
  },

  getById(id: string): ${n.Pascal} {
    const ${n.camelSingular} = ${n.camelSingular}Repository.findById(id);
    if (!${n.camelSingular}) throw notFound("${n.Pascal} not found");
    return ${n.camelSingular};
  },

  create(input: Create${n.Pascal}Input, actorId: string | null = null): ${n.Pascal} {
${createChecks}    return ${n.camelSingular}Repository.create(input, actorId);
  },

  update(id: string, input: Update${n.Pascal}Input, actorId: string | null = null): ${n.Pascal} {
    const existing = ${n.camelSingular}Repository.findById(id);
    if (!existing) throw notFound("${n.Pascal} not found");

${updateChecks}    const updated = ${n.camelSingular}Repository.update(id, input, actorId);
    return updated!;
  },

  remove(id: string, actorId: string | null = null): void {
    const ok = ${n.camelSingular}Repository.softDelete(id, actorId);
    if (!ok) throw notFound("${n.Pascal} not found");
  },
};
`;
}

function genControllerTs(n: ModuleNames): string {
  return `import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { ${n.camelSingular}Service } from "./service";
import type { Create${n.Pascal}Input, Update${n.Pascal}Input } from "./types";

/** HTTP layer: reads validated input, calls the service, shapes the response. */
export const ${n.camelPlural}Controller = {
  list(c: Context<AppEnv>) {
    return c.json({ data: ${n.camelSingular}Service.list() });
  },

  getById(c: Context<AppEnv>) {
    const { id } = c.req.param();
    return c.json({ data: ${n.camelSingular}Service.getById(id) });
  },

  async create(c: Context<AppEnv>) {
    const body = (await c.req.json()) as Create${n.Pascal}Input;
    const actorId = c.get("user")?.id ?? null;
    const ${n.camelSingular} = ${n.camelSingular}Service.create(body, actorId);
    return c.json({ data: ${n.camelSingular} }, 201);
  },

  async update(c: Context<AppEnv>) {
    const { id } = c.req.param();
    const body = (await c.req.json()) as Update${n.Pascal}Input;
    const actorId = c.get("user")?.id ?? null;
    const ${n.camelSingular} = ${n.camelSingular}Service.update(id, body, actorId);
    return c.json({ data: ${n.camelSingular} });
  },

  remove(c: Context<AppEnv>) {
    const { id } = c.req.param();
    const actorId = c.get("user")?.id ?? null;
    ${n.camelSingular}Service.remove(id, actorId);
    return c.body(null, 204);
  },
};
`;
}

function genRoutesTs(n: ModuleNames): string {
  return `import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth";
import type { AppEnv } from "../../types";
import { ${n.camelPlural}Controller } from "./controller";
import {
  create${n.Pascal}Schema,
  ${n.camelSingular}IdParamSchema,
  update${n.Pascal}Schema,
} from "./schema";

/**
 * /api/v1/${n.table}
 * All routes require authentication; writes require the \`admin\` role.
 */
export const ${n.camelPlural}Routes = new Hono<AppEnv>();

${n.camelPlural}Routes.use("*", requireAuth);

${n.camelPlural}Routes.get("/", ${n.camelPlural}Controller.list);

${n.camelPlural}Routes.get(
  "/:id",
  zValidator("param", ${n.camelSingular}IdParamSchema),
  ${n.camelPlural}Controller.getById,
);

${n.camelPlural}Routes.post(
  "/",
  requireRole("admin"),
  zValidator("json", create${n.Pascal}Schema),
  ${n.camelPlural}Controller.create,
);

${n.camelPlural}Routes.patch(
  "/:id",
  requireRole("admin"),
  zValidator("param", ${n.camelSingular}IdParamSchema),
  zValidator("json", update${n.Pascal}Schema),
  ${n.camelPlural}Controller.update,
);

${n.camelPlural}Routes.delete(
  "/:id",
  requireRole("admin"),
  zValidator("param", ${n.camelSingular}IdParamSchema),
  ${n.camelPlural}Controller.remove,
);
`;
}

function genMigrationSql(prefix: string, n: ModuleNames, fields: FieldDef[]): string {
  const baseCols = [
    "  id            TEXT PRIMARY KEY",
    "  date_entered  TEXT NOT NULL",
    "  date_modified TEXT NOT NULL",
    "  create_by     TEXT",
    "  modified_by   TEXT",
    "  deleted       INTEGER NOT NULL DEFAULT 0",
  ];

  const domainCols = fields.map((f) => {
    let line = `  ${f.name.padEnd(13)} ${SQL_TYPE[f.type]}`;
    if (f.required) line += " NOT NULL";
    if (f.type === "boolean" && f.required) line += " DEFAULT 0";
    return line;
  });

  const body =
    domainCols.length > 0
      ? `${baseCols.join(",\n")},\n\n  -- domain fields\n${domainCols.join(",\n")}`
      : baseCols.join(",\n");

  const indexBlocks = fields
    .filter((f) => f.unique)
    .map(
      (f) =>
        `\nCREATE UNIQUE INDEX IF NOT EXISTS idx_${n.table}_${f.name}_active\n  ON ${n.table} (${f.name}) WHERE deleted = 0;`,
    )
    .join("\n");

  return `-- ${prefix}_${n.table}: tabla de ${n.table}.
-- Campos base primero; campos del dominio después.

CREATE TABLE IF NOT EXISTS ${n.table} (
${body}
);
${indexBlocks}
`;
}

// ---------------------------------------------------------------------------
// Frontend codegen
// ---------------------------------------------------------------------------

function genFrontendTypeTs(n: ModuleNames, fields: FieldDef[]): string {
  const domainLines = fields
    .map((f) => `  ${f.name}: ${TS_TYPE[f.type]}${f.required ? "" : " | null"};`)
    .join("\n");

  return `/** ${n.Pascal} as returned by the API. */
export type ${n.Pascal} = {
  id: string;
  date_entered: string;
  date_modified: string;
  create_by: string | null;
  modified_by: string | null;
  deleted: boolean;
${domainLines}
};
`;
}

function genFrontendServiceTs(n: ModuleNames, fields: FieldDef[]): string {
  const payloadLines = fields
    .map((f) => `  ${f.name}${f.required ? "" : "?"}: ${TS_TYPE[f.type]};`)
    .join("\n");

  return `import type { ${n.Pascal} } from "@/types/${n.singularSnake}";
import { apiClient } from "./api.client";

export type Create${n.Pascal}Payload = {
${payloadLines}
};

export type Update${n.Pascal}Payload = Partial<Create${n.Pascal}Payload>;

/** ${n.PascalPlural} HTTP calls. */
export const ${n.camelPlural}Service = {
  getAll: () => apiClient.get<${n.Pascal}[]>("/${n.table}"),

  getById: (id: string) => apiClient.get<${n.Pascal}>(\`/${n.table}/\${id}\`),

  create: (payload: Create${n.Pascal}Payload) => apiClient.post<${n.Pascal}>("/${n.table}", payload),

  update: (id: string, payload: Update${n.Pascal}Payload) =>
    apiClient.patch<${n.Pascal}>(\`/${n.table}/\${id}\`, payload),

  remove: (id: string) => apiClient.delete<void>(\`/${n.table}/\${id}\`),
};
`;
}

function genFrontendHookTs(n: ModuleNames): string {
  return `"use client";

import { ApiError } from "@/services/api.client";
import {
  ${n.camelPlural}Service,
  type Create${n.Pascal}Payload,
  type Update${n.Pascal}Payload,
} from "@/services/${n.table}.service";
import type { ${n.Pascal} } from "@/types/${n.singularSnake}";
import { useCallback, useEffect, useState } from "react";

/** Loads and exposes the ${n.table} list with loading/error state and CRUD actions. */
export function use${n.PascalPlural}() {
  const [${n.camelPlural}, set${n.PascalPlural}] = useState<${n.Pascal}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      set${n.PascalPlural}(await ${n.camelPlural}Service.getAll());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load ${n.table}");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (payload: Create${n.Pascal}Payload) => {
      await ${n.camelPlural}Service.create(payload);
      await refresh();
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, payload: Update${n.Pascal}Payload) => {
      await ${n.camelPlural}Service.update(id, payload);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await ${n.camelPlural}Service.remove(id);
      await refresh();
    },
    [refresh],
  );

  return { ${n.camelPlural}, loading, error, refresh, create, update, remove };
}
`;
}

function genFrontendPageTsx(n: ModuleNames, fields: FieldDef[]): string {
  const formStateLines = fields
    .map((f) => `  ${f.name}: ${f.type === "boolean" ? "boolean" : "string"};`)
    .join("\n");
  const emptyFormLines = fields
    .map((f) => `  ${f.name}: ${f.type === "boolean" ? "false" : '""'},`)
    .join("\n");
  const editPopulateLines = fields
    .map((f) => `      ${f.name}: ${editPopulateExpr(f)},`)
    .join("\n");
  const payloadLines = fields.map((f) => `        ${f.name}: ${payloadFieldExpr(f)},`).join("\n");
  const thLines = fields
    .map((f) => `                <th className="px-4 py-2 font-medium">${f.label}</th>`)
    .join("\n");
  const tdLines = fields
    .map((f) => `                  <td className="px-4 py-2">{${tableCellExpr(f)}}</td>`)
    .join("\n");
  const formInputs = fields.map(formInputJsx).join("\n");
  const colSpan = fields.length + 2;

  return `"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { use${n.PascalPlural} } from "@/hooks/use${n.PascalPlural}";
import type { Create${n.Pascal}Payload } from "@/services/${n.table}.service";
import type { ${n.Pascal} } from "@/types/${n.singularSnake}";
import { formatDate } from "@/utils/formatDate";
import { LogOut, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type FormState = {
${formStateLines}
};

const emptyForm: FormState = {
${emptyFormLines}
};

export default function ${n.PascalPlural}Page() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { ${n.camelPlural}, loading, error, refresh, create, update, remove } = use${n.PascalPlural}();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function startEdit(item: ${n.Pascal}) {
    setForm({
${editPopulateLines}
    });
    setEditingId(item.id);
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
${payloadLines}
      } as Create${n.Pascal}Payload;

      if (editingId) {
        await update(editingId, payload);
      } else {
        await create(payload);
      }
      cancelForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("¿Eliminar este registro?")) return;
    await remove(id);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">${n.PascalPlural}</h1>
          {user && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Sesión: {user.email} ({user.role})
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw size={16} /> Recargar
          </Button>
          <Button size="sm" onClick={startCreate}>
            <Plus size={16} /> Nuevo
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut size={16} /> Salir
          </Button>
        </div>
      </header>

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="mb-8 grid gap-4 rounded-lg border border-[var(--border)] p-4 sm:grid-cols-2"
        >
${formInputs}
          {formError && <p className="text-sm text-red-500 sm:col-span-2">{formError}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={submitting}>
              {editingId ? "Guardar cambios" : "Crear"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
              <X size={16} /> Cancelar
            </Button>
          </div>
        </form>
      )}

      {loading && <p className="text-sm text-[var(--muted-foreground)]">Cargando…</p>}
      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error} — ¿iniciaste sesión?
        </p>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
              <tr>
${thLines}
                <th className="px-4 py-2 font-medium">Alta</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {${n.camelPlural}.map((item) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
${tdLines}
                  <td className="px-4 py-2 text-[var(--muted-foreground)]">
                    {formatDate(item.date_entered)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onDelete(item.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {${n.camelPlural}.length === 0 && (
                <tr>
                  <td colSpan={${colSpan}} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Sin registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
`;
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

function writeGenerated(path: string, content: string, created: string[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  created.push(path);
}

function registerRoute(n: ModuleNames): boolean {
  const content = readFileSync(INDEX_TS, "utf8");
  const importLine = `import { ${n.camelPlural}Routes } from "./v1/${n.table}/routes";`;
  const routeLine = `v1.route("/${n.table}", ${n.camelPlural}Routes);`;

  if (content.includes(importLine) || content.includes(routeLine)) return false;

  const lines = content.split("\n");

  let lastImportIdx = -1;
  lines.forEach((line, i) => {
    if (/^import .* from "\.\/v1\//.test(line)) lastImportIdx = i;
  });
  if (lastImportIdx === -1) {
    throw new Error("No se encontraron imports de rutas v1 en server/api/index.ts");
  }
  lines.splice(lastImportIdx + 1, 0, importLine);

  let lastRouteIdx = -1;
  lines.forEach((line, i) => {
    if (/^v1\.route\(/.test(line)) lastRouteIdx = i;
  });
  if (lastRouteIdx === -1) {
    throw new Error("No se encontraron llamadas v1.route(...) en server/api/index.ts");
  }
  lines.splice(lastRouteIdx + 1, 0, routeLine);

  writeFileSync(INDEX_TS, lines.join("\n"), "utf8");
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printBanner() {
  log("");
  log(
    `${c.bold}${c.cyan}◆  nexthono-module${c.reset}${c.dim} — generador de módulos CRUD${c.reset}`,
  );
  log("");
}

async function main() {
  printBanner();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const singularSnake = await promptModuleName(rl);
  const table = pluralizeSnake(singularSnake);
  const names: ModuleNames = {
    table,
    singularSnake,
    Pascal: toPascal(singularSnake),
    PascalPlural: toPascal(table),
    camelSingular: toCamel(singularSnake),
    camelPlural: toCamel(table),
  };

  const backendDir = join(BACKEND_V1_DIR, table);
  const frontendPageDir = join(SRC_APP_DIR, table);
  const frontendTypeFile = join(SRC_TYPES_DIR, `${singularSnake}.ts`);
  if (existsSync(backendDir) || existsSync(frontendPageDir) || existsSync(frontendTypeFile)) {
    log(`${c.red}✖ El módulo "${table}" ya existe.${c.reset}`);
    rl.close();
    process.exitCode = 1;
    return;
  }

  const fields: FieldDef[] = [];
  const fieldNames = new Set<string>();
  for (;;) {
    const addMore = await askYesNo(rl, "\n¿Desea agregar un campo adicional?");
    if (!addMore) break;
    const field = await promptField(rl, fieldNames);
    fieldNames.add(field.name);
    fields.push(field);
    log(
      `${c.green}✔ Campo "${field.name}" (${field.type}${field.required ? ", requerido" : ""}${field.unique ? ", único" : ""}) agregado.${c.reset}`,
    );
  }

  rl.close();

  log(`\n${c.dim}Generando módulo "${table}"…${c.reset}`);

  const created: string[] = [];
  try {
    // Backend
    writeGenerated(join(backendDir, "types.ts"), genTypesTs(names, fields), created);
    writeGenerated(join(backendDir, "schema.ts"), genSchemaTs(names, fields), created);
    writeGenerated(join(backendDir, "repository.ts"), genRepositoryTs(names, fields), created);
    writeGenerated(join(backendDir, "service.ts"), genServiceTs(names, fields), created);
    writeGenerated(join(backendDir, "controller.ts"), genControllerTs(names), created);
    writeGenerated(join(backendDir, "routes.ts"), genRoutesTs(names), created);

    // Migration
    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    const prefix = nextMigrationPrefix(migrationFiles);
    const migrationPath = join(MIGRATIONS_DIR, `${prefix}_${table}.sql`);
    writeGenerated(migrationPath, genMigrationSql(prefix, names, fields), created);

    // Register in server/api/index.ts (not tracked in `created` — it's an edit, not a new file)
    registerRoute(names);

    // Frontend
    writeGenerated(
      join(SRC_TYPES_DIR, `${singularSnake}.ts`),
      genFrontendTypeTs(names, fields),
      created,
    );
    writeGenerated(
      join(SRC_SERVICES_DIR, `${table}.service.ts`),
      genFrontendServiceTs(names, fields),
      created,
    );
    writeGenerated(
      join(SRC_HOOKS_DIR, `use${names.PascalPlural}.ts`),
      genFrontendHookTs(names),
      created,
    );
    writeGenerated(join(frontendPageDir, "page.tsx"), genFrontendPageTsx(names, fields), created);

    log(
      `${c.green}✔ ${created.length} archivo(s) creado(s), migración ${prefix}_${table}.sql generada.${c.reset}`,
    );

    formatWithBiome(projectRoot, [...created, INDEX_TS]);
  } catch (err) {
    log(`${c.red}✖ Falló la generación: ${err instanceof Error ? err.message : err}${c.reset}`);
    for (const path of created) {
      try {
        unlinkSync(path);
      } catch {
        // best effort cleanup
      }
    }
    process.exitCode = 1;
    return;
  }

  const rl2 = createInterface({ input: process.stdin, output: process.stdout });
  const runNow = await askYesNo(rl2, "\n¿Ejecutar la migración ahora (db:migrate)?");
  rl2.close();

  if (runNow) {
    const pm = detectPackageManager();
    log(`\n${c.dim}Ejecutando ${pm} run db:migrate…${c.reset}`);
    const ok = runMigration(projectRoot, pm);
    log(
      ok
        ? `${c.green}✔ Migración aplicada.${c.reset}`
        : `${c.yellow}⚠ La migración falló — ejecútala manualmente.${c.reset}`,
    );
  }

  log(`\n${c.bold}${c.green}Listo!${c.reset} Módulo "${table}" creado.`);
  if (!runNow) log(`  Ejecuta ${c.cyan}db:migrate${c.reset} para crear la tabla.`);
  log(`  Reinicia ${c.cyan}dev${c.reset} si estaba corriendo.`);
  log(`  Visita ${c.cyan}/${table}${c.reset} (requiere sesión) para ver el CRUD.\n`);
}

main().catch((err) => {
  console.error(`${c.red}✖ ${err?.message ?? err}${c.reset}`);
  process.exit(1);
});
