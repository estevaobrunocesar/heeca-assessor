"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

export function PhoneLinkModal() {
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setNeedsPhone(!!me && !me.whatsappPhone))
      .catch(() => {});
  }, []);

  if (!needsPhone) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/link-phone", {
      method: "POST",
      body: JSON.stringify({ whatsappPhone: phone }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível vincular esse número.");
      return;
    }
    setNeedsPhone(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div className="card" style={{ padding: 28, maxWidth: 400, width: "90%" }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: "var(--green-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <MessageCircle size={19} color="var(--green)" />
        </div>
        <h2 style={{ fontSize: 17 }}>Vincule seu WhatsApp</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
          Informe o número que você vai usar para conversar com o Assessor. Mensagens de outros números não serão
          atendidas.
        </p>
        <form onSubmit={submit} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+5511999998888"
            required
            className="field"
          />
          {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ justifyContent: "center" }}>
            {submitting ? "Vinculando..." : "Vincular número"}
          </button>
        </form>
      </div>
    </div>
  );
}
