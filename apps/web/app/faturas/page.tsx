import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { BankLogo } from "../components/BankLogo";

type Invoice = {
  startDate: string;
  closingDate: string;
  dueDate: string;
  status: "FECHADA" | "ABERTA" | "FUTURA";
  total: number;
  items: {
    id: string;
    date: string;
    description: string;
    amount: number;
    category: string | null;
    installmentNo: number | null;
    installmentTotal: number | null;
  }[];
};

type CardInvoices = {
  account: { id: string; name: string; bank: string | null };
  closingDay: number | null;
  dueDay: number | null;
  configured: boolean;
  invoices: Invoice[];
};

const STATUS_LABEL: Record<Invoice["status"], string> = {
  ABERTA: "Aberta",
  FECHADA: "Fechada",
  FUTURA: "Futura",
};

const STATUS_PILL: Record<Invoice["status"], string> = {
  ABERTA: "pill-green",
  FECHADA: "pill-red",
  FUTURA: "pill-muted",
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// API dates are plain calendar dates serialized as ISO timestamps; read them
// in UTC so the displayed day never shifts with the viewer's timezone.
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

async function getInvoices(): Promise<CardInvoices[]> {
  const res = await apiFetch("/api/invoices");
  if (!res.ok) return [];
  return res.json();
}

export default async function InvoicesPage() {
  const cards = await getInvoices();

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Faturas</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
          Fatura de cada cartão por ciclo de fechamento — parcelas entram na fatura do mês em que vencem
        </p>
      </div>

      {cards.length === 0 && (
        <div className="card" style={{ padding: 24, marginTop: 24, color: "var(--muted)", fontSize: 14 }}>
          Você ainda não tem cartão de crédito cadastrado. Adicione um em{" "}
          <Link href="/admin/contas" style={{ color: "var(--primary)" }}>
            Contas bancárias
          </Link>
          .
        </div>
      )}

      {cards.map((card) => {
        const current = card.invoices.find((i) => i.status === "ABERTA");
        return (
          <section key={card.account.id} style={{ marginTop: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <BankLogo bankName={card.account.bank} />
              <div>
                <div style={{ fontWeight: 600 }}>{card.account.bank ?? card.account.name}</div>
                {card.configured && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Fecha dia {card.closingDay} · vence dia {card.dueDay}
                  </div>
                )}
              </div>
            </div>

            {!card.configured ? (
              <div className="card" style={{ padding: 20, marginTop: 12, color: "var(--muted)", fontSize: 14 }}>
                Informe o dia de fechamento e de vencimento deste cartão em{" "}
                <Link href="/admin/contas" style={{ color: "var(--primary)" }}>
                  Contas bancárias
                </Link>{" "}
                para calcular as faturas.
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 12 }}>
                  {card.invoices.map((inv) => (
                    <div key={inv.closingDate} className="card" style={{ padding: 16 }}>
                      <span className={`pill ${STATUS_PILL[inv.status]}`}>{STATUS_LABEL[inv.status]}</span>
                      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>{formatBRL(inv.total)}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
                        Período {formatDay(inv.startDate)} a {formatDay(inv.closingDate)}
                        <br />
                        Vencimento {formatDay(inv.dueDate)}
                      </div>
                    </div>
                  ))}
                </div>

                {current && (
                  <div className="card" style={{ marginTop: 14, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Lançamentos da fatura aberta</div>
                    {current.items.length === 0 ? (
                      <div style={{ padding: "0 18px 18px", color: "var(--muted)", fontSize: 13 }}>Nenhum lançamento neste ciclo.</div>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th style={{ paddingLeft: 18 }}>Data</th>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th style={{ paddingRight: 18, textAlign: "right" }}>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {current.items.map((t) => (
                            <tr key={t.id}>
                              <td style={{ paddingLeft: 18 }}>{formatDay(t.date)}</td>
                              <td>{t.description}</td>
                              <td style={{ color: "var(--muted)" }}>{t.category ?? "—"}</td>
                              <td style={{ paddingRight: 18, textAlign: "right" }}>{formatBRL(t.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}
