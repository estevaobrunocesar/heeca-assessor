import { apiFetch } from "../../lib/api";

type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
  amount: string;
  description: string;
  date: string;
  category: { name: string } | null;
  user: { name: string };
  account: { name: string } | null;
};

type Category = { id: string; name: string };

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

const TYPE_LABEL: Record<Transaction["type"], string> = {
  INCOME: "Receita",
  EXPENSE: "Despesa",
  TRANSFER: "Transferência",
  ADJUSTMENT: "Ajuste",
};

async function getTransactions(searchParams: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  if (searchParams.from) params.set("from", searchParams.from);
  if (searchParams.to) params.set("to", searchParams.to);
  if (searchParams.categoryId) params.set("categoryId", searchParams.categoryId);
  if (searchParams.type) params.set("type", searchParams.type);

  const res = await apiFetch(`/api/transactions?${params.toString()}`);
  return res.json() as Promise<{ transactions: Transaction[]; total: number }>;
}

async function getCategories() {
  const res = await apiFetch("/api/categories");
  const categories = (await res.json()) as (Category & { children: Category[] })[];
  return categories.flatMap((c) => [c, ...c.children]);
}

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [{ transactions, total }, categories] = await Promise.all([getTransactions(params), getCategories()]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 64px" }}>
      <p className="eyebrow">Extrato</p>
      <h1 style={{ fontSize: 22, marginTop: 4 }}>Lançamentos</h1>

      <form style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "24px 0" }}>
        <input type="date" name="from" defaultValue={params.from} className="field mono" />
        <input type="date" name="to" defaultValue={params.to} className="field mono" />
        <select name="type" defaultValue={params.type ?? ""} className="field">
          <option value="">Todos os tipos</option>
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
          <option value="TRANSFER">Transferência</option>
          <option value="ADJUSTMENT">Ajuste</option>
        </select>
        <select name="categoryId" defaultValue={params.categoryId ?? ""} className="field">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">
          Filtrar
        </button>
      </form>

      <p className="eyebrow">{total} lançamento(s)</p>

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Conta</th>
            <th>Usuário</th>
            <th style={{ textAlign: "right" }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const amount = Number(t.amount);
            const isExpense = t.type === "EXPENSE" || (t.type === "ADJUSTMENT" && amount < 0);
            return (
              <tr key={t.id}>
                <td className="mono">{formatDate(t.date)}</td>
                <td>{TYPE_LABEL[t.type]}</td>
                <td>{t.description}</td>
                <td style={{ color: "var(--muted)" }}>{t.category?.name ?? "—"}</td>
                <td style={{ color: "var(--muted)" }}>{t.account?.name ?? "—"}</td>
                <td style={{ color: "var(--muted)" }}>{t.user.name}</td>
                <td
                  className="mono"
                  style={{ textAlign: "right", color: isExpense ? "var(--vermelho)" : "var(--azul)" }}
                >
                  {formatBRL(Math.abs(amount))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
