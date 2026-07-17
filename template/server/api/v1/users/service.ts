import bcrypt from "bcryptjs";
import { conflict, notFound } from "../../lib/http-error";
import { userRepository } from "./repository";
import { type CreateUserInput, type UpdateUserInput, type User, toPublicUser } from "./types";

const SALT_ROUNDS = 10;

/** Business logic for users. Returns public (hash-free) users to callers. */
export const userService = {
  list(): User[] {
    return userRepository.findAll().map(toPublicUser);
  },

  getById(id: string): User {
    const user = userRepository.findById(id);
    if (!user) throw notFound("User not found");
    return toPublicUser(user);
  },

  async create(input: CreateUserInput, actorId: string | null = null): Promise<User> {
    if (userRepository.findByEmail(input.email)) {
      throw conflict("Email already in use");
    }
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const created = userRepository.create(
      {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role ?? "user",
      },
      actorId,
    );
    return toPublicUser(created);
  },

  async update(id: string, input: UpdateUserInput, actorId: string | null = null): Promise<User> {
    const existing = userRepository.findById(id);
    if (!existing) throw notFound("User not found");

    if (input.email && input.email !== existing.email) {
      const clash = userRepository.findByEmail(input.email);
      if (clash && clash.id !== id) throw conflict("Email already in use");
    }

    const passwordHash = input.password
      ? await bcrypt.hash(input.password, SALT_ROUNDS)
      : undefined;

    const updated = userRepository.update(
      id,
      {
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash,
      },
      actorId,
    );
    return toPublicUser(updated!);
  },

  remove(id: string, actorId: string | null = null): void {
    const ok = userRepository.softDelete(id, actorId);
    if (!ok) throw notFound("User not found");
  },
};
