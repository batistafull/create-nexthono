# Nexthono

Full-stack TypeScript starter: **Next.js (App Router) + Hono**, organized by
domain/feature, running on **Cloudflare Workers** with **D1** and JWT auth.

## Stack

| Capa      | Tecnología                                              |
| --------- | ------------------------------------------------------- |
| Frontend  | Next.js, TypeScript, Tailwind CSS v4, Zustand, Lucide    |
| Backend   | Hono (montado en `/api`), TypeScript, Zod               |
| Database  | Cloudflare D1 (SQLite) · local vía wrangler/miniflare    |
| Runtime   | Cloudflare Workers vía OpenNext (`@opennextjs/cloudflare`) |
| Auth      | JWT (`hono/jwt`) + bcryptjs                             |
| Linter    | Biome                                                   |

## Arquitectura

```
Frontend (src/)                      Backend (server/api/)
  pages (app/)                         index.ts  → basePath /api
  hooks/ ─┐                            v1/
  store/  │                              auth/  routes→controller→service
  services/ ──HTTP──▶ /api/v1 ─────▶     users/ routes→controller→service→repository
                                       database/ client · base · migrations · seeds
```

Flujo de una petición:

```
Request → Routes → Middleware → Controller → Service → Repository → D1
```

### Reglas del proyecto

- **Base de datos**: toda tabla incluye los campos base obligatorios
  (`id`, `date_entered`, `date_modified`, `create_by`, `modified_by`, `deleted`).
  Ver [`server/api/database/base.ts`](server/api/database/base.ts).
- Los componentes **no** llaman a `fetch` directamente → usan `hooks` → `services`.

## Primeros pasos

```bash
pnpm install

# Una sola vez: crea la D1 y pega el database_id en wrangler.jsonc
npx wrangler d1 create nexthono
pnpm cf-typegen               # genera worker-configuration.d.ts (tipa el binding)

pnpm db:migrate               # aplica migraciones en la D1 local
pnpm db:seed                  # crea el usuario admin
pnpm dev                      # http://localhost:3000
```

> Tras `cf-typegen`, borra `cloudflare-env.d.ts` (era un puente temporal; el
> binding ya lo tipa `worker-configuration.d.ts`).

### Credenciales del seed

```
email:    admin@nexthono.dev
password: admin1234
```

## Despliegue

```bash
pnpm db:migrate:remote        # aplica migraciones en la D1 desplegada
pnpm db:seed:remote           # (opcional) siembra el admin en remoto
npx wrangler secret put JWT_SECRET
pnpm deploy                   # build OpenNext + wrangler deploy
```

## Scripts

| Comando                  | Descripción                                     |
| ------------------------ | ----------------------------------------------- |
| `pnpm dev`               | Servidor de desarrollo Next.js                  |
| `pnpm build`             | Build de producción (Next)                      |
| `pnpm preview`           | Build OpenNext + preview en workerd local       |
| `pnpm deploy`            | Build OpenNext + `wrangler deploy`              |
| `pnpm cf-typegen`        | Genera los tipos del binding (`wrangler types`) |
| `pnpm lint`              | Biome check                                     |
| `pnpm lint:fix`          | Biome check con autofix                         |
| `pnpm db:migrate`        | Aplica migraciones en la D1 local               |
| `pnpm db:migrate:remote` | Aplica migraciones en la D1 desplegada          |
| `pnpm db:seed`           | Inserta datos base local (idempotente)          |
| `pnpm db:seed:remote`    | Inserta datos base en remoto                    |
| `pnpm db:reset`          | Dropea tablas, re-migra y re-siembra (local)    |

## API

| Método | Ruta                  | Auth  | Descripción              |
| ------ | --------------------- | ----- | ------------------------ |
| GET    | `/api/health`         | —     | Healthcheck              |
| POST   | `/api/v1/auth/login`  | —     | Login → `{ token, user }`|
| POST   | `/api/v1/auth/register` | —   | Registro                 |
| POST   | `/api/v1/auth/logout` | Bearer| Logout (cliente)         |
| GET    | `/api/v1/auth/me`     | Bearer| Usuario actual           |
| GET    | `/api/v1/users`       | Bearer| Lista de usuarios        |
| GET    | `/api/v1/users/:id`   | Bearer| Usuario por id           |
| POST   | `/api/v1/users`       | admin | Crear usuario            |
| PATCH  | `/api/v1/users/:id`   | admin | Actualizar usuario       |
| DELETE | `/api/v1/users/:id`   | admin | Soft delete              |

## Estructura

```
src/
├── app/                     # Next.js App Router
│   ├── api/[[...route]]/     # monta Hono
│   ├── login/  users/        # vistas
│   └── layout.tsx  page.tsx
├── components/ui/  hooks/  services/  store/  lib/  types/  utils/
server/
└── api/
    ├── index.ts             # app Hono
    ├── database/            # client (D1) · base · migrations/ · seeds
    ├── middleware/          # auth · error
    ├── lib/                 # jwt · http-error
    └── v1/{auth,users}/     # routes · controller · service · repository · schema · types

wrangler.jsonc               # Worker + binding D1
open-next.config.ts          # adaptador OpenNext
```
