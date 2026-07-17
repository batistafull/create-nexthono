"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("admin@nexthono.dev");
  const [password, setPassword] = useState("admin1234");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await login({ email, password });
    if (ok) router.push("/users");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-[var(--border)] p-8"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Usa las credenciales del seed para probar.
          </p>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:ring-2"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:ring-2"
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
