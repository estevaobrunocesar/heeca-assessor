import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { TrendChart, CategoryPieChart } from "../../components/Charts";

type PersonDashboard = {
  person: { id: string; name: string; relation: string | null };
  period: { label: string };
  expense: number;
  income: number;
  count: number;
  shareOfExpense: number;
  biggest: { description: string; amount: number; date: string } | null;
  byCategory: { name: string; total: number; percent: number }[];
  trend: { month: string; income: number; expense: number }[];
  recent: { id: string; date: string; description: string; category: string | null; type: "INCOME" | "EXPENSE"; amount: number }[];
};

const PRESETS = [
  { preset: "mes", label: "Este mês" },
  { preset: "mes-passado", label: "Mês passado" },
  { preset: "30d", label: "Últimos 30 dias" },
  { preset: "ano", label: "Este ano" },
];

const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Plain calendar days serialized as ISO timestamps; read in UTC so the day never shifts.
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export default async function PersonDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { preset, from, to } = await searchParams;
  const custom = !!(from && to);

  const query = new URLSearchParams();
  if (custom) {
    query.set("from", from!);
    query.set("to", to!);
  } else if (preset) {
    query.set("preset", preset);
  }
  const qs = query.toString();

  const res = await apiFetch(`/api/people/${encodeURIComponent(id)}/dashboard${qs ? `?${qs}` : ""}`);
  if (res.status === 404) notFound();
  const data: PersonDashboard | null = res.ok ? await res.json() : null;
  const activePreset = custom ? null : (preset ?? "mes");
  const base = `/pessoas/${encodeURIComponent(id)}`;

  if (!data) {
    return (
      <main style={{ padding: "28px 28px 48px" }}>
        <p style={{ color: "var(--muted)" }}>Não foi possível carregar os dados desta pessoa.</p>
      </main>
    );
  }

  const cards = [
    { label: "Gasto no período", value: formatBRL(data.expense), caption: `${data.count} lançamento(s)` },
    { label: "Parte dos gastos totais", value: `${data.shareOfExpense.toFixed(0)}%`, caption: "de tudo que foi gasto no período" },
    { label: "Maior gasto", value: data.biggest ? formatBRL(data.biggest.amount) : "—", caption: data.biggest ? `${data.biggest.description} · ${formatDay(data.biggest.date)}` : "nenhum no período" },
    ...(data.income > 0 ? [{ label: "Entradas atribuídas", value: formatBRL(data.income), caption: "receitas ligadas a esta pessoa" }] : []),
  ];

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <Link href="/pessoas" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
        <ArrowLeft size={14} /> Pessoas
      </Link>
      <div style={{ marginTop: 10 }}>
        <h1 style={{ fontSize: 24 }}>{data.person.name}</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
          {data.person.relation && data.person.relation.toLowerCase() !== data.person.name.toLowerCase() ? `${data.person.relation} · ` : ""}
          {data.period.label}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 20 }}>
        {PRESETS.map((p) => (
          <Link key={p.preset} href={`${base}?preset=${p.preset}`} className={`tab ${activePreset === p.preset ? "tab-active" : ""}`}>
            {p.label}
          </Link>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 16, marginTop: 20 }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{c.caption}</div>
          </div>
        ))}
      </div>

      {data.count === 0 ? (
        <div className="card" style={{ padding: 24, marginTop: 20, color: "var(--muted)", fontSize: 14 }}>
          Nenhum lançamento de {data.person.name} neste período. Registre pelo WhatsApp (&quot;presente pra {data.person.name} 120&quot;) ou
          atribua a pessoa em Lançamentos.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 16, marginTop: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 15 }}>Evolução</h2>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Últimos 6 meses</p>
              <div style={{ marginTop: 16 }}>
                <TrendChart data={data.trend} />
              </div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 15 }}>Gastos por categoria</h2>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>No período</p>
              <div style={{ marginTop: 16 }}>
                <CategoryPieChart data={data.byCategory} />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Lançamentos{data.count > data.recent.length ? ` (os ${data.recent.length} mais recentes)` : ""}</div>
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
                {data.recent.map((t) => (
                  <tr key={t.id}>
                    <td style={{ paddingLeft: 18 }}>{formatDay(t.date)}</td>
                    <td>{t.description}</td>
                    <td style={{ color: "var(--muted)" }}>{t.category ?? "—"}</td>
                    <td style={{ paddingRight: 18, textAlign: "right", color: t.type === "INCOME" ? "var(--green)" : undefined }}>
                      {t.type === "INCOME" ? "+ " : ""}
                      {formatBRL(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
