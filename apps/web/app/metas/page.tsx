import { revalidatePath } from "next/cache";
import { PiggyBank, Trash2 } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { ConfirmButton } from "../components/ConfirmButton";

type Goal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  remaining: number;
  percent: number;
  deadline: string | null;
  state: "CONCLUIDA" | "VENCIDA" | "COM_PRAZO" | "SEM_PRAZO";
  monthlyNeeded: number | null;
  monthsLeft: number | null;
  daysLeft: number | null;
  expectedSoFar: number | null;
  behind: boolean;
  history: { id: string; amount: number; note: string | null; createdAt: string; by: string }[];
};

const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// A calendar date serialized as an ISO timestamp; read in UTC so the day never shifts.
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const formatStamp = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

async function getGoals(): Promise<Goal[]> {
  const list = await apiFetch("/api/goals");
  if (!list.ok) return [];
  const goals: Omit<Goal, "history">[] = await list.json();
  return Promise.all(
    goals.map(async (g) => {
      const res = await apiFetch(`/api/goals/${g.id}`);
      const detail = res.ok ? await res.json() : { history: [] };
      return { ...g, history: detail.history };
    }),
  );
}

// "1.234,56" or "1234.56" -> 1234.56
function parseMoney(raw: FormDataEntryValue | null): number {
  const text = String(raw ?? "").trim().replace(/[R$\s]/g, "");
  if (!text) return NaN;
  return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
}

async function getAlertSettings(): Promise<{ enabled: boolean; email: string } | null> {
  const res = await apiFetch("/api/goals/alerts");
  return res.ok ? res.json() : null;
}

async function setAlerts(formData: FormData) {
  "use server";
  await apiFetch("/api/goals/alerts", { method: "PUT", body: JSON.stringify({ enabled: formData.get("enabled") === "true" }) });
  revalidatePath("/metas");
}

async function createGoal(formData: FormData) {
  "use server";
  await apiFetch("/api/goals", {
    method: "POST",
    body: JSON.stringify({
      name: formData.get("name"),
      targetAmount: parseMoney(formData.get("target")),
      deadline: formData.get("deadline") || null,
    }),
  });
  revalidatePath("/metas");
}

async function contribute(formData: FormData) {
  "use server";
  const amount = parseMoney(formData.get("amount"));
  if (!Number.isFinite(amount)) return;
  const sign = formData.get("direction") === "take" ? -1 : 1;
  await apiFetch(`/api/goals/${formData.get("id")}/contributions`, {
    method: "POST",
    body: JSON.stringify({ amount: sign * amount, note: formData.get("note") || undefined }),
  });
  revalidatePath("/metas");
}

async function deleteGoal(formData: FormData) {
  "use server";
  await apiFetch(`/api/goals/${formData.get("id")}`, { method: "DELETE" });
  revalidatePath("/metas");
}

function statusLine(g: Goal) {
  if (g.state === "CONCLUIDA") return { text: "Meta concluída! 🎉", color: "var(--green)" };
  if (g.state === "VENCIDA") return { text: `Prazo venceu em ${formatDay(g.deadline!)} · faltam ${formatBRL(g.remaining)}`, color: "var(--red)" };
  if (g.state === "COM_PRAZO" && g.behind) {
    return {
      text: `Atrasada: o esperado até hoje era ${formatBRL(g.expectedSoFar ?? 0)}. Até ${formatDay(g.deadline!)}, guarde ${formatBRL(g.monthlyNeeded ?? 0)} por mês`,
      color: "var(--red)",
    };
  }
  if (g.state === "COM_PRAZO") {
    return {
      text: `Até ${formatDay(g.deadline!)}: guarde ${formatBRL(g.monthlyNeeded ?? 0)} por mês (${g.monthsLeft} ${g.monthsLeft === 1 ? "mês" : "meses"})`,
      color: "var(--muted)",
    };
  }
  return { text: `Faltam ${formatBRL(g.remaining)} · sem prazo definido`, color: "var(--muted)" };
}

export default async function GoalsPage() {
  const [goals, alerts] = await Promise.all([getGoals(), getAlertSettings()]);
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <h1 style={{ fontSize: 24 }}>Metas de economia</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, maxWidth: 680 }}>
        Defina quanto quer juntar e até quando. O valor guardado é um controle à parte: não mexe no saldo das contas nem nos relatórios.
        Pelo WhatsApp: &quot;guardei 200 na meta viagem&quot; ou &quot;como estão minhas metas?&quot;.
      </p>

      {goals.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 14 }}>
          Total guardado em {goals.length} meta{goals.length === 1 ? "" : "s"}: <strong style={{ color: "var(--ink)" }}>{formatBRL(totalSaved)}</strong>
        </p>
      )}

      {alerts && (
        <form action={setAlerts} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
          <input type="hidden" name="enabled" value={alerts.enabled ? "false" : "true"} />
          <span>
            Alertas por e-mail (meta atrasada, prazo perto ou vencido) para <strong style={{ color: "var(--ink)" }}>{alerts.email}</strong>:{" "}
            <strong style={{ color: alerts.enabled ? "var(--green)" : "var(--ink)" }}>{alerts.enabled ? "ligados" : "desligados"}</strong>
          </span>
          <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}>
            {alerts.enabled ? "Desligar" : "Ligar"}
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: 16, marginTop: 20 }}>
        {goals.map((g) => {
          const status = statusLine(g);
          const barColor = g.state === "CONCLUIDA" ? "var(--green)" : g.state === "VENCIDA" || g.behind ? "var(--red)" : "var(--blue)";
          return (
            <div key={g.id} className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <PiggyBank size={18} color={barColor} />
                <strong style={{ fontSize: 15, flex: 1 }}>{g.name}</strong>
                {g.behind && <span className="pill pill-red">Atrasada</span>}
                {g.state === "VENCIDA" && <span className="pill pill-red">Vencida</span>}
                {g.state === "COM_PRAZO" && !g.behind && g.daysLeft !== null && g.daysLeft <= 7 && <span className="pill pill-muted">Vence em breve</span>}
                <ConfirmButton
                  action={deleteGoal}
                  id={g.id}
                  title="Apagar meta"
                  message={`Apagar a meta "${g.name}" e o histórico de aportes? Os ${formatBRL(g.saved)} guardados deixam de ser controlados aqui.`}
                >
                  <Trash2 size={15} />
                </ConfirmButton>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{formatBRL(g.saved)}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>de {formatBRL(g.target)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "var(--field-bg)", marginTop: 8 }} role="progressbar" aria-valuenow={Math.round(g.percent)} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${g.percent}%`, height: "100%", borderRadius: 4, background: barColor }} />
              </div>
              <div style={{ fontSize: 12, color: status.color, marginTop: 8 }}>
                {g.percent.toFixed(0)}% · {status.text}
              </div>

              <form action={contribute} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--card-border)" }}>
                <input type="hidden" name="id" value={g.id} />
                <input name="amount" inputMode="decimal" placeholder="Valor (R$)" required className="field" style={{ width: 110, fontSize: 13 }} />
                <input name="note" placeholder="Nota (opcional)" maxLength={140} className="field" style={{ flex: 1, minWidth: 100, fontSize: 13 }} />
                <button type="submit" name="direction" value="put" className="btn btn-primary" style={{ fontSize: 12, padding: "8px 12px" }}>
                  Guardar
                </button>
                <button type="submit" name="direction" value="take" className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 12px" }}>
                  Retirar
                </button>
              </form>

              {g.history.length > 0 && (
                <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, fontSize: 12, color: "var(--muted)", display: "grid", gap: 4 }}>
                  {g.history.slice(0, 5).map((h) => (
                    <li key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>
                        {formatStamp(h.createdAt)} · {h.by}
                        {h.note ? ` · ${h.note}` : ""}
                      </span>
                      <span style={{ color: h.amount >= 0 ? "var(--green)" : "var(--red)" }}>
                        {h.amount >= 0 ? "+ " : "− "}
                        {formatBRL(Math.abs(h.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Nova meta</div>
          <form action={createGoal} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input name="name" placeholder="Nome (ex: Viagem, Reserva de emergência)" required minLength={2} maxLength={60} className="field" />
            <input name="target" inputMode="decimal" placeholder="Valor da meta (R$)" required className="field" />
            <label style={{ fontSize: 12, color: "var(--muted)" }}>
              Prazo (opcional)
              <input name="deadline" type="date" className="field" style={{ marginTop: 4, width: "100%" }} />
            </label>
            <button type="submit" className="btn btn-primary" style={{ justifyContent: "center" }}>
              Criar meta
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
