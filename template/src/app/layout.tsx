import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexthono",
  description: "Next.js + Hono full-stack starter",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
