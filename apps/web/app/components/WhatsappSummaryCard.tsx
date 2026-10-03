"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

type Settings = { enabled: boolean; phoneLinked: boolean; templateConfigured: boolean };

export function WhatsappSummaryCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/whatsapp-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSettings(data));
  }, []);

  async function toggle() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reports/whatsapp-summary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !settings.enabled }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error === "phone_not_linked" ? "Vincule seu número de WhatsApp primeiro." : "Não foi possível salvar.");
    }
    setSettings({ ...settings, enabled: !settings.enabled });
  }

  if (!settings) return null;

  return (
    <div className="card" style={{ padding: 18, marginTop: 20, maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle size={16} color="var(--muted)" />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Resumo semanal no WhatsApp</span>
        <span className={`pill ${settings.enabled ? "pill-green" : "pill-muted"}`} style={{ marginLeft: "auto" }}>
          {settings.enabled ? "Ativado" : "Desativado"}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
        Toda segunda-feira de manhã, como foi a semana anterior: receitas, despesas, onde mais gastou, contas a vencer e metas. A qualquer
        momento você também pode pedir &quot;resumo da semana&quot; pelo WhatsApp.
      </p>
      {!settings.templateConfigured && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          O WhatsApp só deixa o assistente escrever primeiro se você tiver falado com ele nas últimas 24 horas. Se não, o resumo não chega
          (peça &quot;resumo da semana&quot; quando quiser).
        </p>
      )}
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10, fontSize: 13 }} onClick={toggle} disabled={busy || (!settings.enabled && !settings.phoneLinked)}>
        {settings.enabled ? "Desativar" : "Ativar resumo semanal"}
      </button>
      {!settings.phoneLinked && <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 10 }}>Vincule seu número de WhatsApp para ativar.</span>}
      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
