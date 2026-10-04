export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" style={{ flexShrink: 0 }}>
        <rect width="34" height="34" rx="9" fill="var(--primary)" />
        <path d="M10 22V15" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M17 22V11" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M24 22V18" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {!compact && (
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--sidebar-ink)" }}>Heeca</div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "var(--primary)" }}>
            ASSIST
          </div>
        </div>
      )}
    </div>
  );
}
