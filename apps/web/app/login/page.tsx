"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form
        onSubmit={onSubmit}
        style={{ background: "#1a1d24", padding: 32, borderRadius: 12, width: 320, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Meu Assessor</h1>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#999" }}>
          WhatsApp
          <input
            type="text"
            value={whatsappPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+5511999998888"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#999" }}>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0f1115",
  border: "1px solid #2a2d34",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#e8e8e8",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 0",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
