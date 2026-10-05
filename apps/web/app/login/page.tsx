"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "../components/Logo";

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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 384 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", marginBottom: 24 }}>
          <Logo compact onLight size={44} />
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
            Heeca <span style={{ color: "var(--primary)", fontWeight: 500 }}>Assist</span>
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Seu assistente financeiro, sempre com você</p>
        </div>
        <div className="card" style={{ padding: 24 }}>
        <form onSubmit={onSubmit} style={{ width: "100%" }}>
          <h2 style={{ fontSize: 18 }}>{mfaToken ? "Verificação em duas etapas" : "Bem-vindo de volta"}</h2>
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
      </div>
    </main>
  );
}
