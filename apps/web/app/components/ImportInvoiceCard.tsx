"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";

type Item = {
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  type: "EXPENSE" | "INCOME" | "ADJUSTMENT";
  categoryId: string | null;
  categoryLabel: string | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  duplicate: boolean;
};
type Staged = { documentType: string; items: Item[]; skippedLines: number; truncated: boolean };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const TYPE_LABEL = { EXPENSE: "Compra", INCOME: "Estorno/crédito", ADJUSTMENT: "Pagamento da fatura" } as const;

// Some browsers send an empty type for .csv/.xlsx files.
function guessType(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

export function ImportInvoiceCard({ accountId, cardName }: { accountId: string; cardName: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<{ batchId: string; imported: number; skipped: number } | null>(null);
  const [undone, setUndone] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setDone(null);
    setUndone(false);
    if (file.size > 10 * 1024 * 1024) return setError("O arquivo passa de 10 MB.");

    setBusy(true);
    const res = await fetch(`/api/imports/preview?accountId=${encodeURIComponent(accountId)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || guessType(file.name) },
      body: file,
    }).catch(() => null);
    setBusy(false);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setError(data?.message ?? "Não consegui ler esse arquivo. Tente de novo.");

    setStaged(data);
    setKept(new Set((data.items as Item[]).flatMap((it, i) => (it.duplicate ? [] : [i]))));
  }

  async function confirm() {
    if (!staged) return;
    setBusy(true);
    setError(null);
    const items = staged.items
      .filter((_, i) => kept.has(i))
      .map((it) => ({
        date: it.date,
        description: it.description,
        merchant: it.merchant,
        amount: it.amount,
        type: it.type,
        categoryId: it.categoryId,
        installmentNo: it.installmentNo,
        installmentTotal: it.installmentTotal,
      }));
    const res = await fetch("/api/imports/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, items }),
    });
    setBusy(false);
    if (!res.ok) return setError("Não foi possível importar. Tente de novo.");
    setDone(await res.json());
    setStaged(null);
    router.refresh();
  }

  async function undo() {
    if (!done) return;
    setBusy(true);
    const res = await fetch("/api/imports/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: done.batchId }),
    });
    setBusy(false);
    if (res.ok) {
      setUndone(true);
      router.refresh();
    } else setError("Não foi possível desfazer.");
  }

  function toggle(i: number) {
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const chosen = staged ? staged.items.filter((_, i) => kept.has(i)) : [];
  const sum = (type: Item["type"]) => chosen.filter((i) => i.type === type).reduce((s, i) => s + i.amount, 0);
  const duplicates = staged ? staged.items.filter((i) => i.duplicate).length : 0;

  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <input ref={input} type="file" accept=".pdf,.csv,.xlsx,application/pdf,text/csv" onChange={onFile} hidden />

      {!staged && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
            <FileUp size={14} /> {busy ? "Lendo o arquivo…" : "Importar fatura"}
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {busy ? "Pode levar até 1 minuto." : `PDF, CSV ou Excel da fatura do ${cardName}. Você confere antes de gravar.`}
          </span>
        </div>
      )}

      {done && !staged && (
        <p role="status" style={{ fontSize: 13, marginTop: 10, color: undone ? "var(--muted)" : "var(--green)" }}>
          {undone
            ? "Importação desfeita."
            : done.imported === 0
              ? "Nada novo para importar: tudo já estava registrado."
              : `${done.imported} lançamentos importados${done.skipped ? ` (${done.skipped} já existiam e foram ignorados)` : ""}. `}
          {!undone && done.imported > 0 && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={undo} disabled={busy}>
              Desfazer
            </button>
          )}
        </p>
      )}

      {staged && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            Prévia da {staged.documentType === "EXTRATO_CONTA" ? "importação" : "fatura"} — {staged.items.length} linhas lidas
          </div>
          {staged.documentType === "EXTRATO_CONTA" && (
            <p style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>
              Isso parece um extrato de conta, não uma fatura de cartão. Confira se escolheu o arquivo certo.
            </p>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 13 }}>
            <span>
              Compras: <strong>{brl(sum("EXPENSE"))}</strong>
            </span>
            {sum("INCOME") > 0 && (
              <span>
                Estornos: <strong>{brl(sum("INCOME"))}</strong>
              </span>
            )}
            {sum("ADJUSTMENT") > 0 && (
              <span>
                Pagamentos: <strong>{brl(sum("ADJUSTMENT"))}</strong>
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Compare o total de compras com o da sua fatura. Desmarque o que não quiser importar.
            {duplicates > 0 && ` ${duplicates} já registradas vêm desmarcadas.`}
            {staged.skippedLines > 0 && ` ${staged.skippedLines} linhas sem data válida foram ignoradas.`}
            {staged.truncated && " O arquivo era grande: li só o começo."}
          </p>

          <div style={{ maxHeight: 340, overflow: "auto", marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {staged.items.map((it, i) => (
                  <tr key={i} style={{ opacity: kept.has(i) ? 1 : 0.5 }}>
                    <td>
                      <input type="checkbox" checked={kept.has(i)} aria-label={`Importar ${it.description}`} onChange={() => toggle(i)} />
                    </td>
                    <td>{dm(it.date)}</td>
                    <td>
                      {it.description}
                      {it.installmentNo && (
                        <span style={{ color: "var(--muted)" }}>
                          {" "}
                          ({it.installmentNo}/{it.installmentTotal})
                        </span>
                      )}
                      {it.duplicate && (
                        <span className="pill pill-muted" style={{ marginLeft: 6 }}>
                          já registrado
                        </span>
                      )}
                      {it.type !== "EXPENSE" && (
                        <span className="pill pill-muted" style={{ marginLeft: 6 }}>
                          {TYPE_LABEL[it.type]}
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{it.categoryLabel ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>{brl(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={confirm}>
              {busy ? "Importando…" : `Importar ${chosen.length} lançamentos`}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setStaged(null);
                setError(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}
