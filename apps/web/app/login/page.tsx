"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "../components/ThemeToggle";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [whatsappPhone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsappPhone, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const { error } = await res.json();
      setError(error ?? "Erro ao entrar.");
      return;
    }

    router.push(searchParams.get("next") ?? "/");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <ThemeToggle />
      </div>

      <form onSubmit={onSubmit} className="panel" style={{ width: 340, padding: 32 }}>
        <p className="eyebrow">extrato digital</p>
        <h1 style={{ fontSize: 22, marginTop: 4 }}>Meu Assessor</h1>
        <hr className="hairline" style={{ margin: "20px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="eyebrow">WhatsApp</span>
            <input
              type="text"
              value={whatsappPhone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+5511999998888"
              required
              className="field mono"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="eyebrow">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="field"
            />
          </label>

          {error && (
            <p style={{ color: "var(--vermelho)", fontSize: 13, margin: 0 }} role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: 6 }}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </div>
      </form>
    </main>
  );
}
