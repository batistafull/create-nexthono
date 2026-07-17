import bcrypt from "bcryptjs";
import { unauthorized } from "../../lib/http-error";
import { signToken } from "../../lib/jwt";
import { userRepository } from "../users/repository";
import { userService } from "../users/service";
import { toPublicUser } from "../users/types";
import type { AuthResult, LoginInput, RegisterInput } from "./types";

/**
 * Authentication business logic. Reuses the users repository/service — auth
 * does not own its own table (JWT is stateless, so logout is client-side).
 */
export const authService = {
  async login(input: LoginInput): Promise<AuthResult> {
    const row = userRepository.findByEmail(input.email);
    // Same error whether the email is unknown or the password is wrong.
    if (!row) throw unauthorized("Invalid credentials");

    const ok = await bcrypt.compare(input.password, row.password_hash);
    if (!ok) throw unauthorized("Invalid credentials");

    const user = toPublicUser(row);
    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { token, user };
  },

  async register(input: RegisterInput): Promise<AuthResult> {
    // Public registration always creates a plain "user".
    const user = await userService.create({ ...input, role: "user" });
    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { token, user };
  },

  me(userId: string) {
    return userService.getById(userId);
  },
};
