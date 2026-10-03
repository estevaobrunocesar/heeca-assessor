import Link from "next/link";
import { FileText, FileSpreadsheet } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { ReportEmailCard } from "../components/ReportEmailCard";
import { WhatsappSummaryCard } from "../components/WhatsappSummaryCard";

type ReportData = {
  label: string;
  income: number;
  expense: number;
  result: number;
  expenseByCategory: { name: string; total: number; percent: number; subs: { name: string; total: number }[] }[];
  incomeByCategory: { name: string; total: number }[];
  expenseByPerson: { name: string; total: number }[];
  transactions: unknown[];
};

type Repeated = {
  recurring: { label: string; typicalAmount: number; months: number; nextDate: string }[];
  frequent: { label: string; count: number; total: number }[];
};

const PRESETS = [
  { preset: "mes", label: "Este mês" },
  { preset: "mes-passado", label: "Mês passado" },
  { preset: "30d", label: "Últimos 30 dias" },
  { preset: "ano", label: "Este ano" },
];

// Plain calendar days serialized as ISO timestamps; read in UTC so the day never shifts.
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
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

  const res = await apiFetch(`/api/reports/data${qs ? `?${qs}` : ""}`);
  const data: ReportData | null = res.ok ? await res.json() : null;
  const repeatedRes = await apiFetch("/api/insights/repeated");
  const repeated: Repeated = repeatedRes.ok ? await repeatedRes.json() : { recurring: [], frequent: [] };
  const activePreset = custom ? null : (preset ?? "mes");
  const download = (format: "pdf" | "xlsx") => `/api/reports/file?format=${format}${qs ? `&${qs}` : ""}`;

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Relatórios</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
          Resumo do período e arquivos para baixar. Também dá para pedir pelo WhatsApp: &quot;me manda o relatório de setembro em PDF&quot;.
        </p>
      </div>

      <ReportEmailCard />
      <WhatsappSummaryCard />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 20 }}>
        {PRESETS.map((p) => (
          <Link key={p.preset} href={`/relatorios?preset=${p.preset}`} className={`tab ${activePreset === p.preset ? "tab-active" : ""}`}>
            {p.label}
          </Link>
        ))}
        <form method="get" style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }}>
          <input type="date" name="from" defaultValue={from} required className="field" style={{ fontSize: 13 }} />
          <span style={{ color: "var(--muted)", fontSize: 13 }}>até</span>
          <input type="date" name="to" defaultValue={to} required className="field" style={{ fontSize: 13 }} />
          <button type="submit" className={`btn ${custom ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 13 }}>
            Aplicar
          </button>
        </form>
      </div>

      {!data ? (
        <div className="card" style={{ padding: 24, marginTop: 24, color: "var(--muted)" }}>
          Não foi possível carregar o relatório.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              Período: <strong style={{ color: "var(--ink)" }}>{data.label}</strong> · {data.transactions.length} lançamento(s)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a href={download("pdf")} className="btn btn-primary" style={{ gap: 6 }}>
                <FileText size={15} /> Baixar PDF
              </a>
              <a href={download("xlsx")} className="btn btn-ghost" style={{ gap: 6 }}>
                <FileSpreadsheet size={15} /> Baixar Excel
              </a>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 16 }}>
            {[
              { label: "Receitas", value: data.income, color: "var(--green)" },
              { label: "Despesas", value: data.expense, color: "var(--red)" },
              { label: "Resultado", value: data.result, color: data.result >= 0 ? "var(--green)" : "var(--red)" },
            ].map((k) => (
              <div key={k.label} className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: k.color }}>{formatBRL(k.value)}</div>
              </div>
            ))}
          </div>

          {data.expenseByCategory.length > 0 && (
            <div className="card" style={{ marginTop: 20, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Despesas por categoria</div>
              <table>
                <tbody>
                  {data.expenseByCategory.map((c) => (
                    <tr key={c.name}>
                      <td style={{ paddingLeft: 18, fontWeight: 500, width: "35%" }}>{c.name}</td>
                      <td style={{ width: "35%" }}>
                        <div style={{ background: "var(--field-bg)", borderRadius: 999, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(c.percent, 100)}%`, background: "var(--red)", height: "100%" }} />
                        </div>
                      </td>
                      <td style={{ textAlign: "right", color: "var(--muted)" }}>{c.percent.toFixed(1)}%</td>
                      <td style={{ textAlign: "right", paddingRight: 18, fontWeight: 600 }}>{formatBRL(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.expenseByPerson.length > 0 && (
            <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Despesas por pessoa</div>
              <table>
                <tbody>
                  {data.expenseByPerson.map((p) => (
                    <tr key={p.name}>
                      <td style={{ paddingLeft: 18, fontWeight: 500 }}>{p.name}</td>
                      <td style={{ textAlign: "right", paddingRight: 18, fontWeight: 600 }}>{formatBRL(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.incomeByCategory.length > 0 && (
            <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Receitas por categoria</div>
              <table>
                <tbody>
                  {data.incomeByCategory.map((c) => (
                    <tr key={c.name}>
                      <td style={{ paddingLeft: 18, fontWeight: 500 }}>{c.name}</td>
                      <td style={{ textAlign: "right", paddingRight: 18, fontWeight: 600 }}>{formatBRL(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(repeated.recurring.length > 0 || repeated.frequent.length > 0) && (
            <>
              <h2 style={{ fontSize: 15, marginTop: 32, color: "var(--muted)" }}>Gastos que se repetem</h2>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Análise dos últimos 6 meses, independente do período acima.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginTop: 12 }}>
                {repeated.recurring.length > 0 && (
                  <div className="card" style={{ overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Recorrentes (todo mês)</div>
                    <table>
                      <tbody>
                        {repeated.recurring.map((r) => (
                          <tr key={r.label}>
                            <td style={{ paddingLeft: 18, fontWeight: 500 }}>{r.label}</td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{r.months} meses · {new Date(r.nextDate) < new Date() ? "esperada" : "próx."} ~{formatDay(r.nextDate)}</td>
                            <td style={{ textAlign: "right", paddingRight: 18, fontWeight: 600 }}>~{formatBRL(r.typicalAmount)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={2} style={{ paddingLeft: 18, color: "var(--muted)", fontSize: 12 }}>Total mensal estimado</td>
                          <td style={{ textAlign: "right", paddingRight: 18, fontWeight: 700 }}>
                            {formatBRL(repeated.recurring.reduce((sum, r) => sum + r.typicalAmount, 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {repeated.frequent.length > 0 && (
                  <div className="card" style={{ overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", fontWeight: 600, fontSize: 14 }}>Frequentes nos últimos 30 dias</div>
                    <table>
                      <tbody>
                        {repeated.frequent.map((f) => (
                          <tr key={f.label}>
                            <td style={{ paddingLeft: 18, fontWeight: 500 }}>{f.label}</td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{f.count}x</td>
                            <td style={{ textAlign: "right", paddingRight: 18, fontWeight: 600 }}>{formatBRL(f.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {data.transactions.length === 0 && (
            <div className="card" style={{ padding: 24, marginTop: 20, color: "var(--muted)", fontSize: 14 }}>
              Nenhum lançamento neste período.
            </div>
          )}
        </>
      )}
    </main>
  );
}
