import bcrypt from "bcryptjs";
import { conflict, notFound } from "../../lib/http-error";
import { userRepository } from "./repository";
import { type CreateUserInput, type UpdateUserInput, type User, toPublicUser } from "./types";

const SALT_ROUNDS = 10;

/** Business logic for users. Returns public (hash-free) users to callers. */
export const userService = {
  async list(): Promise<User[]> {
    const users = await userRepository.findAll();
    return users.map(toPublicUser);
  },

  async getById(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) throw notFound("User not found");
    return toPublicUser(user);
  },

  async create(input: CreateUserInput, actorId: string | null = null): Promise<User> {
    if (await userRepository.findByEmail(input.email)) {
      throw conflict("Email already in use");
    }
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const created = await userRepository.create(
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
    const existing = await userRepository.findById(id);
    if (!existing) throw notFound("User not found");

    if (input.email && input.email !== existing.email) {
      const clash = await userRepository.findByEmail(input.email);
      if (clash && clash.id !== id) throw conflict("Email already in use");
    }

    const passwordHash = input.password
      ? await bcrypt.hash(input.password, SALT_ROUNDS)
      : undefined;

    const updated = await userRepository.update(
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

  async remove(id: string, actorId: string | null = null): Promise<void> {
    const ok = await userRepository.softDelete(id, actorId);
    if (!ok) throw notFound("User not found");
  },
};
