"use client";

import { Suspense, useEffect, useState } from "react";
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
  // Second step: set once the password was right but the account has MFA on.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null);

  // An error coming back from the portal sign-in, and the address of the portal button.
  useEffect(() => {
    const ssoError = searchParams.get("sso_error");
    if (ssoError) setError(ssoError);
    fetch("/api/portal").then((r) => r.json()).then((d) => setSsoUrl(d.ssoUrl)).catch(() => {});
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = mfaToken
      ? await fetch("/api/login/mfa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mfaToken, code }),
        })
      : await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

    setLoading(false);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (data.expired) {
        setMfaToken(null);
        setPassword("");
      }
      setCode("");
      setError(data.error ?? "Erro ao entrar.");
      return;
    }

    if (data.mfaRequired) {
      setMfaToken(data.mfaToken);
      setCode("");
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
          <h2 style={{ fontSize: 24 }}>{mfaToken ? "Verificação em duas etapas" : "Bem-vindo de volta"}</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 6 }}>{mfaToken
              ? useRecovery
                ? "Digite um dos seus códigos de recuperação"
                : "Digite o código de 6 dígitos do seu aplicativo autenticador"
              : "Acesse sua conta para continuar"}</p>
          {mfaToken ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 28 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>
                  {useRecovery ? "Código de recuperação" : "Código"}
                </span>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode={useRecovery ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  placeholder={useRecovery ? "XXXXX-XXXXX" : "000000"}
                  required
                  className="field"
                  style={{ letterSpacing: useRecovery ? 1 : 4, textAlign: "center", fontSize: 18 }}
                />
              </label>

              {error && (
                <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }} role="alert">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading || !code} className="btn btn-primary" style={{ marginTop: 8, justifyContent: "center" }}>
                {loading ? "Verificando…" : "Verificar"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setUseRecovery((v) => !v);
                  setCode("");
                  setError(null);
                }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--primary)" }}
              >
                {useRecovery ? "Usar o código do aplicativo" : "Perdi acesso ao aplicativo"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaToken(null);
                  setCode("");
                  setError(null);
                }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}
              >
                Voltar
              </button>
            </div>
          ) : (

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
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Senha</span>
                <a href="/esqueci-senha" style={{ fontSize: 12, color: "var(--primary)" }}>
                  Esqueceu a senha?
                </a>
              </div>
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
            {ssoUrl && (
              <a href={ssoUrl} className="btn btn-ghost" style={{ justifyContent: "center", textDecoration: "none" }}>
                Entrar com conta Heeca
              </a>
            )}
          </div>
          )}
        </form>
      </div>
    </main>
  );
}
