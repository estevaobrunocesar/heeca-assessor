import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <h1 style={{ fontSize: 24 }}>{title}</h1>
      <div
        className="card"
        style={{
          marginTop: 24,
          padding: 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--primary-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={22} color="var(--primary)" />
        </div>
        <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 360 }}>{description}</p>
      </div>
    </main>
  );
}
