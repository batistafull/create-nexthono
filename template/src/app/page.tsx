import { ArrowRight, Database, KeyRound, Server } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Nexthono</h1>
        <p className="text-lg text-[var(--muted-foreground)]">
          Next.js (App Router) + Hono, layered by domain, with SQLite and JWT auth.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        <Feature icon={<Server size={18} />} title="Hono API">
          Versioned routes at <code>/api/v1</code> — routes → controller → service → repository.
        </Feature>
        <Feature icon={<Database size={18} />} title="SQLite">
          Migrations & seeds with mandatory base fields on every table.
        </Feature>
        <Feature icon={<KeyRound size={18} />} title="JWT Auth">
          Login / logout, protected routes, role-based access.
        </Feature>
      </ul>

      <div className="flex gap-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Ir al login <ArrowRight size={16} />
        </Link>
        <Link
          href="/users"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--muted)]"
        >
          Ver usuarios
        </Link>
      </div>
    </main>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-[var(--border)] p-4">
      <div className="mb-2 flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      <p className="text-sm text-[var(--muted-foreground)]">{children}</p>
    </li>
  );
}
