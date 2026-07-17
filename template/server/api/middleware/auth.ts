import type { MiddlewareHandler } from "hono";
import { unauthorized } from "../lib/http-error";
import { verifyToken } from "../lib/jwt";
import type { AppEnv } from "../types";

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * On success, attaches the decoded user to the context (`c.get("user")`).
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing bearer token");
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = await verifyToken(token);
    c.set("jwtPayload", payload);
    c.set("user", {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    });
  } catch {
    throw unauthorized("Invalid or expired token");
  }

  await next();
};

/** Requires the authenticated user to have one of the given roles. */
export function requireRole(...roles: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw unauthorized("Insufficient permissions");
    }
    await next();
  };
}
