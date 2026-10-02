"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "../components/Logo";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("As senhas não são iguais.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Não foi possível redefinir a senha.");
      return;
    }

    router.push("/login");
  }

  if (!token) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: "var(--red)" }}>Link inválido. Peça uma nova redefinição de senha.</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={onSubmit} style={{ width: 360 }}>
        <Logo />
        <h2 style={{ fontSize: 22, marginTop: 24 }}>Escolha uma nova senha</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Nova senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="field" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Confirmar senha</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} className="field" />
          </label>

          {error && (
            <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }} role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: "center" }}>
            {loading ? "Salvando…" : "Salvar nova senha"}
          </button>
        </div>
      </form>
    </main>
  );
}
