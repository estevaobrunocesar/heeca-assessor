"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "../components/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Não foi possível enviar o e-mail agora. Tente de novo em instantes.");
      return;
    }

    setSent(true);
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 360 }}>
        <Logo />
        <h2 style={{ fontSize: 22, marginTop: 24 }}>Esqueceu sua senha?</h2>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 6 }}>
          Informe seu e-mail e mandamos um link pra você escolher uma senha nova.
        </p>

        {sent ? (
          <p style={{ color: "var(--green)", fontSize: 14, marginTop: 24 }}>
            Se esse e-mail estiver cadastrado, você vai receber o link em instantes. Pode fechar essa página.
          </p>
        ) : (
          <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                required
                className="field"
              />
            </label>

            {error && (
              <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }} role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>
              {loading ? "Enviando…" : "Enviar link"}
            </button>
          </form>
        )}

        <Link href="/login" style={{ display: "block", marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
          ← Voltar pro login
        </Link>
      </div>
    </main>
  );
}
