import { sign, verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";

const secret = process.env.JWT_SECRET ?? "dev-super-secret-change-me";

/** Data we embed in the token. */
export type AuthTokenPayload = JWTPayload & {
  sub: string; // user id
  email: string;
  role: string;
};

function expiresInSeconds(): number {
  const raw = process.env.JWT_EXPIRES_IN ?? "7d";
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) return 60 * 60 * 24 * 7;
  const value = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
  return value * factor;
}

const ALG = "HS256";

export async function signToken(payload: Omit<AuthTokenPayload, "exp" | "iat">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ ...payload, iat: now, exp: now + expiresInSeconds() }, secret, ALG);
}

export async function verifyToken(token: string): Promise<AuthTokenPayload> {
  return (await verify(token, secret, ALG)) as AuthTokenPayload;
}
