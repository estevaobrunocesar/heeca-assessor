import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "../../../lib/api";

type Detail = {
  id: string;
  status: "CONFIRMED" | "PENDING_REVIEW" | "DELETED";
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
  amount: number;
  description: string;
  date: string;
  createdAt: string;
  category: { name: string; parent: string | null } | null;
  user: string;
  person: string | null;
  account: string | null;
  toAccount: string | null;
  merchant: string | null;
  installment: { no: number; total: number | null } | null;
  origin: "WHATSAPP_TEXT" | "WHATSAPP_AUDIO" | "WHATSAPP_PHOTO" | "WHATSAPP_FILE" | "DASHBOARD";
  originalMessage: string | null;
  aiConfidence: number | null;
  hasAudio: boolean;
  ai: { model: string; transcription: string | null; confidence: number | null; extractedData: unknown; createdAt: string } | null;
};

const TYPE_LABEL = { INCOME: "Receita", EXPENSE: "Despesa", TRANSFER: "Transferência", ADJUSTMENT: "Ajuste" } as const;
const ORIGIN = {
  WHATSAPP_TEXT: { channel: "WhatsApp", method: "Texto" },
  WHATSAPP_AUDIO: { channel: "WhatsApp", method: "Áudio" },
  WHATSAPP_PHOTO: { channel: "WhatsApp", method: "Foto de comprovante" },
  WHATSAPP_FILE: { channel: "Arquivo", method: "Importação de PDF, CSV ou Excel" },
  DASHBOARD: { channel: "Painel", method: "Lançamento manual" },
} as const;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const stamp = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{value ?? "—"}</div>
    </div>
  );
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/api/transactions/${encodeURIComponent(id)}`);
  if (res.status === 404) notFound();
  const t: Detail | null = res.ok ? await res.json() : null;
  if (!t) {
    return (
      <main style={{ padding: "28px 28px 48px" }}>
        <p style={{ color: "var(--muted)" }}>Não foi possível carregar este lançamento.</p>
      </main>
    );
  }

  const origin = ORIGIN[t.origin];
  const confidence = t.ai?.confidence ?? t.aiConfidence;

  return (
    <main style={{ padding: "28px 28px 48px", maxWidth: 820 }}>
      <Link href="/lancamentos" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
        <ArrowLeft size={14} /> Lançamentos
      </Link>
      <h1 style={{ fontSize: 24, marginTop: 10 }}>{t.description}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        {TYPE_LABEL[t.type]} · {brl(t.amount)} · {day(t.date)}
        {t.status === "DELETED" ? " · apagado" : ""}
      </p>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Informações financeiras</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
          <Field label="Valor" value={brl(t.amount)} />
          <Field label="Tipo" value={TYPE_LABEL[t.type]} />
          <Field label="Categoria" value={t.category ? (t.category.parent ?? t.category.name) : null} />
          <Field label="Subcategoria" value={t.category?.parent ? t.category.name : null} />
          <Field label="Data" value={day(t.date)} />
          <Field label="Usuário" value={t.user} />
          <Field label="Pessoa" value={t.person} />
          <Field label="Estabelecimento" value={t.merchant} />
          <Field label={t.type === "TRANSFER" ? "Conta de origem" : "Conta"} value={t.account} />
          {t.type === "TRANSFER" && <Field label="Conta de destino" value={t.toAccount} />}
          {t.installment && <Field label="Parcela" value={`${t.installment.no}/${t.installment.total}`} />}
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 16 }}>
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Origem</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
          <Field label="Canal" value={origin.channel} />
          <Field label="Método" value={origin.method} />
          <Field label="Registrado em" value={stamp(t.createdAt)} />
          <Field label="Confiança da IA" value={confidence !== null ? `${Math.round(confidence * 100)}%` : null} />
        </div>
        {t.originalMessage && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Mensagem original</div>
            <blockquote style={{ margin: "6px 0 0", padding: "10px 14px", borderLeft: "3px solid var(--card-border)", background: "var(--field-bg)", borderRadius: 6, fontSize: 14 }}>
              {t.originalMessage}
            </blockquote>
          </div>
        )}
        {t.hasAudio && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Áudio original</div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls preload="none" src={`/api/transactions/${t.id}/audio`} style={{ marginTop: 6, width: "100%" }} />
          </div>
        )}
        {t.ai?.transcription && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Transcrição do áudio</div>
            <blockquote style={{ margin: "6px 0 0", padding: "10px 14px", borderLeft: "3px solid var(--card-border)", background: "var(--field-bg)", borderRadius: 6, fontSize: 14 }}>
              {t.ai.transcription}
            </blockquote>
          </div>
        )}
        {t.ai && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>O que a IA leu ({t.ai.model})</summary>
            <pre style={{ margin: "8px 0 0", padding: 12, background: "var(--field-bg)", borderRadius: 6, fontSize: 12, overflow: "auto" }}>
              {JSON.stringify(t.ai.extractedData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
