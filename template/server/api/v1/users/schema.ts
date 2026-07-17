import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "user"]).optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(["admin", "user"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const userIdParamSchema = z.object({
  id: z.string().uuid("Invalid user id"),
});
