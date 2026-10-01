"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Sparkles, TrendingUp } from "lucide-react";
import { Logo } from "../components/Logo";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const FEATURES = [
  { icon: MessageCircle, text: "Registre suas despesas e receitas por voz ou mensagem" },
  { icon: Sparkles, text: "Organize suas finanças de forma simples e rápida" },
  { icon: TrendingUp, text: "Acompanhe seus resultados em tempo real" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
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
      body: JSON.stringify({ email, password }),
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
    <main style={{ minHeight: "100vh", display: "flex" }}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 56px",
          background: "linear-gradient(160deg, #0a0a0c 0%, #1a0a0c 60%, #2a0d10 100%)",
          color: "#f4f4f5",
        }}
        className="login-aside"
      >
        <Logo />
        <h1 style={{ fontSize: 30, fontWeight: 700, marginTop: 40, lineHeight: 1.25 }}>
          Seu assistente financeiro,
          <br />
          sempre com você.
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 48 }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(225, 29, 46, 0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={17} color="#ff6b76" />
                </div>
                <p style={{ fontSize: 14, color: "#c5c5ca", marginTop: 7, lineHeight: 1.4 }}>{f.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          padding: 24,
        }}
      >
        <form onSubmit={onSubmit} style={{ width: 340 }}>
          <h2 style={{ fontSize: 24 }}>Bem-vindo de volta</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 6 }}>Acesse sua conta para continuar</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 28 }}>
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

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Senha</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="field"
              />
            </label>

            {error && (
              <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }} role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: 8, justifyContent: "center" }}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
