import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { authService } from "./service";
import type { LoginInput, RegisterInput } from "./types";

export const authController = {
  async login(c: Context<AppEnv>) {
    const body = (await c.req.json()) as LoginInput;
    const result = await authService.login(body);
    return c.json({ data: result });
  },

  async register(c: Context<AppEnv>) {
    const body = (await c.req.json()) as RegisterInput;
    const result = await authService.register(body);
    return c.json({ data: result }, 201);
  },

  /**
   * JWT is stateless, so logout is a no-op on the server — the client simply
   * discards the token. Endpoint exists for symmetry and future token
   * blacklisting if needed.
   */
  logout(c: Context<AppEnv>) {
    return c.json({ data: { success: true } });
  },

  async me(c: Context<AppEnv>) {
    const user = c.get("user");
    return c.json({ data: await authService.me(user.id) });
  },
};
