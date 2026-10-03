"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Copy, Download } from "lucide-react";

type Status = { enabled: boolean; recoveryCodesLeft: number };
type Setup = { secret: string; qrDataUrl: string };

async function call(action: string, body?: object) {
  const res = await fetch(`/api/mfa/${action}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

export function MfaCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { ok, data } = await call("status");
    if (ok) setStatus(data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function startSetup() {
    setError(null);
    setBusy(true);
    const { ok, data } = await call("setup", {});
    setBusy(false);
    if (!ok) return setError("Não foi possível iniciar a configuração.");
    setSetup(data);
    setCode("");
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { ok, data } = await call("enable", { code });
    setBusy(false);
    if (!ok) return setError("Código incorreto. Confira o aplicativo e tente de novo.");
    setSetup(null);
    setCode("");
    setRecoveryCodes(data.recoveryCodes);
    refresh();
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { ok, status: httpStatus, data } = await call("disable", { password, code });
    setBusy(false);
    if (!ok) {
      if (httpStatus === 429) return setError(`Muitas tentativas. Tente de novo em ${data.retryAfterMinutes ?? 15} minutos.`);
      return setError(data.error === "password" ? "Senha incorreta." : "Código incorreto.");
    }
    setDisabling(false);
    setPassword("");
    setCode("");
    refresh();
  }

  function downloadCodes() {
    const blob = new Blob(
      [`Códigos de recuperação — Heeca Assessor\nCada código funciona uma única vez.\n\n${(recoveryCodes ?? []).join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "heeca-codigos-de-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const Icon = status?.enabled ? ShieldCheck : ShieldOff;

  return (
    <div className="card" style={{ padding: 18, marginTop: 24, maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} color={status?.enabled ? "var(--green)" : "var(--muted)"} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Autenticação em duas etapas (MFA)</span>
        {status && (
          <span className={`pill ${status.enabled ? "pill-green" : "pill-muted"}`} style={{ marginLeft: "auto" }}>
            {status.enabled ? "Ativada" : "Desativada"}
          </span>
        )}
      </div>

      {recoveryCodes ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            <strong style={{ color: "var(--ink)" }}>Guarde estes códigos agora.</strong> Eles só aparecem esta vez. Se você perder o
            celular, cada código entra uma única vez no lugar do aplicativo.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              marginTop: 12,
              padding: 14,
              background: "var(--field-bg)",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 14,
            }}
          >
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}>
              <Copy size={14} /> Copiar
            </button>
            <button type="button" className="btn btn-ghost" onClick={downloadCodes}>
              <Download size={14} /> Baixar .txt
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setRecoveryCodes(null)}>
              Já guardei
            </button>
          </div>
        </div>
      ) : setup ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            1. Abra um aplicativo autenticador (Google Authenticator, Authy, 1Password…) e leia o QR code.
            <br />
            2. Digite abaixo o código de 6 dígitos que o aplicativo mostrar.
          </p>
          <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="QR code para o aplicativo autenticador" width={160} height={160} style={{ background: "#fff", borderRadius: 8, padding: 6 }} />
            <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 260 }}>
              Sem câmera? Digite esta chave no aplicativo:
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--ink)", marginTop: 6, wordBreak: "break-all" }}>{setup.secret}</div>
            </div>
          </div>
          <form onSubmit={confirmSetup} style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              required
              className="field"
              style={{ width: 130, textAlign: "center", letterSpacing: 4 }}
            />
            <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary">
              Confirmar e ativar
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setSetup(null); setError(null); }}>
              Cancelar
            </button>
          </form>
        </div>
      ) : status?.enabled ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Ao entrar, além da senha será pedido o código do aplicativo. Códigos de recuperação restantes:{" "}
            <strong style={{ color: status.recoveryCodesLeft <= 2 ? "var(--red)" : "var(--ink)" }}>{status.recoveryCodesLeft}</strong>
            {status.recoveryCodesLeft <= 2 && " — poucos; desative e ative de novo para gerar novos."}
          </p>
          {disabling ? (
            <form onSubmit={disable} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" required className="field" style={{ flex: "1 1 160px" }} />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código do app ou de recuperação" required className="field" style={{ flex: "1 1 200px" }} />
              <button type="submit" disabled={busy} className="btn" style={{ background: "var(--red)", color: "#fff" }}>
                Desativar MFA
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setDisabling(false); setError(null); }}>
                Cancelar
              </button>
            </form>
          ) : (
            <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setDisabling(true)}>
              Desativar
            </button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Uma camada a mais de proteção: além da senha, o login pede um código do seu celular. Opcional — fica desativada até você ativar.
          </p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={startSetup} disabled={busy || !status}>
            Ativar MFA
          </button>
        </div>
      )}

      {error && (
        <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
