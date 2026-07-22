import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sign, verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";

/** Data we embed in the token. */
export type AuthTokenPayload = JWTPayload & {
  sub: string; // user id
  email: string;
  role: string;
};

const ALG = "HS256";
const DEV_SECRET = "dev-super-secret-change-me";

/**
 * Secrets come from the Cloudflare binding (per request), NOT from module-scope
 * `process.env` — bindings don't exist at import time on Workers. Set them in
 * `.dev.vars` locally and with `wrangler secret put JWT_SECRET` in production.
 */
function env() {
  return getCloudflareContext().env;
}

function getSecret(): string {
  return env().JWT_SECRET ?? DEV_SECRET;
}

function expiresInSeconds(): number {
  const raw = env().JWT_EXPIRES_IN ?? "7d";
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) return 60 * 60 * 24 * 7;
  const value = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
  return value * factor;
}

export async function signToken(payload: Omit<AuthTokenPayload, "exp" | "iat">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ ...payload, iat: now, exp: now + expiresInSeconds() }, getSecret(), ALG);
}

export async function verifyToken(token: string): Promise<AuthTokenPayload> {
  return (await verify(token, getSecret(), ALG)) as AuthTokenPayload;
}
