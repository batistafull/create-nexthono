import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth } from "../../middleware/auth";
import type { AppEnv } from "../../types";
import { authController } from "./controller";
import { loginSchema, registerSchema } from "./schema";

/**
 * /api/v1/auth
 *   POST /login     public
 *   POST /register  public
 *   POST /logout    authenticated (client discards token)
 *   GET  /me        authenticated
 */
export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", zValidator("json", loginSchema), authController.login);
authRoutes.post("/register", zValidator("json", registerSchema), authController.register);
authRoutes.post("/logout", requireAuth, authController.logout);
authRoutes.get("/me", requireAuth, authController.me);
