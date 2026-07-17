import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth";
import type { AppEnv } from "../../types";
import { usersController } from "./controller";
import { createUserSchema, updateUserSchema, userIdParamSchema } from "./schema";

/**
 * /api/v1/users
 * All routes require authentication; writes require the `admin` role.
 */
export const usersRoutes = new Hono<AppEnv>();

usersRoutes.use("*", requireAuth);

usersRoutes.get("/", usersController.list);

usersRoutes.get("/:id", zValidator("param", userIdParamSchema), usersController.getById);

usersRoutes.post(
  "/",
  requireRole("admin"),
  zValidator("json", createUserSchema),
  usersController.create,
);

usersRoutes.patch(
  "/:id",
  requireRole("admin"),
  zValidator("param", userIdParamSchema),
  zValidator("json", updateUserSchema),
  usersController.update,
);

usersRoutes.delete(
  "/:id",
  requireRole("admin"),
  zValidator("param", userIdParamSchema),
  usersController.remove,
);
