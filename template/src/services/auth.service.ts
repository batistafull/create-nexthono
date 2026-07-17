import type { AuthResult, LoginPayload, RegisterPayload } from "@/types/auth";
import type { User } from "@/types/user";
import { apiClient } from "./api.client";

/** Auth HTTP calls. Components/hooks never touch fetch directly. */
export const authService = {
  login: (payload: LoginPayload) => apiClient.post<AuthResult>("/auth/login", payload),

  register: (payload: RegisterPayload) => apiClient.post<AuthResult>("/auth/register", payload),

  logout: () => apiClient.post<{ success: boolean }>("/auth/logout"),

  me: () => apiClient.get<User>("/auth/me"),
};
