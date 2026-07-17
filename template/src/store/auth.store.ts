import { TOKEN_KEY } from "@/services/api.client";
import type { User } from "@/types/user";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setSession: (token: string, user: User) => void;
  setUser: (user: User | null) => void;
  clear: () => void;
};

/**
 * Global auth state, persisted to localStorage. The raw token is also mirrored
 * under TOKEN_KEY so the (non-React) api.client can read it synchronously.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setSession: (token, user) => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(TOKEN_KEY, token);
        }
        set({ token, user, isAuthenticated: true });
      },
      setUser: (user) => set({ user }),
      clear: () => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(TOKEN_KEY);
        }
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    { name: "nexthono.auth" },
  ),
);
