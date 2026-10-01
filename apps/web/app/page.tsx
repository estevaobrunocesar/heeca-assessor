import { TrendingUp, TrendingDown, Wallet, PiggyBank } from "lucide-react";
import { apiFetch } from "../lib/api";
import { TrendChart, CategoryPieChart } from "./components/Charts";

type Summary = {
  income: number;
  expense: number;
  result: number;
  topCategories: { name: string; total: number }[];
};

type TrendPoint = { month: string; income: number; expense: number; result: number };
type Account = { balance: number };

async function getSummary(): Promise<Summary> {
  const res = await apiFetch("/api/dashboard/summary");
  return res.json();
}

async function getTrend(): Promise<TrendPoint[]> {
  const res = await apiFetch("/api/dashboard/trend?months=6");
  return res.json();
}

async function getAccountsTotal(): Promise<number> {
  const res = await apiFetch("/api/accounts");
  const accounts: Account[] = await res.json();
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function DashboardPage() {
  const [summary, trend, accountsTotal] = await Promise.all([getSummary(), getTrend(), getAccountsTotal()]);
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const cards = [
    { label: "Receitas", value: summary.income, icon: TrendingUp, color: "green" as const },
    { label: "Despesas", value: summary.expense, icon: TrendingDown, color: "red" as const },
    { label: "Saldo do mês", value: summary.result, icon: Wallet, color: "blue" as const, caption: summary.result >= 0 ? "Positivo" : "Negativo" },
    { label: "Saldo total em contas", value: accountsTotal, icon: PiggyBank, color: "amber" as const },
  ];

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Dashboard</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, textTransform: "capitalize" }}>
            Visão geral das suas finanças · {monthLabel}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, marginTop: 24 }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: `var(--${c.color}-soft)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={19} color={`var(--${c.color})`} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{formatBRL(c.value)}</div>
                {c.caption && <div style={{ fontSize: 12, color: `var(--${c.color})`, marginTop: 2 }}>{c.caption}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginTop: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Receitas vs Despesas</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Últimos 6 meses</p>
          <div style={{ marginTop: 16 }}>
            <TrendChart data={trend} />
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Despesas por categoria</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Este mês</p>
          <div style={{ marginTop: 16 }}>
            <CategoryPieChart data={summary.topCategories} />
          </div>
        </div>
      </div>
    </main>
  );
}
