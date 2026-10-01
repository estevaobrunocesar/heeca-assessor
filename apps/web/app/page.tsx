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
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function DashboardPage() {
  const [summary, trend] = await Promise.all([getSummary(), getTrend()]);

  const cards = [
    { label: "Saldo do mês", value: summary.result },
    { label: "Receitas do mês", value: summary.income },
    { label: "Despesas do mês", value: summary.expense },
    { label: "Resultado do mês", value: summary.result },
  ];

  return (
    <main style={{ padding: 32, maxWidth: 960, margin: "0 auto" }}>
      <h1>Meu Assessor Financeiro</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 24 }}>
        {cards.map((card) => (
          <div key={card.label} style={{ background: "#1a1d24", padding: 20, borderRadius: 12 }}>
            <div style={{ fontSize: 13, color: "#999" }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 8 }}>{formatBRL(card.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24, marginTop: 40 }}>
        <div>
          <h2 style={{ fontSize: 16 }}>Receita x Despesa (últimos 6 meses)</h2>
          <TrendChart data={trend} />
        </div>
        <div>
          <h2 style={{ fontSize: 16 }}>Gastos por categoria</h2>
          <CategoryPieChart data={summary.topCategories} />
        </div>
      </div>

      <h2 style={{ marginTop: 40, fontSize: 16 }}>Maiores categorias de gasto</h2>
      <ul>
        {summary.topCategories.map((c) => (
          <li key={c.name}>
            {c.name}: {formatBRL(c.total)}
          </li>
        ))}
      </ul>
    </main>
  );
}
