import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { userService } from "./service";
import type { CreateUserInput, UpdateUserInput } from "./types";

/** HTTP layer: reads validated input, calls the service, shapes the response. */
export const usersController = {
  async list(c: Context<AppEnv>) {
    return c.json({ data: await userService.list() });
  },

  async getById(c: Context<AppEnv>) {
    const { id } = c.req.param();
    return c.json({ data: await userService.getById(id) });
  },

  async create(c: Context<AppEnv>) {
    const body = (await c.req.json()) as CreateUserInput;
    const actorId = c.get("user")?.id ?? null;
    const user = await userService.create(body, actorId);
    return c.json({ data: user }, 201);
  },

  async update(c: Context<AppEnv>) {
    const { id } = c.req.param();
    const body = (await c.req.json()) as UpdateUserInput;
    const actorId = c.get("user")?.id ?? null;
    const user = await userService.update(id, body, actorId);
    return c.json({ data: user });
  },

  async remove(c: Context<AppEnv>) {
    const { id } = c.req.param();
    const actorId = c.get("user")?.id ?? null;
    await userService.remove(id, actorId);
    return c.body(null, 204);
  },
};
