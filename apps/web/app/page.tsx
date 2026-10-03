import Link from "next/link";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, CreditCard, CalendarClock } from "lucide-react";
import { apiFetch } from "../lib/api";
import { TrendChart, CategoryPieChart } from "./components/Charts";

type Summary = {
  income: number;
  expense: number;
  result: number;
  topCategories: { name: string; total: number }[];
};

type TrendPoint = { month: string; income: number; expense: number; result: number };
type Account = { type: string; balance: number; creditLimit: number | null; availableLimit: number | null };

async function getSummary(): Promise<Summary> {
  const res = await apiFetch("/api/dashboard/summary");
  return res.json();
}

async function getTrend(): Promise<TrendPoint[]> {
  const res = await apiFetch("/api/dashboard/trend?months=6");
  return res.json();
}

async function getAccounts(): Promise<Account[]> {
  const res = await apiFetch("/api/accounts");
  return res.json();
}

type PersonSpend = { id: string; name: string; monthTotal: number };

async function getPeopleSpend(): Promise<PersonSpend[]> {
  const res = await apiFetch("/api/people");
  if (!res.ok) return [];
  return res.json();
}

type GoalStatus = { name: string; state: string; behind: boolean; daysLeft: number | null };

async function getGoalStatuses(): Promise<GoalStatus[]> {
  const res = await apiFetch("/api/goals");
  return res.ok ? res.json() : [];
}

type PendingBill = { amount: number; state: "VENCIDA" | "HOJE" | "A_VENCER" | null };

async function getPendingBills(): Promise<PendingBill[]> {
  const res = await apiFetch("/api/bills");
  if (!res.ok) return [];
  return (await res.json()).pending;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function DashboardPage() {
  const [summary, trend, accounts, bills, people, goals] = await Promise.all([getSummary(), getTrend(), getAccounts(), getPendingBills(), getPeopleSpend(), getGoalStatuses()]);
  const goalAlerts = goals.filter((g) => g.behind || g.state === "VENCIDA" || (g.state === "COM_PRAZO" && g.daysLeft !== null && g.daysLeft <= 7));
  const bySpend = people.filter((p) => p.monthTotal > 0).sort((a, b) => b.monthTotal - a.monthTotal);
  const peopleMax = bySpend[0]?.monthTotal ?? 0;
  const overdueBills = bills.filter((b) => b.state === "VENCIDA");
  const billsTotal = bills.reduce((sum, b) => sum + b.amount, 0);
  const overdueTotal = overdueBills.reduce((sum, b) => sum + b.amount, 0);
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Credit card limits are spending capacity, not cash — mixing them into
  // "saldo total em contas" would make that figure meaningless, so they get
  // their own card instead.
  const cashAccounts = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const cardAccounts = accounts.filter((a) => a.type === "CREDIT_CARD" && a.creditLimit !== null);
  const accountsTotal = cashAccounts.reduce((sum, a) => sum + a.balance, 0);
  const cardLimitTotal = cardAccounts.reduce((sum, a) => sum + (a.creditLimit ?? 0), 0);
  const cardAvailableTotal = cardAccounts.reduce((sum, a) => sum + (a.availableLimit ?? 0), 0);

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

      {goalAlerts.length > 0 && (
        <Link href="/metas" className="card" style={{ display: "block", padding: "14px 18px", marginTop: 20, color: "inherit", textDecoration: "none", borderColor: "var(--red)" }}>
          <strong style={{ fontSize: 14, color: "var(--red)" }}>
            {goalAlerts.length} meta{goalAlerts.length === 1 ? "" : "s"} de economia pedindo atenção
          </strong>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {goalAlerts.map((g) => `${g.name} (${g.state === "VENCIDA" ? "vencida" : g.behind ? "atrasada" : "vence em breve"})`).join(" · ")}
          </div>
        </Link>
      )}

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

        {bills.length > 0 && (
          <Link href="/contas-a-pagar" className="card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "flex-start", color: "inherit", textDecoration: "none" }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: overdueBills.length > 0 ? "var(--red-soft)" : "var(--blue-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CalendarClock size={19} color={overdueBills.length > 0 ? "var(--red)" : "var(--blue)"} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Contas a pagar</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{formatBRL(billsTotal)}</div>
              <div style={{ fontSize: 12, color: overdueBills.length > 0 ? "var(--red)" : "var(--muted)", marginTop: 2 }}>
                {overdueBills.length > 0
                  ? `${overdueBills.length} vencida(s) · ${formatBRL(overdueTotal)}`
                  : `${bills.length} pendente(s), nenhuma vencida`}
              </div>
            </div>
          </Link>
        )}

        {cardAccounts.length > 0 && (
          <div className="card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: "var(--red-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CreditCard size={19} color="var(--red)" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Cartões de crédito</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{formatBRL(cardAvailableTotal)}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                disponível de {formatBRL(cardLimitTotal)} em limite
              </div>
            </div>
          </div>
        )}
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

      {bySpend.length > 0 && (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          <h2 style={{ fontSize: 15 }}>Gastos por pessoa</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Este mês · clique para ver o painel de cada um</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {bySpend.map((p) => (
              <Link key={p.id} href={`/pessoas/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{p.name}</span>
                  <strong>{formatBRL(p.monthTotal)}</strong>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--field-bg)", marginTop: 4 }}>
                  <div style={{ width: `${(p.monthTotal / peopleMax) * 100}%`, height: "100%", borderRadius: 3, background: "var(--primary)" }} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
