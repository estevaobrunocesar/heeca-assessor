import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { CategoryPieChart } from "../components/Charts";
import { MonthlyExpenseBars, MonthlyLineChart, NetWorthChart, UserBarsChart } from "../components/BiCharts";

type Month = { month: string; income: number; expense: number; result: number };
type Bi = {
  period: { from: string; to: string };
  months: Month[];
  netWorth: { month: string; balance: number }[];
  years: { current: { year: number; income: number; expense: number }; previous: { year: number; income: number; expense: number } };
  monthOverMonth: (Month & { resultChange: number | null; expenseChange: number | null })[];
  expenseByCategory: { name: string; total: number }[];
  incomeByCategory: { name: string; total: number }[];
  expenseByUser: { name: string; total: number }[];
  committed: { monthlyTotal: number; incomeReference: number; percent: number | null; items: { description: string; amount: number }[] };
  split: { recurring: number; variable: number; extraordinary: number; threshold: number; items: { description: string; date: string; amount: number }[] };
};

const PRESETS = [
  { preset: "mes", label: "Este mês" },
  { preset: "mes-passado", label: "Mês passado" },
  { preset: "30d", label: "Últimos 30 dias" },
  { preset: "ano", label: "Este ano" },
];

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthLabel = (yyyyMM: string) => `${MONTHS_PT[Number(yyyyMM.slice(5)) - 1]}/${yyyyMM.slice(2, 4)}`;
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const pctChange = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

function Delta({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) {
  if (value === null) return <span style={{ color: "var(--muted)" }}>—</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span style={{ color: "var(--muted)" }}>0%</span>;
  const good = (value > 0) === goodWhenUp;
  return (
    <span style={{ color: good ? "var(--green)" : "var(--red)" }}>
      {value > 0 ? "▲" : "▼"} {Math.abs(rounded)}%
    </span>
  );
}

export default async function BiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { preset } = await searchParams;
  const res = await apiFetch(`/api/bi${preset ? `?preset=${encodeURIComponent(preset)}` : ""}`);
  const bi: Bi | null = res.ok ? await res.json() : null;
  const active = preset ?? "mes";

  if (!bi) {
    return (
      <main style={{ padding: "28px 28px 48px" }}>
        <p style={{ color: "var(--muted)" }}>Não foi possível carregar o BI.</p>
      </main>
    );
  }

  const { current, previous } = bi.years;
  const resultNow = current.income - current.expense;
  const resultBefore = previous.income - previous.expense;
  const periodLabel = `${formatDay(bi.period.from)} a ${formatDay(bi.period.to)}`;
  const split = bi.split;
  const splitTotal = split.recurring + split.variable + split.extraordinary;
  const share = (v: number) => (splitTotal > 0 ? `${((v / splitTotal) * 100).toFixed(0)}%` : "—");

  const kpis = [
    { label: `Receita ${current.year}`, value: formatBRL(current.income), change: <Delta value={pctChange(current.income, previous.income)} goodWhenUp /> , caption: `${previous.year}: ${formatBRL(previous.income)}` },
    { label: `Despesa ${current.year}`, value: formatBRL(current.expense), change: <Delta value={pctChange(current.expense, previous.expense)} goodWhenUp={false} />, caption: `${previous.year}: ${formatBRL(previous.expense)}` },
    { label: `Resultado ${current.year}`, value: formatBRL(resultNow), change: <Delta value={resultBefore !== 0 ? ((resultNow - resultBefore) / Math.abs(resultBefore)) * 100 : null} goodWhenUp />, caption: `${previous.year}: ${formatBRL(resultBefore)}` },
  ];

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <h1 style={{ fontSize: 24 }}>BI financeiro</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, maxWidth: 700 }}>
        Receitas, despesas, patrimônio e hábitos de gasto. Os gráficos de 12 meses são sempre os últimos 12 meses; as seções por período seguem o filtro abaixo.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 16, marginTop: 20 }}>
        {kpis.map((k) => (
          <div key={k.label} className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{k.value}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {k.change} <span style={{ color: "var(--muted)" }}>· {k.caption}</span>
            </div>
          </div>
        ))}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Renda comprometida</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: bi.committed.percent !== null && bi.committed.percent >= 50 ? "var(--red)" : undefined }}>
            {bi.committed.percent !== null ? `${bi.committed.percent.toFixed(0)}%` : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {bi.committed.percent !== null ? `${formatBRL(bi.committed.monthlyTotal)} de recorrentes por mês` : "sem recorrentes ou sem renda para comparar"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 16, marginTop: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Receita x despesa</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Últimos 12 meses</p>
          <div style={{ marginTop: 16 }}>
            <MonthlyLineChart data={bi.months} />
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Evolução do patrimônio</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Saldo somado das contas (sem cartões), fim de cada mês</p>
          <div style={{ marginTop: 16 }}>
            <NetWorthChart data={bi.netWorth} />
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Gastos mensais</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Despesas por mês e a média</p>
          <div style={{ marginTop: 16 }}>
            <MonthlyExpenseBars data={bi.months} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Comparação mês a mês</div>
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 18 }}>Mês</th>
              <th style={{ textAlign: "right" }}>Receitas</th>
              <th style={{ textAlign: "right" }}>Despesas</th>
              <th style={{ textAlign: "right" }}>vs mês anterior</th>
              <th style={{ textAlign: "right" }}>Resultado</th>
              <th style={{ textAlign: "right", paddingRight: 18 }}>vs mês anterior</th>
            </tr>
          </thead>
          <tbody>
            {bi.monthOverMonth.map((m) => (
              <tr key={m.month}>
                <td style={{ paddingLeft: 18, textTransform: "capitalize" }}>{monthLabel(m.month)}</td>
                <td style={{ textAlign: "right" }}>{formatBRL(m.income)}</td>
                <td style={{ textAlign: "right" }}>{formatBRL(m.expense)}</td>
                <td style={{ textAlign: "right" }}>
                  <Delta value={m.expenseChange} goodWhenUp={false} />
                </td>
                <td style={{ textAlign: "right", color: m.result < 0 ? "var(--red)" : undefined }}>{formatBRL(m.result)}</td>
                <td style={{ textAlign: "right", paddingRight: 18 }}>
                  <Delta value={m.resultChange} goodWhenUp />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 36 }}>Por período · {periodLabel}</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {PRESETS.map((p) => (
          <Link key={p.preset} href={`/bi?preset=${p.preset}`} className={`tab ${active === p.preset ? "tab-active" : ""}`}>
            {p.label}
          </Link>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Despesas por categoria</h2>
          <div style={{ marginTop: 16 }}>
            <CategoryPieChart data={bi.expenseByCategory.slice(0, 8)} />
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Receitas por categoria</h2>
          <div style={{ marginTop: 16 }}>
            {bi.incomeByCategory.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 14 }}>Sem receitas no período.</p> : <CategoryPieChart data={bi.incomeByCategory.slice(0, 8)} />}
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Gastos por usuário</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Quem registrou cada despesa</p>
          <div style={{ marginTop: 16 }}>
            <UserBarsChart data={bi.expenseByUser} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Recorrentes, variáveis e extraordinárias</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Despesas do período, separadas por natureza</p>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {[
              { label: "Recorrentes", value: split.recurring, color: "var(--blue)" },
              { label: "Variáveis", value: split.variable, color: "var(--amber)" },
              { label: "Extraordinárias", value: split.extraordinary, color: "var(--red)" },
            ].map((row) => (
              <div key={row.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{row.label}</span>
                  <span>
                    <strong>{formatBRL(row.value)}</strong> <span style={{ color: "var(--muted)" }}>({share(row.value)})</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--field-bg)", marginTop: 4 }}>
                  <div style={{ width: splitTotal > 0 ? `${(row.value / splitTotal) * 100}%` : 0, height: "100%", borderRadius: 3, background: row.color }} />
                </div>
              </div>
            ))}
          </div>
          {split.items.length > 0 ? (
            <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 4, fontSize: 13 }}>
              {split.items.map((i, n) => (
                <li key={n} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {formatDay(i.date)} · {i.description}
                  </span>
                  <span style={{ color: "var(--red)" }}>{formatBRL(i.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 14 }}>Nenhuma despesa extraordinária no período.</p>
          )}
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
            Extraordinária: gasto avulso (nem recorrente nem parcelado) de pelo menos {formatBRL(split.threshold)}, três vezes o gasto típico do período.
          </p>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15 }}>Gastos recorrentes</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
            Quanto da renda já está comprometido todo mês (média de receita dos últimos 3 meses fechados: {formatBRL(bi.committed.incomeReference)})
          </p>
          {bi.committed.percent !== null && (
            <div style={{ marginTop: 14 }}>
              <div style={{ height: 10, borderRadius: 5, background: "var(--field-bg)" }}>
                <div
                  style={{
                    width: `${Math.min(100, bi.committed.percent)}%`,
                    height: "100%",
                    borderRadius: 5,
                    background: bi.committed.percent >= 70 ? "var(--red)" : bi.committed.percent >= 50 ? "var(--amber)" : "var(--green)",
                  }}
                />
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                <strong>{bi.committed.percent.toFixed(0)}%</strong> da renda · {formatBRL(bi.committed.monthlyTotal)} por mês
              </div>
            </div>
          )}
          {bi.committed.items.length > 0 ? (
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 4, fontSize: 13 }}>
              {bi.committed.items.map((i, n) => (
                <li key={n} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{i.description}</span>
                  <span>{formatBRL(i.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 14 }}>
              Nenhuma despesa recorrente cadastrada. Crie em Planejamento ou ao registrar um gasto que se repete todo mês.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
