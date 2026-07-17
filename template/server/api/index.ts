import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { onError } from "./middleware/error";
import type { AppEnv } from "./types";
import { authRoutes } from "./v1/auth/routes";
import { usersRoutes } from "./v1/users/routes";

/**
 * Root Hono application. Mounted by Next.js at /api (see
 * src/app/api/[[...route]]/route.ts), so routes are declared with the /api
 * prefix as their base path.
 */
export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", logger());
app.use("*", cors());
app.onError(onError);

app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

// Versioned API
const v1 = new Hono<AppEnv>();
v1.route("/auth", authRoutes);
v1.route("/users", usersRoutes);

app.route("/v1", v1);

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export type AppType = typeof app;
