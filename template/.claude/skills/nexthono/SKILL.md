# Estructura para un projecto React / Hono

## Tecnologia

### linters
- [biomejs](https://biomejs.dev/)

### Frontend

- [Nextjs](https://nextjs.org/)
- [Typescript](https://www.typescriptlang.org/)
- [Tailwinds](https://tailwindcss.com/)
- [Shadcn](https://ui.shadcn.com/)
- [Lucide React](https://lucide.dev/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Wytext](https://www.npmjs.com/package/@batistafull/wytext)

### Backend

- [Honojs](https://hono.dev/)
- [Typescript](https://www.typescriptlang.org/)

### Database

- sqlite (local)
- [D1 (remote)](https://developers.cloudflare.com/d1/)

## Esctructura

La estructura corresponde a una arquitectura full-stack TypeScript con:

Frontend: nextjs
Backend: Hono
Base de datos: sistema propio de migraciones, schemas y seeds
API: organizada por versiones (/v1)
Arquitectura: separada por capas y dominios

### Visión general de la arquitectura

┌──────────────────────────────┐
│          Next.js             │
│                              │
│  pages                       │
│  components                  │
│  hooks                       │
│  services ────────┐          │
│  store            │          │
└──────────┬────────┘          │
           │ HTTP / API        │
           ▼                   │
┌──────────────────────────────┐
│          Hono Server         │
│                              │
│  /api                        │
│    /v1                       │
│      /auth                   │
│      /users                  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│          Database            │
│                              │
│  schemas.sql                 │
│  migrations                  │
│  seeds                       │
└──────────────────────────────┘

La separación principal es correcta:

Frontend
    ↓
Services / HTTP Client
    ↓
Hono Routes
    ↓
Controllers
    ↓
Models / Database

### Análisis del frontend

/src
├── components
├── hooks
├── lib
├── pages
├── routes
├── store
├── utils
├── services
├── types
├── App.tsx
└── App.css

#### /components

Componentes reutilizables:

Ejemplo:

components/
├── Button.tsx
├── Modal.tsx
├── Navbar.tsx
└── UserCard.tsx

Deberían ser componentes principalmente visuales.

Evita que un componente como:

```tsx
<UserList />
```

tenga directamente:

fetch("/api/v1/users")

Es mejor:

components
    ↓
hooks
    ↓
services

#### /pages

Muy buena separación para las vistas principales:

pages/
├── LoginPage.tsx
├── DashboardPage.tsx
├── UsersPage.tsx
└── NotFoundPage.tsx

La página puede combinar componentes y hooks:

```tsx
export function UsersPage() {
  const { users, loading } = useUsers();

  return (
    <UserTable
      users={users}
      loading={loading}
    />
  );
}
```

#### /hooks

Aquí colocarías lógica reutilizable de React:

hooks/
├── useAuth.ts
├── useUsers.ts
├── useDebounce.ts
└── usePagination.ts

Ejemplo:

const { users, loading, error } = useUsers();

Los hooks son una buena capa para evitar que las páginas se llenen de lógica.

#### /services

Esta carpeta es especialmente importante en tu arquitectura:

services/
├── auth.service.ts
├── users.service.ts
└── api.client.ts

Ejemplo:

```ts
// users.service.ts

import { apiClient } from "./api.client";

export const usersService = {
  getAll: () => apiClient.get("/users"),

  getById: (id: string) =>
    apiClient.get(`/users/${id}`),
};
```

Así tus componentes no conocen detalles de HTTP.

#### /lib

Normalmente para configuraciones y librerías internas:

lib/
├── http.ts
├── queryClient.ts
├── validation.ts
└── constants.ts

La diferencia entre lib y utils debe ser clara.

lib

Lógica relacionada con herramientas o infraestructura:

lib/
├── api-client.ts
├── database-client.ts
└── logger.ts

#### /utils

Funciones pequeñas y genéricas:

utils/
├── formatDate.ts
├── formatCurrency.ts
└── capitalize.ts

### Análisis del backend Hono

Tu backend:

/server
└── api
    ├── database
    ├── migrations
    ├── seeds.ts
    ├── migrations.ts
    ├── schemas.sql
    └── v1
        ├── auth
        │   ├── Controllers.ts
        │   ├── Models.ts
        │   └── Routes.ts
        └── users
            ├── Controllers.ts
            ├── Models.ts
            └── Routes.ts

La idea es correcta: estás usando una organización por dominio o feature.

Por ejemplo:

/auth
/users

Cada módulo contiene:

Routes
    ↓
Controllers
    ↓
Models
    ↓
Database

#### Flujo recomendado en Hono

La petición debería seguir este flujo:

HTTP Request
     │
     ▼
Routes
     │
     ▼
Middleware
     │
     ▼
Controller
     │
     ▼
Service
     │
     ▼
Model / Repository
     │
     ▼
Database

Actualmente tienes:

/Routes
/Controllers
/Models

Funciona, pero yo añadiría una capa de Services.

Ejemplo recomendado

users/
├── routes.ts
├── controller.ts
├── service.ts
├── repository.ts
├── schema.ts
└── types.ts

#### routes.ts

Responsabilidad: definir endpoints.

```ts
app.get("/", getUsers);
app.get("/:id", getUserById);
app.post("/", createUser);
```

#### controller.ts

Responsabilidad: HTTP.

```ts
export async function getUsers(c: Context) {
  const users = await userService.getAll();

  return c.json(users);
}
```

El controller no debería contener demasiada lógica de negocio.

#### service.ts

Responsabilidad: negocio.

```ts
export const userService = {
  async getAll() {
    return userRepository.findAll();
  },

  async create(data: CreateUserInput) {
    // Validaciones de negocio
    return userRepository.create(data);
  },
};
```

#### repository.ts

Responsabilidad: base de datos.

```ts
export const userRepository = {
  async findAll() {
    return db.query.users.findMany();
  },
};
```

Esta separación hace que el código sea más fácil de probar.

#### schema.ts

Para validación:

```ts
const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});
```

#### types.ts

Para tipos:

```ts
export type User = {
  id: string;
  name: string;
  email: string;
};
```

Para acceso a base de datos.

La versión de API está bien planteada

Esta parte es buena:

/v1
├── auth
└── users

Tu API podría quedar:

/api/v1/auth/login
/api/v1/auth/register
/api/v1/users
/api/v1/users/:id

Esto permite evolucionar posteriormente:

/api/v1/users
/api/v2/users

Sin romper inmediatamente los clientes existentes.

#### Base de datos

Actualmente tienes:

database/
migrations/
seeds.ts
migrations.ts
schemas.sql

Aquí intentaría evitar duplicación de responsabilidades.

Una estructura más clara sería:

database/
├── client.ts
├── schema.ts
├── migrations/
│   ├── 001_initial.sql
│   └── 002_add_users.sql
└── seed.ts

Si usas SQL manual:

database/
├── connection.ts
├── schemas.sql
├── migrations/
└── seeds.ts

La clave es que exista una única fuente de verdad para la estructura de la base de datos.

## Estructura final

/
├── public/
│   └── favicon.ico
│
├── src/
│   ├── components/
│   │   ├── ui/
│   │   └── layout/
│   │
│   ├── pages/
│   │   ├── auth/
│   │   │   └── LoginPage.tsx
│   │   └── users/
│   │       └── UsersPage.tsx
│   │
│   ├── routes/
│   │   └── AppRoutes.tsx
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useUsers.ts
│   │
│   ├── services/
│   │   ├── api.client.ts
│   │   ├── auth.service.ts
│   │   └── users.service.ts
│   │
│   ├── store/
│   │   └── auth.store.ts
│   │
│   ├── lib/
│   │   ├── config.ts
│   │   └── validation.ts
│   │
│   ├── types/
│   │   ├── auth.ts
│   │   └── user.ts
│   │
│   ├── utils/
│   │   └── formatDate.ts
│   │
│   ├── App.tsx
│   ├── App.css
│   └── index.tsx
│
├── server/
│   └── api/
│       ├── database/
│       │   ├── client.ts
│       │   ├── schema.ts
│       │   └── migrations/
│       │
│       ├── middleware/
│       │   ├── auth.ts
│       │   └── error.ts
│       │
│       ├── v1/
│       │   ├── auth/
│       │   │   ├── routes.ts
│       │   │   ├── controller.ts
│       │   │   ├── service.ts
│       │   │   ├── repository.ts
│       │   │   └── schema.ts
│       │   │
│       │   └── users/
│       │       ├── routes.ts
│       │       ├── controller.ts
│       │       ├── service.ts
│       │       ├── repository.ts
│       │       ├── schema.ts
│       │       └── types.ts
│       │
│       └── index.ts
│
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md

## Reglas

en la carpeta de rules se encuentra la regla para programar
