import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { ForecastChart } from "../components/BiCharts";

type Forecast = {
  horizonDays: number;
  startBalance: number;
  dailyVariable: number;
  points: { date: string; balance: number }[];
  endBalance: number;
  lowest: { date: string; balance: number };
  firstNegative: string | null;
  events: { date: string; amount: number; label: string; source: "BILL" | "RECURRING" | "SCHEDULED" }[];
  plannedIn: number;
  plannedOut: number;
  variableOut: number;
};

const HORIZONS = [30, 60, 90];
const SOURCE = { BILL: "Conta a pagar", RECURRING: "Recorrência", SCHEDULED: "Lançamento futuro" } as const;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default async function ForecastPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { days } = await searchParams;
  const horizon = HORIZONS.includes(Number(days)) ? Number(days) : 60;
  const res = await apiFetch(`/api/forecast?days=${horizon}`);
  const f: Forecast | null = res.ok ? await res.json() : null;

  if (!f) {
    return (
      <main style={{ padding: "28px 28px 48px" }}>
        <p style={{ color: "var(--muted)" }}>Não foi possível carregar a previsão.</p>
      </main>
    );
  }

  const cards = [
    { label: "Saldo hoje", value: brl(f.startBalance), caption: "soma das contas, sem cartões" },
    { label: `Saldo em ${dm(f.points[f.points.length - 1].date)}`, value: brl(f.endBalance), caption: `daqui a ${f.horizonDays} dias`, bad: f.endBalance < 0 },
    { label: "Ponto mais baixo", value: brl(f.lowest.balance), caption: `em ${dm(f.lowest.date)}`, bad: f.lowest.balance < 0 },
    { label: "Já planejado", value: `${brl(f.plannedOut)} saem`, caption: `${brl(f.plannedIn)} entram` },
  ];

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <h1 style={{ fontSize: 24 }}>Previsão de caixa</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, maxWidth: 720 }}>
        Como o saldo das suas contas deve evoluir, com base no que já é conhecido: contas a pagar, recorrências, lançamentos com data futura e a média dos
        seus gastos do dia a dia. É uma estimativa: receitas que ainda não estão cadastradas não entram.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {HORIZONS.map((d) => (
          <Link key={d} href={`/previsao?days=${d}`} className={`tab ${horizon === d ? "tab-active" : ""}`}>
            {d} dias
          </Link>
        ))}
      </div>

      {f.firstNegative && (
        <div className="card" style={{ padding: "14px 18px", marginTop: 16, borderColor: "var(--red)" }}>
          <strong style={{ color: "var(--red)" }}>🚨 O saldo deve ficar negativo a partir de {dm(f.firstNegative)}.</strong>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            O ponto mais baixo é {brl(f.lowest.balance)} em {dm(f.lowest.date)}. Veja abaixo o que pesa e, se der, adie ou reduza algum gasto.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))", gap: 16, marginTop: 16 }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{c.label}</div>
            <div style={{ fontSize: 21, fontWeight: 700, marginTop: 4, color: c.bad ? "var(--red)" : undefined }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{c.caption}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20, marginTop: 16 }}>
        <h2 style={{ fontSize: 15 }}>Saldo estimado dia a dia</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
          Inclui {brl(f.dailyVariable)} por dia de gastos variáveis (média dos últimos 90 dias), {brl(f.variableOut)} no período.
        </p>
        <div style={{ marginTop: 16 }}>
          <ForecastChart data={f.points} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Movimentos já conhecidos</div>
        {f.events.length === 0 ? (
          <div style={{ padding: "0 18px 18px", color: "var(--muted)", fontSize: 13 }}>
            Nenhuma conta a pagar, recorrência ou lançamento futuro neste período. Cadastre em Contas a pagar e Planejamento para a previsão ficar mais fiel.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 18 }}>Data</th>
                <th>Descrição</th>
                <th>Origem</th>
                <th style={{ textAlign: "right", paddingRight: 18 }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {f.events.map((e, i) => (
                <tr key={i}>
                  <td style={{ paddingLeft: 18 }}>{dm(e.date)}</td>
                  <td>{e.label}</td>
                  <td style={{ color: "var(--muted)" }}>{SOURCE[e.source]}</td>
                  <td style={{ textAlign: "right", paddingRight: 18, color: e.amount < 0 ? "var(--red)" : "var(--green)" }}>
                    {e.amount < 0 ? "- " : "+ "}
                    {brl(Math.abs(e.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
