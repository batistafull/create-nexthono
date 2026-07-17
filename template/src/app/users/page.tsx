"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUsers } from "@/hooks/useUsers";
import { formatDate } from "@/utils/formatDate";
import { LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function UsersPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { users, loading, error, refresh } = useUsers();

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          {user && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Sesión: {user.email} ({user.role})
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw size={16} /> Recargar
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut size={16} /> Salir
          </Button>
        </div>
      </header>

      {loading && <p className="text-sm text-[var(--muted-foreground)]">Cargando…</p>}
      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error} — ¿iniciaste sesión?
        </p>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2 text-[var(--muted-foreground)]">
                    {formatDate(u.date_entered)}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Sin usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
