import type { User } from "@/types/user";
import { apiClient } from "./api.client";

export type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role?: "admin" | "user";
};

export type UpdateUserPayload = Partial<CreateUserPayload>;

/** Users HTTP calls. */
export const usersService = {
  getAll: () => apiClient.get<User[]>("/users"),

  getById: (id: string) => apiClient.get<User>(`/users/${id}`),

  create: (payload: CreateUserPayload) => apiClient.post<User>("/users", payload),

  update: (id: string, payload: UpdateUserPayload) =>
    apiClient.patch<User>(`/users/${id}`, payload),

  remove: (id: string) => apiClient.delete<void>(`/users/${id}`),
};
