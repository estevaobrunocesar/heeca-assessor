"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, TriangleAlert } from "lucide-react";
import { MfaCard } from "../components/MfaCard";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    const res = await fetch("/api/workspace/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "heeca-assist-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);

    const res = await fetch("/api/workspace", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: confirmText }),
    });

    setDeleting(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Não foi possível excluir.");
      return;
    }

    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <h1 style={{ fontSize: 24 }}>Configurações</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>Segurança, dados e privacidade</p>

      <MfaCard />

      <div className="card" style={{ padding: 18, marginTop: 24, maxWidth: 560 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Exportar meus dados</div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
          Baixa um arquivo com todos os usuários, contas, categorias e lançamentos do seu workspace.
        </p>
        <button onClick={exportData} className="btn btn-ghost" style={{ marginTop: 12 }}>
          <Download size={14} /> Exportar (.json)
        </button>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 20, maxWidth: 560, borderColor: "var(--red)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--red)" }}>
          <TriangleAlert size={16} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Excluir workspace permanentemente</span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
          Apaga todos os usuários, contas, categorias e lançamentos do seu workspace. Não pode ser desfeito. Exporte
          seus dados antes, se quiser guardar.
        </p>
        <form onSubmit={deleteWorkspace} style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Digite o nome do workspace pra confirmar"
            className="field"
            style={{ flex: "1 1 220px" }}
          />
          <button
            type="submit"
            disabled={deleting || !confirmText}
            className="btn"
            style={{ background: "var(--red)", color: "#fff" }}
          >
            {deleting ? "Excluindo…" : "Excluir tudo"}
          </button>
        </form>
        {error && (
          <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }} role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
