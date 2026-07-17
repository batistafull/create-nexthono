import type { AuthTokenPayload } from "./lib/jwt";

/** Shape of the current authenticated user attached to the context. */
export type AuthUser = {
  id: string;
  email: string;
  role: string;
};

/** Hono environment: variables available on `c.get(...)` across the app. */
export type AppEnv = {
  Variables: {
    user: AuthUser;
    jwtPayload: AuthTokenPayload;
  };
};
