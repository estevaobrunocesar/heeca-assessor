"use client";

import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";

type Settings = { enabled: boolean; email: string; emailConfigured: boolean };

export function MonthlyReviewCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/monthly-review")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSettings(data));
  }, []);

  async function toggle() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reports/monthly-review", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !settings.enabled }),
    });
    setBusy(false);
    if (!res.ok) return setError("Não foi possível salvar.");
    setSettings({ ...settings, enabled: !settings.enabled });
  }

  if (!settings) return null;

  return (
    <div className="card" style={{ padding: 18, marginTop: 20, maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CalendarCheck size={16} color="var(--muted)" />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Fechamento do mês por e-mail</span>
        <span className={`pill ${settings.enabled ? "pill-green" : "pill-muted"}`} style={{ marginLeft: "auto" }}>
          {settings.enabled ? "Ativado" : "Desativado"}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
        No começo de cada mês, para <strong style={{ color: "var(--ink)" }}>{settings.email}</strong>: o resultado do mês que fechou comparado ao anterior (por exemplo,
        &quot;15% acima do mês anterior&quot;), onde você mais gastou e as categorias que passaram da sua média.
      </p>
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10, fontSize: 13 }} onClick={toggle} disabled={busy}>
        {settings.enabled ? "Desativar" : "Ativar fechamento do mês"}
      </button>
      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
