"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Resumo" },
  { href: "/lancamentos", label: "Lançamentos" },
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
    <nav style={{ display: "flex", gap: 20, alignItems: "center", padding: "16px 32px", borderBottom: "1px solid #2a2d34" }}>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          style={{
            color: pathname === link.href ? "#3b82f6" : "#999",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: pathname === link.href ? 600 : 400,
          }}
        >
          {link.label}
        </Link>
      ))}
      <button
        onClick={logout}
        style={{ marginLeft: "auto", background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 13 }}
      >
        Sair
      </button>
    </nav>
  );
}
