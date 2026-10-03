"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Matches = { uncategorized: number; other: number };

// Applies a keyword rule to entries that already exist. Shows the counts first, and by
// default touches only entries with no category; reclassifying the rest is a separate choice.
export function ApplyRuleButton({ ruleId, keyword }: { ruleId: string; keyword: string }) {
  const router = useRouter();
  const [matches, setMatches] = useState<Matches | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/category-keywords/${ruleId}/matches`);
    setBusy(false);
    if (!res.ok) return setMessage("Não foi possível verificar.");
    const data: Matches = await res.json();
    if (data.uncategorized + data.other === 0) return setMessage("Nenhum lançamento antigo para ajustar.");
    setMatches(data);
  }

  async function apply(mode: "uncategorized" | "all") {
    setBusy(true);
    const res = await fetch(`/api/category-keywords/${ruleId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setBusy(false);
    setMatches(null);
    if (!res.ok) return setMessage("Não foi possível aplicar.");
    const { updated } = await res.json();
    setMessage(`${updated} lançamento${updated === 1 ? "" : "s"} atualizado${updated === 1 ? "" : "s"}.`);
    router.refresh();
  }

  if (matches) {
    return (
      <div style={{ fontSize: 12, textAlign: "left", lineHeight: 1.6 }}>
        <div>
          &quot;{keyword}&quot; aparece em <strong>{matches.uncategorized}</strong> sem categoria e <strong>{matches.other}</strong> em outra categoria.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {matches.uncategorized > 0 && (
            <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: "3px 10px" }} disabled={busy} onClick={() => apply("uncategorized")}>
              Aplicar nos {matches.uncategorized} sem categoria
            </button>
          )}
          {matches.other > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "3px 10px" }}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Isso troca a categoria de ${matches.other} lançamento(s) que já têm outra categoria. Continuar?`)) apply("all");
              }}
            >
              Também reclassificar os {matches.other} de outra categoria
            </button>
          )}
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setMatches(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <span style={{ fontSize: 12 }}>
      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }} disabled={busy} onClick={check}>
        Aplicar aos antigos
      </button>
      {message && <span style={{ marginLeft: 8, color: "var(--muted)" }}>{message}</span>}
    </span>
  );
}
