"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Resumo" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/admin/contas", label: "Contas" },
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/categorias", label: "Categorias" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header style={{ borderBottom: "1px solid var(--linha)", background: "var(--paper)" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "16px 24px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18 }}>Meu Assessor</span>
          <span className="eyebrow">extrato digital</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ThemeToggle />
          <button
            onClick={logout}
            className="btn-ghost"
            style={{ background: "none", border: "none", color: "var(--muted)", fontWeight: 500 }}
          >
            Sair
          </button>
        </div>
      </div>

      <nav style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 24px 0", display: "flex", gap: 24 }}>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: active ? "var(--ink)" : "var(--muted)",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                paddingBottom: 12,
                borderBottom: active ? "2px solid var(--azul)" : "2px solid transparent",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
