"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Bell, ChevronDown, Moon, Sun, LogOut } from "lucide-react";

type Me = { name: string; role: "ADMIN" | "USER" };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));

    const current = document.documentElement.getAttribute("data-theme") as "light" | "dark" | null;
    setTheme(current ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 28px",
        borderBottom: "1px solid var(--card-border)",
      }}
    >
      <button
        onClick={onToggleSidebar}
        className="icon-btn"
        aria-label="Alternar menu lateral"
        style={{ border: "1px solid var(--card-border)" }}
      >
        <Menu size={18} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="icon-btn" style={{ border: "1px solid var(--card-border)", position: "relative" }} aria-label="Notificações">
          <Bell size={17} />
        </button>

        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: 8,
              color: "var(--ink)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--primary)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {me ? initials(me.name) : "—"}
            </div>
            {me && (
              <div style={{ textAlign: "left", lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{me.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {me.role === "ADMIN" ? "Administrador" : "Usuário"}
                </div>
              </div>
            )}
            <ChevronDown size={15} color="var(--muted)" />
          </button>

          {menuOpen && (
            <div
              className="card"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: 180,
                padding: 6,
                zIndex: 20,
              }}
            >
              <button
                onClick={toggleTheme}
                className="menu-item" style={menuItemStyle}
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                {theme === "dark" ? "Tema claro" : "Tema escuro"}
              </button>
              <button onClick={logout} className="menu-item" style={{ ...menuItemStyle, color: "var(--red)" }}>
                <LogOut size={15} />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "9px 10px",
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 500,
  color: "var(--ink)",
};
