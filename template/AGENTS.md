# AGENTS.md

Guía para agentes (y personas) que trabajan en este proyecto **Nexthono**: un
monorepo Next.js 15 (App Router) + Hono montado como API dentro del mismo
proceso de Next. La base de datos es SQLite vía `better-sqlite3`.

El objetivo de este documento es que puedas **añadir funcionalidad siguiendo los
patrones existentes** sin reinventar la estructura. El módulo `users` (backend) y
las páginas/servicios de usuarios (frontend) son la referencia canónica: cópialos.

---

## 1. Organización del proyecto

```
template/
├── .nexthono/                   # Herramientas del proyecto, separadas del código de la app
│   ├── create-module.ts        # Generador CRUD interactivo (pnpm nexthono-module, ver §7)
│   ├── add-field.ts            # Agrega campos a un módulo existente (pnpm nexthono-field, ver §8)
│   └── lib/shared.ts           # Helpers compartidos por ambos scripts
├── server/api/                 # Backend Hono (una sola app, montada en /api)
│   ├── index.ts                # App raíz: middlewares globales + montaje de v1
│   ├── types.ts                # AppEnv (variables de contexto: user, jwtPayload)
│   ├── lib/                    # Utilidades transversales
│   │   ├── env.ts              # Carga de variables de entorno
│   │   ├── http-error.ts       # HttpError + helpers (notFound, conflict, ...)
│   │   └── jwt.ts              # Firma/verificación de JWT
│   ├── middleware/
│   │   ├── auth.ts             # requireAuth, requireRole(...)
│   │   └── error.ts            # onError centralizado
│   ├── database/
│   │   ├── client.ts           # Conexión SQLite (única fuente de la conexión)
│   │   ├── base.ts             # Campos base obligatorios + helpers
│   │   ├── schema.sql          # Tabla _migrations (tracker)
│   │   ├── migrations.ts       # Runner de migraciones (pnpm db:migrate)
│   │   ├── migrations/         # *.sql con prefijo numérico (001_, 002_, ...)
│   │   └── seeds.ts            # Datos base idempotentes (pnpm db:seed)
│   └── v1/                     # API versionada
│       ├── auth/               # Módulo de autenticación
│       └── users/              # Módulo de referencia (CRUD completo)
│           ├── routes.ts       # Define endpoints + validación + middlewares
│           ├── controller.ts   # Capa HTTP: lee input, llama al service, responde
│           ├── service.ts      # Lógica de negocio (devuelve datos públicos)
│           ├── repository.ts   # ÚNICA capa que habla con la base de datos
│           ├── schema.ts       # Esquemas Zod de validación
│           └── types.ts        # Tipos del dominio (Row, público, inputs)
│
└── src/                        # Frontend Next.js (App Router)
    ├── app/                    # Rutas/páginas
    │   ├── api/[[...route]]/route.ts   # Puente Next -> app Hono
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── login/page.tsx
    │   └── users/page.tsx      # Página de referencia
    ├── components/ui/          # Componentes de UI (button, ...)
    ├── hooks/                  # Hooks de datos (useUsers, useAuth)
    ├── services/               # Clientes HTTP por dominio (+ api.client.ts)
    ├── store/                  # Estado global Zustand (auth.store.ts)
    ├── types/                  # Tipos compartidos del frontend
    ├── lib/                    # config.ts, utils.ts
    └── utils/                  # Helpers (formatDate, ...)
```

### Flujo de una petición

```
Componente/Hook → service (src/services) → api.client → fetch
   → /api/... (Next catch-all) → app Hono → routes → controller → service → repository → SQLite
```

### Alias de importación

- `@/*`      → `src/*`      (frontend)
- `@server/*` → `server/*`  (backend)

### Reglas de capas (no romper)

- **El controller nunca toca la base de datos.** Solo lee input validado, llama
  al service y da forma a la respuesta.
- **El service contiene la lógica de negocio** y devuelve datos "públicos" (sin
  campos sensibles como `password_hash`).
- **El repository es la única capa que ejecuta SQL.** Siempre respeta el borrado
  lógico (`deleted = 0`).
- Las respuestas exitosas se envuelven en `{ data: ... }`. Los errores en
  `{ error: "mensaje" }` (lo hace `onError`).

---

## 2. Cómo crear un módulo en el backend

Un módulo backend vive en `server/api/v1/<nombre>/` y tiene 6 archivos. Usa
`users` como plantilla. Ejemplo: crear un módulo `products`.

### Paso 1 — `types.ts`

Define la fila tal como se almacena (`ProductRow`, extiende `BaseFields`), el
tipo público, los inputs y (si aplica) una función para ocultar campos sensibles.

```ts
import type { BaseFields } from "../../database/base";

export type ProductRow = BaseFields & {
  name: string;
  price: number;
};

/** Producto seguro para exponer por la API. */
export type Product = ProductRow;

export type CreateProductInput = {
  name: string;
  price: number;
};

export type UpdateProductInput = Partial<CreateProductInput>;
```

> Si el registro tiene campos que no deben salir por la API (hashes, secretos),
> añade `type Product = Omit<ProductRow, "campo">` y una función `toPublicX(row)`
> como `toPublicUser` en `users/types.ts`.

### Paso 2 — `schema.ts` (validación Zod)

```ts
import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  price: z.number().positive(),
});

export const updateProductSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    price: z.number().positive().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field is required" });

export const productIdParamSchema = z.object({
  id: z.string().uuid("Invalid product id"),
});
```

### Paso 3 — `repository.ts` (única capa con SQL)

Usa siempre los helpers de `database/base.ts`:
`newBaseFields(actorId)` al insertar, `touchBaseFields(actorId)` al actualizar,
y `mapDeleted(row)` al leer (convierte el `deleted` 0/1 de SQLite en booleano).
Filtra siempre por `deleted = 0`.

```ts
import { mapDeleted, newBaseFields, touchBaseFields } from "../../database/base";
import { db } from "../../database/client";
import type { ProductRow } from "./types";

type RawProductRow = Omit<ProductRow, "deleted"> & { deleted: number };

export const productRepository = {
  findAll(): ProductRow[] {
    const rows = db
      .prepare("SELECT * FROM products WHERE deleted = 0 ORDER BY date_entered DESC")
      .all() as RawProductRow[];
    return rows.map((r) => mapDeleted(r));
  },

  findById(id: string): ProductRow | null {
    const row = db.prepare("SELECT * FROM products WHERE id = ? AND deleted = 0").get(id) as
      | RawProductRow
      | undefined;
    return row ? mapDeleted(row) : null;
  },

  create(data: { name: string; price: number }, actorId: string | null = null): ProductRow {
    const base = newBaseFields(actorId);
    db.prepare(
      `INSERT INTO products
         (id, date_entered, date_modified, create_by, modified_by, deleted, name, price)
       VALUES
         (@id, @date_entered, @date_modified, @create_by, @modified_by, @deleted, @name, @price)`,
    ).run({ ...base, name: data.name, price: data.price });
    return this.findById(base.id)!;
  },

  softDelete(id: string, actorId: string | null = null): boolean {
    const touch = touchBaseFields(actorId);
    const result = db
      .prepare(
        `UPDATE products SET deleted = 1, date_modified = @date_modified, modified_by = @modified_by
         WHERE id = @id AND deleted = 0`,
      )
      .run({ id, ...touch });
    return result.changes > 0;
  },
};
```

> Para `update`, construye el `SET` dinámicamente solo con los campos presentes,
> igual que `userRepository.update`.

### Paso 4 — `service.ts` (lógica de negocio)

Lanza errores con los helpers de `lib/http-error.ts` (`notFound`, `conflict`,
`badRequest`, ...). El `onError` los convierte en la respuesta HTTP correcta.

```ts
import { notFound } from "../../lib/http-error";
import { productRepository } from "./repository";
import type { CreateProductInput, Product } from "./types";

export const productService = {
  list(): Product[] {
    return productRepository.findAll();
  },

  getById(id: string): Product {
    const product = productRepository.findById(id);
    if (!product) throw notFound("Product not found");
    return product;
  },

  create(input: CreateProductInput, actorId: string | null = null): Product {
    return productRepository.create(input, actorId);
  },

  remove(id: string, actorId: string | null = null): void {
    const ok = productRepository.softDelete(id, actorId);
    if (!ok) throw notFound("Product not found");
  },
};
```

### Paso 5 — `controller.ts` (capa HTTP)

Nunca toca la base de datos. El actor autenticado se obtiene con
`c.get("user")`.

```ts
import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { productService } from "./service";
import type { CreateProductInput } from "./types";

export const productsController = {
  list(c: Context<AppEnv>) {
    return c.json({ data: productService.list() });
  },

  getById(c: Context<AppEnv>) {
    const { id } = c.req.param();
    return c.json({ data: productService.getById(id) });
  },

  async create(c: Context<AppEnv>) {
    const body = (await c.req.json()) as CreateProductInput;
    const actorId = c.get("user")?.id ?? null;
    return c.json({ data: productService.create(body, actorId) }, 201);
  },

  remove(c: Context<AppEnv>) {
    const { id } = c.req.param();
    productService.remove(id, c.get("user")?.id ?? null);
    return c.body(null, 204);
  },
};
```

### Paso 6 — `routes.ts` (endpoints + validación + auth)

`requireAuth` protege el módulo; `requireRole("admin")` protege las escrituras.
`zValidator` valida `param`/`json` antes de llegar al controller.

```ts
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth";
import type { AppEnv } from "../../types";
import { productsController } from "./controller";
import { createProductSchema, productIdParamSchema } from "./schema";

export const productsRoutes = new Hono<AppEnv>();

productsRoutes.use("*", requireAuth);

productsRoutes.get("/", productsController.list);
productsRoutes.get("/:id", zValidator("param", productIdParamSchema), productsController.getById);
productsRoutes.post(
  "/",
  requireRole("admin"),
  zValidator("json", createProductSchema),
  productsController.create,
);
productsRoutes.delete(
  "/:id",
  requireRole("admin"),
  zValidator("param", productIdParamSchema),
  productsController.remove,
);
```

### Paso 7 — Registrar el módulo

En [server/api/index.ts](server/api/index.ts), monta las rutas dentro de `v1`:

```ts
import { productsRoutes } from "./v1/products/routes";
// ...
v1.route("/products", productsRoutes);
```

### Paso 8 — Migración

El módulo necesita su tabla. Crea la migración (ver sección 4) antes de probar.

**Checklist de módulo backend:** types → schema → repository → service →
controller → routes → registrar en `index.ts` → migración → seed (opcional).

---

## 3. Cómo crear un módulo en el frontend

Un dominio en el frontend suele tener: **tipo** (`types/`), **servicio HTTP**
(`services/`), **hook de datos** (`hooks/`) y **página** (`app/`). Usa `users`
como referencia. Ejemplo: dominio `products`.

### Paso 1 — Tipo: `src/types/product.ts`

Refleja lo que devuelve la API (incluye los campos base).

```ts
export type Product = {
  id: string;
  date_entered: string;
  date_modified: string;
  create_by: string | null;
  modified_by: string | null;
  deleted: boolean;
  name: string;
  price: number;
};
```

### Paso 2 — Servicio: `src/services/products.service.ts`

Los componentes **nunca** llaman a `fetch` directamente: pasan por un servicio,
que usa `apiClient`. Las rutas son relativas a `config.apiBaseUrl` (`/api/v1`).

```ts
import type { Product } from "@/types/product";
import { apiClient } from "./api.client";

export type CreateProductPayload = { name: string; price: number };
export type UpdateProductPayload = Partial<CreateProductPayload>;

export const productsService = {
  getAll: () => apiClient.get<Product[]>("/products"),
  getById: (id: string) => apiClient.get<Product>(`/products/${id}`),
  create: (payload: CreateProductPayload) => apiClient.post<Product>("/products", payload),
  update: (id: string, payload: UpdateProductPayload) =>
    apiClient.patch<Product>(`/products/${id}`, payload),
  remove: (id: string) => apiClient.delete<void>(`/products/${id}`),
};
```

> `apiClient` inyecta automáticamente el `Authorization: Bearer <token>` desde
> `localStorage` y desenvuelve el `{ data: ... }` de la respuesta. Ante errores
> lanza `ApiError` con `status` y `message`.

### Paso 3 — Hook de datos: `src/hooks/useProducts.ts`

Encapsula carga + estados `loading`/`error` y expone `refresh`.

```ts
"use client";

import { ApiError } from "@/services/api.client";
import { productsService } from "@/services/products.service";
import type { Product } from "@/types/product";
import { useCallback, useEffect, useState } from "react";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await productsService.getAll());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { products, loading, error, refresh };
}
```

### Paso 4 — Página: `src/app/products/page.tsx`

Componente cliente (`"use client"`) que consume el hook. La sesión se lee con
`useAuth`. Usa las variables CSS de tema (`var(--muted-foreground)`, etc.) y los
componentes de `components/ui`. Copia la estructura de
[src/app/users/page.tsx](src/app/users/page.tsx).

```tsx
"use client";

import { useProducts } from "@/hooks/useProducts";

export default function ProductsPage() {
  const { products, loading, error, refresh } = useProducts();
  // ... render con loading/error/tabla, igual que users/page.tsx
}
```

### Estado global (Zustand)

Solo para estado que debe compartirse entre páginas (como la sesión en
[src/store/auth.store.ts](src/store/auth.store.ts)). Para datos de una lista,
basta el hook local. Si necesitas persistencia, usa el middleware `persist`.

**Checklist de módulo frontend:** tipo → servicio → hook → página. Enlázala en
la navegación si aplica.

---

## 4. Migraciones

El runner es [server/api/database/migrations.ts](server/api/database/migrations.ts):
forward-only, aplica en orden de nombre los `*.sql` de `database/migrations/` y
registra los aplicados en la tabla `_migrations`.

### Reglas

- Cada migración es un archivo `.sql` con **prefijo numérico incremental**:
  `001_init.sql`, `002_products.sql`, ... El orden de aplicación es el orden
  alfabético del nombre.
- **Toda tabla empieza por los 6 campos base obligatorios** (ver
  [server/api/database/base.ts](server/api/database/base.ts)):
  `id`, `date_entered`, `date_modified`, `create_by`, `modified_by`, `deleted`.
  Los campos del dominio van después.
- No edites una migración ya aplicada en otros entornos; crea una nueva.
- Cada migración se ejecuta dentro de una transacción.

### Crear una migración

Crea `server/api/database/migrations/002_products.sql`:

```sql
-- 002_products: tabla de productos.
-- Campos base primero; campos del dominio después.

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  date_entered  TEXT NOT NULL,
  date_modified TEXT NOT NULL,
  create_by     TEXT,
  modified_by   TEXT,
  deleted       INTEGER NOT NULL DEFAULT 0,

  -- domain fields
  name          TEXT NOT NULL,
  price         REAL NOT NULL DEFAULT 0
);

-- Índices que respeten el borrado lógico cuando necesites unicidad:
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_active
--   ON products (name) WHERE deleted = 0;
```

### Comandos

```bash
pnpm db:migrate          # Aplica migraciones pendientes
pnpm db:migrate --fresh  # Borra TODAS las tablas y reaplica desde cero
pnpm db:reset            # --fresh + seed (deja la BD lista para desarrollar)
```

> El bloque de columnas base también está disponible como constante
> `BASE_COLUMNS_SQL` en `base.ts` por si prefieres generarlo desde código.

---

## 5. Seeds

El seed vive en [server/api/database/seeds.ts](server/api/database/seeds.ts) y
debe ser **idempotente**: ejecutarlo dos veces no duplica datos. Comprueba antes
de insertar y salta si ya existe. Usa `newBaseFields(null)` para los campos base
(actor `null` porque no hay usuario autenticado al sembrar).

Actualmente siembra el usuario admin (`admin@nexthono.dev` / `admin1234`).

### Añadir datos al seed

```ts
// dentro de seed(), tras el bloque del admin:
const exists = db.prepare("SELECT id FROM products WHERE name = ? AND deleted = 0").get("Demo");
if (!exists) {
  const base = newBaseFields(null);
  db.prepare(
    `INSERT INTO products
       (id, date_entered, date_modified, create_by, modified_by, deleted, name, price)
     VALUES
       (@id, @date_entered, @date_modified, @create_by, @modified_by, @deleted, @name, @price)`,
  ).run({ ...base, name: "Demo", price: 9.99 });
  console.log("✅ Seeded demo product");
}
```

### Comandos

```bash
pnpm db:seed     # Ejecuta el seed (idempotente)
pnpm db:reset    # Reaplica migraciones desde cero y siembra
```

---

## 6. Comandos útiles

```bash
pnpm dev              # Next dev (frontend + API en el mismo proceso)
pnpm build            # Build de producción
pnpm lint             # Biome check
pnpm lint:fix         # Biome check --write
pnpm format           # Biome format --write
pnpm db:migrate       # Migraciones
pnpm db:seed          # Seeds
pnpm db:reset         # Reset completo de la BD
pnpm nexthono-module  # Generador interactivo de módulos CRUD (ver sección 7)
pnpm nexthono-field   # Agrega campos a un módulo existente (ver sección 8)
```

## 7. Generador de módulos (`pnpm nexthono-module`)

Automatiza todo el checklist de las secciones 2–4: crea el módulo backend
completo, el módulo frontend completo y su migración, siguiendo exactamente
los mismos patrones que `users`. El script vive en
[.nexthono/create-module.ts](.nexthono/create-module.ts), en una carpeta
oculta separada de `server/` y `src/` (mismo trato que `.gitignore` o `.env`:
se publica como `_nexthono/` dentro del paquete npm y se renombra a
`.nexthono/` al crear el proyecto).

```bash
pnpm nexthono-module
# o: npm run nexthono-module / yarn nexthono-module / bun run nexthono-module
```

### Flujo interactivo

1. **Nombre del módulo, en singular** (ej: `product`). El plural (para la
   tabla, las rutas y las carpetas) se deriva automáticamente con reglas
   simples de pluralización en inglés (`product` → `products`, `category` →
   `categories`, `box` → `boxes`). Si el módulo ya existe, el script se
   detiene sin tocar nada.
2. **Campos adicionales**, en bucle:

   ```
   ¿Desea agregar un campo adicional?
     1) Sí
     2) No
   ```

   Al elegir **1) Sí** pregunta, para ese campo:
   - **Nombre** (se normaliza a `snake_case`; no puede repetir un campo base
     ni uno ya agregado).
   - **Tipo de dato**: `string`, `integer`, `decimal`, `boolean` o `date`.
   - **Longitud máxima** (solo si el tipo es `string`; Enter para omitir).
   - **¿Es requerido?** (controla `NOT NULL` en SQL, si el campo es
     obligatorio en Zod/TypeScript, y si aparece marcado con `*` en el
     formulario del frontend).
   - **¿Debe ser único?** (agrega un `CREATE UNIQUE INDEX ... WHERE deleted
     = 0` en la migración y una validación de conflicto —
     `findBy<Campo>` + `409 Conflict`— en el service, igual que el email en
     `users`).

   El ciclo se repite hasta responder **2) No**. Los 6 campos base
   (`id`, `date_entered`, `date_modified`, `create_by`, `modified_by`,
   `deleted`) se agregan siempre automáticamente; no se piden.

3. Al terminar, genera **todos** los archivos y pregunta si quieres correr
   `db:migrate` de inmediato.

### Qué genera

**Backend** (`server/api/v1/<plural>/`): `types.ts`, `schema.ts`,
`repository.ts`, `service.ts`, `controller.ts`, `routes.ts` — más el registro
automático de las rutas en
[server/api/index.ts](server/api/index.ts) (import + `v1.route(...)`).
CRUD completo: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`,
con `requireAuth` en todas y `requireRole("admin")` en las de escritura,
igual que `users`.

**Migración**: `server/api/database/migrations/<NNN>_<plural>.sql` con el
siguiente prefijo numérico disponible.

**Frontend**: `src/types/<singular>.ts`, `src/services/<plural>.service.ts`,
`src/hooks/use<Plural>.ts` y `src/app/<plural>/page.tsx` — una página cliente
con listado, alta, edición y borrado (formulario + tabla), siguiendo el
mismo estilo visual que `src/app/users/page.tsx`.

Al final, el script ejecuta `biome check --write` sobre todos los archivos
tocados para dejarlos formateados según las reglas del proyecto.

### Limitaciones a tener en cuenta

- La pluralización es una heurística simple (reglas en inglés); para
  palabras irregulares (`person` → `persons` en vez de `people`) tendrás que
  renombrar la carpeta/tabla a mano después de generar el módulo.
- El generador no borra ni sobreescribe un módulo existente — si necesitas
  regenerarlo, borra los archivos manualmente primero.
- Los campos `unique` disparan una comprobación de conflicto básica
  (`findBy<Campo>` antes de crear/actualizar); para reglas de negocio más
  complejas, edita `service.ts` después de generar.

## 8. Agregar campos a un módulo existente (`pnpm nexthono-field`)

Complemento de `nexthono-module`: en vez de crear un módulo nuevo, agrega uno
o más campos a un módulo **ya existente**, editando in-place los mismos 7
archivos que tocaría `nexthono-module` (backend + frontend) en lugar de
regenerarlos, para no perder cambios manuales que hayas hecho después de
generarlos. El script vive en
[.nexthono/add-field.ts](.nexthono/add-field.ts) y comparte helpers con
`create-module.ts` en [.nexthono/lib/shared.ts](.nexthono/lib/shared.ts).

```bash
pnpm nexthono-field
```

### Flujo interactivo

1. **Lista de módulos existentes**, numerada — elige uno. Solo aparecen los
   módulos creados por `nexthono-module` (se detectan por tener un
   `repository.ts` con el helper `mapRow`). El módulo `users` **no aparece**:
   su `repository.ts` es a medida (hash de password, etc.) y no sigue el
   patrón genérico, así que no es seguro parchearlo automáticamente — agrega
   campos ahí a mano.
2. **Campos adicionales**, el mismo bucle y las mismas preguntas que
   `nexthono-module` (nombre, tipo, longitud, requerido, único — ver sección
   7). Si respondes **Sí** a "¿Es requerido?" en un campo que no es
   `boolean`, se pregunta además un **valor por defecto para las filas
   existentes**: SQLite exige un `DEFAULT` al agregar una columna `NOT NULL`
   con `ALTER TABLE` a una tabla que puede tener filas. Si además marcaste el
   campo como único y la tabla ya tiene más de una fila, el script te avisa
   que ese valor repetido hará fallar el índice único — tendrás que editar
   la migración generada para hacer un backfill con valores distintos por
   fila (ver ejemplo abajo) antes de correrla.
3. El ciclo se repite hasta responder **No**. Al terminar, parchea todos los
   archivos y pregunta si quieres correr `db:migrate` de inmediato.

### Qué modifica

- **Backend**: `types.ts`, `schema.ts`, `repository.ts` y (solo si algún
  campo nuevo es único) `service.ts`.
- **Frontend**: `src/types/<singular>.ts`, `src/services/<plural>.service.ts`
  y `src/app/<plural>/page.tsx` (agrega el campo al formulario, a la tabla y
  al estado). El hook `use<Plural>.ts` no necesita cambios (es genérico).
- **Migración nueva**: `server/api/database/migrations/<NNN>_add_<campo>_to_<plural>.sql`
  (o `..._add_fields_to_<plural>.sql` si agregaste varios a la vez), con un
  `ALTER TABLE ... ADD COLUMN` por campo y los `CREATE UNIQUE INDEX`
  correspondientes — **nunca** edita una migración anterior.
- `controller.ts` y `routes.ts` no cambian (son genéricos, no dependen de los
  campos del dominio).

Todo-o-nada: si algún archivo no coincide con el patrón esperado (porque lo
editaste a mano de una forma que el parcheador no reconoce), **no se escribe
ningún archivo** y el script te pide agregar el campo manualmente. Al final,
igual que `nexthono-module`, corre `biome check --write` sobre los archivos
tocados.

### Ejemplo: backfill de un campo único y requerido

Si agregaste `sku` (string, requerido, único, default `'SKU-DEFAULT'`) a una
tabla `products` que ya tiene filas, la migración generada falla porque todas
las filas existentes reciben el mismo `sku`. Antes de correrla, edítala para
darle un valor distinto a cada fila:

```sql
ALTER TABLE products ADD COLUMN sku TEXT NOT NULL DEFAULT 'SKU-DEFAULT';
UPDATE products SET sku = 'SKU-' || id WHERE sku = 'SKU-DEFAULT';
ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_active
  ON products (sku) WHERE deleted = 0;
```

## 9. Convenciones rápidas

- **SQLite ↔ TS:** `deleted` se guarda como `0/1`; usa `mapDeleted` al leer.
  Nunca borres físicamente, usa `softDelete`.
- **Auditoría:** propaga siempre el `actorId` (`c.get("user")?.id ?? null`) hasta
  el repository para rellenar `create_by`/`modified_by`.
- **Errores:** en el backend lanza `HttpError` con los helpers de `http-error.ts`;
  no devuelvas códigos a mano. En el frontend captura `ApiError`.
- **Respuestas:** éxito = `{ data }`; error = `{ error }`.
- **Formato:** este proyecto usa Biome. Ejecuta `pnpm lint:fix` antes de terminar.
