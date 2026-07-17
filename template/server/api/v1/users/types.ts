import type { BaseFields } from "../../database/base";

/** A user row exactly as stored (includes the password hash). */
export type UserRow = BaseFields & {
  name: string;
  email: string;
  password_hash: string;
  role: string;
};

/** A user safe to expose over the API (no password hash). */
export type User = Omit<UserRow, "password_hash">;

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role?: string;
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
};

/** Strip the password hash before returning a user to clients. */
export function toPublicUser(row: UserRow): User {
  const { password_hash: _hash, ...rest } = row;
  return rest;
}
