"use client";

import { ApiError } from "@/services/api.client";
import { usersService } from "@/services/users.service";
import type { User } from "@/types/user";
import { useCallback, useEffect, useState } from "react";

/** Loads and exposes the users list with loading/error state. */
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await usersService.getAll());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { users, loading, error, refresh };
}
