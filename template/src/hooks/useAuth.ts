"use client";

import { ApiError } from "@/services/api.client";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import type { LoginPayload, RegisterPayload } from "@/types/auth";
import { useCallback, useState } from "react";

/** Auth actions bound to the global store. Keeps components free of logic. */
export function useAuth() {
  const { user, isAuthenticated, setSession, clear } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setLoading(true);
      setError(null);
      try {
        const { token, user } = await authService.login(payload);
        setSession(token, user);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Login failed");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [setSession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setLoading(true);
      setError(null);
      try {
        const { token, user } = await authService.register(payload);
        setSession(token, user);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Registration failed");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore — clearing the client session is what matters.
    }
    clear();
  }, [clear]);

  return { user, isAuthenticated, loading, error, login, register, logout };
}
