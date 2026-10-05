"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { LINKS } from "./Sidebar";

// The four things used every day sit in the bar; everything else is under "Mais".
const MAIN_HREFS = ["/", "/lancamentos", "/contas-a-pagar", "/relatorios"];

/** Phone navigation (below 768px, see globals.css): a bottom bar with 4 main items and a "Mais" sheet. */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Going to another page closes the sheet.
  useEffect(() => setOpen(false), [pathname]);

  const main = MAIN_HREFS.map((href) => LINKS.find((l) => l.href === href)!).filter(Boolean);
  const rest = LINKS.filter((l) => !MAIN_HREFS.includes(l.href));
  const restActive = rest.some((l) => l.href === pathname);

  const itemStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 60,
    padding: "6px 2px",
    fontSize: 10.5,
    fontWeight: 600,
    textDecoration: "none",
    color: active ? "var(--primary)" : "var(--muted)",
    background: "none",
    border: "none",
    cursor: "pointer",
    minWidth: 0,
  });

  return (
    <>
      {open && (
        <>
          <div className="mobile-sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="mobile-sheet" role="dialog" aria-label="Mais opções">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }} className="keep-cols">
              {rest.map((l) => {
                const Icon = l.icon;
                const active = l.href === pathname;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "12px 4px",
                      borderRadius: 12,
                      fontSize: 11.5,
                      fontWeight: 600,
                      textDecoration: "none",
                      textAlign: "center",
                      color: active ? "#fff" : "var(--ink)",
                      background: active ? "var(--primary)" : "var(--field-bg)",
                    }}
                  >
                    <Icon size={20} strokeWidth={2} />
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      <nav className="mobile-nav" aria-label="Navegação principal">
        {main.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} style={itemStyle(l.href === pathname)}>
              <Icon size={20} strokeWidth={2} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{l.label === "Contas a pagar" ? "A pagar" : l.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen((v) => !v)} style={itemStyle(open || restActive)} aria-expanded={open}>
          <Ellipsis size={20} strokeWidth={2} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}
