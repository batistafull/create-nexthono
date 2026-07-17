import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";

/** Centralized error handler registered via `app.onError`. */
export function onError(err: Error, c: Context) {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status);
  }

  if (err instanceof ZodError) {
    return c.json({ error: "Validation failed", issues: err.flatten() }, 400);
  }

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  console.error("[api] Unhandled error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
}
