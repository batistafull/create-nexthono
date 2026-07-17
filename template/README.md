# Nexthono

Full-stack TypeScript starter: **Next.js (App Router) + Hono**, organized by
domain/feature, with SQLite (local) / D1 (remote) and JWT authentication.

## Stack

| Capa      | Tecnología                                              |
| --------- | ------------------------------------------------------- |
| Frontend  | Next.js, TypeScript, Tailwind CSS v4, Zustand, Lucide    |
| Backend   | Hono (montado en `/api`), TypeScript, Zod               |
| Database  | better-sqlite3 (local) · Cloudflare D1 (remote)         |
| Auth      | JWT (`hono/jwt`) + bcryptjs                             |
| Linter    | Biome                                                   |

## Arquitectura

```
Frontend (src/)                      Backend (server/api/)
  pages (app/)                         index.ts  → basePath /api
  hooks/ ─┐                            v1/
  store/  │                              auth/  routes→controller→service
  services/ ──HTTP──▶ /api/v1 ─────▶     users/ routes→controller→service→repository
                                       database/ client · schema · migrations · seeds
```

Flujo de una petición:

```
Request → Routes → Middleware → Controller → Service → Repository → SQLite
```

### Reglas del proyecto

- **Base de datos**: toda tabla incluye los campos base obligatorios
  (`id`, `date_entered`, `date_modified`, `create_by`, `modified_by`, `deleted`).
  Ver [`server/api/database/base.ts`](server/api/database/base.ts).
- Los componentes **no** llaman a `fetch` directamente → usan `hooks` → `services`.

## Primeros pasos

```bash
pnpm install
pnpm db:migrate     # crea las tablas
pnpm db:seed        # crea el usuario admin
pnpm dev            # http://localhost:3000
```

### Credenciales del seed

```
email:    admin@nexthono.dev
password: admin1234
```

## Scripts

| Comando           | Descripción                                    |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Servidor de desarrollo Next.js                 |
| `pnpm build`      | Build de producción                            |
| `pnpm start`      | Sirve el build                                 |
| `pnpm lint`       | Biome check                                    |
| `pnpm lint:fix`   | Biome check con autofix                        |
| `pnpm db:migrate` | Aplica migraciones (`--fresh` recrea todo)     |
| `pnpm db:seed`    | Inserta datos base (idempotente)               |
| `pnpm db:reset`   | Recrea la base de datos y vuelve a sembrar     |

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
    ├── database/            # client · base · schema · migrations · seeds
    ├── middleware/          # auth · error
    ├── lib/                 # jwt · http-error · env
    └── v1/{auth,users}/     # routes · controller · service · repository · schema · types
```
