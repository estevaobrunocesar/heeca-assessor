import { revalidatePath } from "next/cache";
import { Check, Repeat, Trash2 } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { ConfirmButton } from "../components/ConfirmButton";

type Bill = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "PENDING" | "PAID" | "CANCELED";
  state: "VENCIDA" | "HOJE" | "A_VENCER" | null;
  repeatMonthly: boolean;
  paidAt: string | null;
  category: string | null;
  account: string | null;
};

type Category = { id: string; name: string; type: string; children: { id: string; name: string }[] };
type Account = { id: string; name: string; bank: string | null; type: string };

const STATE_META = {
  VENCIDA: { label: "Vencida", pill: "pill-red" },
  HOJE: { label: "Vence hoje", pill: "pill-red" },
  A_VENCER: { label: "A vencer", pill: "pill-muted" },
} as const;

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Due dates are plain calendar days serialized as ISO timestamps; read them
// in UTC so the day never shifts with the viewer's timezone.
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

async function getBills(): Promise<{ pending: Bill[]; paid: Bill[] }> {
  const res = await apiFetch("/api/bills");
  if (!res.ok) return { pending: [], paid: [] };
  return res.json();
}

async function getCategories(): Promise<Category[]> {
  const res = await apiFetch("/api/categories");
  if (!res.ok) return [];
  const all = (await res.json()) as (Category & { parentId: string | null })[];
  return all.filter((c) => c.type === "EXPENSE" && !c.parentId);
}

async function getAccounts(): Promise<Account[]> {
  const res = await apiFetch("/api/accounts");
  if (!res.ok) return [];
  return res.json();
}

async function createBill(formData: FormData) {
  "use server";
  await apiFetch("/api/bills", {
    method: "POST",
    body: JSON.stringify({
      description: formData.get("description"),
      amount: Number(formData.get("amount")),
      dueDate: formData.get("dueDate"),
      categoryId: formData.get("categoryId") || undefined,
      accountId: formData.get("accountId") || undefined,
      repeatMonthly: formData.get("repeatMonthly") === "on",
    }),
  });
  revalidatePath("/contas-a-pagar");
  revalidatePath("/");
}

async function payBill(formData: FormData) {
  "use server";
  await apiFetch(`/api/bills/${formData.get("id")}/pay`, { method: "POST", body: JSON.stringify({}) });
  revalidatePath("/contas-a-pagar");
  revalidatePath("/lancamentos");
  revalidatePath("/");
}

async function cancelBill(formData: FormData) {
  "use server";
  await apiFetch(`/api/bills/${formData.get("id")}`, { method: "DELETE" });
  revalidatePath("/contas-a-pagar");
  revalidatePath("/");
}

export default async function BillsPage() {
  const [{ pending, paid }, categories, accounts] = await Promise.all([getBills(), getCategories(), getAccounts()]);

  const overdue = pending.filter((b) => b.state === "VENCIDA");
  const sum = (items: Bill[]) => items.reduce((acc, b) => acc + b.amount, 0);

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Contas a pagar</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
          O que ainda falta pagar. Ao marcar como paga, vira uma despesa de verdade nos seus lançamentos.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 14, marginTop: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Total pendente</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatBRL(sum(pending))}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{pending.length} conta(s)</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Vencidas</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: overdue.length ? "var(--red)" : undefined }}>
            {formatBRL(sum(overdue))}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{overdue.length} conta(s) em atraso</div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Nova conta a pagar</div>
        <form action={createBill} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input name="description" placeholder="Descrição (ex: Aluguel)" required className="field" style={{ flex: "2 1 180px" }} />
          <input name="amount" type="number" step="0.01" min="0.01" placeholder="Valor" required className="field" style={{ flex: "1 1 110px" }} />
          <input name="dueDate" type="date" required className="field" style={{ flex: "1 1 150px" }} />
          <select name="categoryId" defaultValue="" className="field" style={{ flex: "1 1 170px" }}>
            <option value="">Categoria (opcional)</option>
            {categories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name}</option>
                {c.children.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select name="accountId" defaultValue="" className="field" style={{ flex: "1 1 150px" }}>
            <option value="">Conta (opcional)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank ?? a.name}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
            <input type="checkbox" name="repeatMonthly" /> Repete todo mês
          </label>
          <button type="submit" className="btn btn-primary">
            Adicionar
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 24, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 18, paddingTop: 16 }}>Vencimento</th>
              <th style={{ paddingTop: 16 }}>Descrição</th>
              <th style={{ paddingTop: 16 }}>Categoria</th>
              <th style={{ paddingTop: 16 }}>Situação</th>
              <th style={{ textAlign: "right", paddingTop: 16 }}>Valor</th>
              <th style={{ paddingRight: 18, paddingTop: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((b) => {
              const meta = STATE_META[b.state ?? "A_VENCER"];
              return (
                <tr key={b.id}>
                  <td style={{ paddingLeft: 18, color: "var(--muted)" }}>{formatDay(b.dueDate)}</td>
                  <td style={{ fontWeight: 500 }}>
                    {b.description}
                    {b.repeatMonthly && <Repeat size={12} style={{ marginLeft: 6, color: "var(--muted)" }} aria-label="Repete todo mês" />}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{b.category ?? "—"}</td>
                  <td>
                    <span className={`pill ${meta.pill}`}>{meta.label}</span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{formatBRL(b.amount)}</td>
                  <td style={{ paddingRight: 18 }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <form action={payBill}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", gap: 5 }}>
                          <Check size={13} /> Paguei
                        </button>
                      </form>
                      <ConfirmButton action={cancelBill} id={b.id} title="Cancelar conta" message={`Cancelar "${b.description}"? Nenhuma despesa será registrada.`}>
                        <Trash2 size={15} />
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pending.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>
                  Nenhuma conta a pagar pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paid.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 28 }}>Pagas recentemente</h2>
          <div className="card" style={{ marginTop: 10, overflow: "hidden" }}>
            <table>
              <tbody>
                {paid.map((b) => (
                  <tr key={b.id}>
                    <td style={{ paddingLeft: 18, color: "var(--muted)" }}>{b.paidAt ? formatDay(b.paidAt) : "—"}</td>
                    <td>{b.description}</td>
                    <td style={{ color: "var(--muted)" }}>{b.category ?? "—"}</td>
                    <td style={{ textAlign: "right", paddingRight: 18, fontWeight: 600 }}>{formatBRL(b.amount)}</td>
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
