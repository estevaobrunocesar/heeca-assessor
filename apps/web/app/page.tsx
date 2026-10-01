import { apiFetch } from "../lib/api";
import { TrendChart, CategoryPieChart } from "./components/Charts";

type Summary = {
  income: number;
  expense: number;
  result: number;
  topCategories: { name: string; total: number }[];
};

type TrendPoint = { month: string; income: number; expense: number; result: number };

async function getSummary(): Promise<Summary> {
  const res = await apiFetch("/api/dashboard/summary");
  return res.json();
}

async function getTrend(): Promise<TrendPoint[]> {
  const res = await apiFetch("/api/dashboard/trend?months=6");
  return res.json();
}

function formatBRL(value: number) {
  return Math.abs(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function DashboardPage() {
  const [summary, trend] = await Promise.all([getSummary(), getTrend()]);
  const today = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 64px" }}>
      <p className="eyebrow">Resumo · {today}</p>

      <div style={{ marginTop: 10 }}>
        <span className="eyebrow">Saldo do mês</span>
        <div
          className={`mono ${summary.result >= 0 ? "sign-up" : "sign-down"}`}
          style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.1, marginTop: 6 }}
        >
          {summary.result < 0 ? "-" : ""}
          {formatBRL(summary.result)}
        </div>
        <hr className="hairline-strong" style={{ marginTop: 14 }} />
        <hr className="hairline" style={{ marginTop: 3 }} />
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 24, flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow">Receitas</span>
          <div className="mono" style={{ fontSize: 20, marginTop: 4, color: "var(--azul)" }}>
            {formatBRL(summary.income)}
          </div>
        </div>
        <div>
          <span className="eyebrow">Despesas</span>
          <div className="mono" style={{ fontSize: 20, marginTop: 4, color: "var(--vermelho)" }}>
            {formatBRL(summary.expense)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 32, marginTop: 48 }}>
        <div>
          <h2 style={{ fontSize: 15 }}>Receita x Despesa</h2>
          <p className="eyebrow" style={{ marginTop: 2 }}>
            últimos 6 meses
          </p>
          <div style={{ marginTop: 12 }}>
            <TrendChart data={trend} />
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: 15 }}>Gastos por categoria</h2>
          <p className="eyebrow" style={{ marginTop: 2 }}>
            este mês
          </p>
          <div style={{ marginTop: 12 }}>
            <CategoryPieChart data={summary.topCategories} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 15 }}>Maiores categorias de gasto</h2>
        <div style={{ marginTop: 12 }}>
          {summary.topCategories.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>Sem despesas registradas este mês.</p>
          )}
          {summary.topCategories.map((c) => (
            <div className="ledger-row" key={c.name}>
              <span className="ledger-label">{c.name}</span>
              <span className="ledger-fill" />
              <span className="ledger-value">{formatBRL(c.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
