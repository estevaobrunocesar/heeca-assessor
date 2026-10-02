import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";

type BudgetStatus = {
  id: string;
  categoryId: string;
  categoryName: string;
  limit: number;
  spent: number;
  percent: number;
};

type Category = { id: string; name: string; children: { id: string; name: string }[] };

type RecurringRule = {
  id: string;
  description: string;
  amount: string;
  type: "INCOME" | "EXPENSE";
  dayOfMonth: number;
  active: boolean;
  category: { name: string } | null;
  account: { name: string } | null;
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function getBudgets(): Promise<BudgetStatus[]> {
  const res = await apiFetch("/api/budgets");
  return res.json();
}

async function getExpenseCategories(): Promise<Category[]> {
  const res = await apiFetch("/api/categories");
  const categories = (await res.json()) as (Category & { type: string })[];
  return categories.filter((c) => c.type === "EXPENSE").flatMap((c) => [c, ...c.children.map((ch) => ({ ...ch, children: [] }))]);
}

async function getRecurringRules(): Promise<RecurringRule[]> {
  const res = await apiFetch("/api/recurring");
  return res.json();
}

async function createBudget(formData: FormData) {
  "use server";
  await apiFetch("/api/budgets", {
    method: "POST",
    body: JSON.stringify({
      categoryId: formData.get("categoryId"),
      monthlyLimit: Number(formData.get("monthlyLimit")),
    }),
  });
  revalidatePath("/planejamento");
}

async function deleteBudget(formData: FormData) {
  "use server";
  await apiFetch(`/api/budgets/${formData.get("id")}`, { method: "DELETE" });
  revalidatePath("/planejamento");
}

async function createRecurring(formData: FormData) {
  "use server";
  await apiFetch("/api/recurring", {
    method: "POST",
    body: JSON.stringify({
      description: formData.get("description"),
      amount: Number(formData.get("amount")),
      type: formData.get("type"),
      dayOfMonth: Number(formData.get("dayOfMonth")),
      categoryId: formData.get("categoryId") || undefined,
    }),
  });
  revalidatePath("/planejamento");
}

async function toggleRecurring(formData: FormData) {
  "use server";
  await apiFetch(`/api/recurring/${formData.get("id")}`, {
    method: "PATCH",
    body: JSON.stringify({ active: formData.get("active") !== "true" }),
  });
  revalidatePath("/planejamento");
}

async function deleteRecurring(formData: FormData) {
  "use server";
  await apiFetch(`/api/recurring/${formData.get("id")}`, { method: "DELETE" });
  revalidatePath("/planejamento");
}

export default async function PlanejamentoPage() {
  const [budgets, categories, recurringRules] = await Promise.all([
    getBudgets(),
    getExpenseCategories(),
    getRecurringRules(),
  ]);

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <h1 style={{ fontSize: 24 }}>Planejamento</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        Defina limites de gasto por categoria e lançamentos que se repetem todo mês
      </p>

      <h2 style={{ fontSize: 15, marginTop: 32, color: "var(--muted)" }}>Orçamentos por categoria</h2>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {budgets.map((b) => {
          const over = b.percent >= 1;
          const warn = b.percent >= 0.8 && !over;
          const barColor = over ? "var(--red)" : warn ? "var(--amber)" : "var(--green)";
          return (
            <div key={b.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 14 }}>{b.categoryName}</strong>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {formatBRL(b.spent)} de {formatBRL(b.limit)}
                  </span>
                  <form action={deleteBudget}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" className="btn-danger-ghost" style={{ background: "none", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer" }}>
                      remover
                    </button>
                  </form>
                </div>
              </div>
              <div style={{ background: "var(--field-bg)", borderRadius: 999, height: 8, marginTop: 10, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(b.percent * 100, 100)}%`, background: barColor, height: "100%" }} />
              </div>
            </div>
          );
        })}
        {budgets.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>Nenhum orçamento definido ainda.</p>}
      </div>

      <div className="card" style={{ padding: 18, marginTop: 16, maxWidth: 520 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Novo orçamento</div>
        <form action={createBudget} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select name="categoryId" required className="field" style={{ flex: "1 1 180px" }}>
            <option value="">Categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="monthlyLimit" type="number" step="0.01" placeholder="Limite mensal (R$)" required className="field" style={{ flex: "1 1 140px" }} />
          <button type="submit" className="btn btn-primary">
            Criar
          </button>
        </form>
      </div>

      <h2 style={{ fontSize: 15, marginTop: 40, color: "var(--muted)" }}>Lançamentos recorrentes</h2>
      <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 18, paddingTop: 16 }}>Descrição</th>
              <th style={{ paddingTop: 16 }}>Categoria</th>
              <th style={{ paddingTop: 16 }}>Dia</th>
              <th style={{ paddingTop: 16, textAlign: "right" }}>Valor</th>
              <th style={{ paddingTop: 16 }}>Status</th>
              <th style={{ paddingTop: 16, paddingRight: 18, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {recurringRules.map((r) => (
              <tr key={r.id}>
                <td style={{ paddingLeft: 18 }}>{r.description}</td>
                <td style={{ color: "var(--muted)" }}>{r.category?.name ?? "—"}</td>
                <td style={{ color: "var(--muted)" }}>dia {r.dayOfMonth}</td>
                <td style={{ textAlign: "right", color: r.type === "EXPENSE" ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
                  {formatBRL(Number(r.amount))}
                </td>
                <td>
                  <span className={`pill ${r.active ? "pill-green" : "pill-muted"}`}>{r.active ? "Ativo" : "Pausado"}</span>
                </td>
                <td style={{ paddingRight: 18, textAlign: "right" }}>
                  <form action={toggleRecurring} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={String(r.active)} />
                    <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", marginRight: 6 }}>
                      {r.active ? "Pausar" : "Ativar"}
                    </button>
                  </form>
                  <form action={deleteRecurring} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn-danger-ghost" style={{ background: "none", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer" }}>
                      remover
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {recurringRules.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                  Nenhum lançamento recorrente cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 16, maxWidth: 640 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Nova recorrência</div>
        <form action={createRecurring} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input name="description" placeholder="Descrição (ex: Aluguel)" required className="field" style={{ flex: "1 1 160px" }} />
          <input name="amount" type="number" step="0.01" placeholder="Valor" required className="field" style={{ flex: "1 1 100px" }} />
          <select name="type" defaultValue="EXPENSE" className="field">
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </select>
          <select name="categoryId" className="field" style={{ flex: "1 1 160px" }}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="dayOfMonth" type="number" min={1} max={28} placeholder="Dia (1-28)" required className="field" style={{ width: 110 }} />
          <button type="submit" className="btn btn-primary">
            Criar
          </button>
        </form>
      </div>
    </main>
  );
}
