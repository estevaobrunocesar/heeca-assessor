"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Landmark,
  CreditCard,
  CalendarClock,
  Tag,
  BarChart3,
  Target,
  Users,
  Settings,
} from "lucide-react";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { href: "/admin/contas", label: "Contas bancárias", icon: Landmark },
  { href: "/faturas", label: "Faturas", icon: CreditCard },
  { href: "/contas-a-pagar", label: "Contas a pagar", icon: CalendarClock },
  { href: "/admin/categorias", label: "Categorias", icon: Tag },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/planejamento", label: "Planejamento", icon: Target },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: collapsed ? 76 : 240,
        flexShrink: 0,
        background: "var(--sidebar-bg)",
        minHeight: "100vh",
        padding: "20px 14px",
        transition: "width 0.15s ease",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "0 6px", marginBottom: 28 }}>
        <Logo compact={collapsed} />
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "10px 12px",
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: "none",
                color: active ? "#ffffff" : "var(--sidebar-muted)",
                background: active ? "var(--primary)" : "transparent",
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={17} strokeWidth={2} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{link.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
