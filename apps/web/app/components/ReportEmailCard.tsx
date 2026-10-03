"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

type Frequency = "NONE" | "WEEKLY" | "MONTHLY";
type Settings = { frequency: Frequency; email: string; emailConfigured: boolean };

const OPTIONS: { value: Frequency; label: string; hint: string }[] = [
  { value: "NONE", label: "Desativado", hint: "Você não recebe nada por e-mail." },
  { value: "WEEKLY", label: "Semanal", hint: "Toda segunda-feira, com a semana anterior (segunda a domingo)." },
  { value: "MONTHLY", label: "Mensal", hint: "No dia 1º, com o mês anterior completo." },
];

export function ReportEmailCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/reports/email")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSettings(data));
  }, []);

  async function choose(frequency: Frequency) {
    if (!settings || frequency === settings.frequency) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/reports/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequency }),
    });
    setBusy(false);
    if (!res.ok) return setMessage({ text: "Não foi possível salvar.", error: true });
    setSettings({ ...settings, frequency });
  }

  async function sendNow() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/reports/email", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return setMessage({ text: `Enviado para ${data.email}. Confira a caixa de entrada (e o spam).` });
    setMessage({
      text: res.status === 503 ? "O envio de e-mail ainda não está configurado neste servidor." : "Não foi possível enviar agora. Tente de novo.",
      error: true,
    });
  }

  if (!settings) return null;
  const current = OPTIONS.find((o) => o.value === settings.frequency)!;

  return (
    <div className="card" style={{ padding: 18, marginTop: 20, maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Mail size={16} color="var(--muted)" />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Receber por e-mail</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
        Resumo com PDF e Excel anexos, enviado para <strong style={{ color: "var(--ink)" }}>{settings.email}</strong>.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={busy}
            onClick={() => choose(o.value)}
            className={`tab ${settings.frequency === o.value ? "tab-active" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{current.hint}</p>
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10, fontSize: 13 }} onClick={sendNow} disabled={busy}>
        Enviar agora o último período
      </button>
      {message && (
        <p role={message.error ? "alert" : "status"} style={{ fontSize: 13, marginTop: 10, color: message.error ? "var(--red)" : "var(--green)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
