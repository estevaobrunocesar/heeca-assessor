import { apiFetch } from "../../lib/api";

type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: string;
  description: string;
  date: string;
  category: { name: string } | null;
  user: { name: string };
  origin: string;
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
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Lançamentos</h1>

      <form style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0" }}>
        <input type="date" name="from" defaultValue={params.from} style={inputStyle} />
        <input type="date" name="to" defaultValue={params.to} style={inputStyle} />
        <select name="type" defaultValue={params.type ?? ""} style={inputStyle}>
          <option value="">Todos os tipos</option>
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
          <option value="TRANSFER">Transferência</option>
        </select>
        <select name="categoryId" defaultValue={params.categoryId ?? ""} style={inputStyle}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          Filtrar
        </button>
      </form>

      <p style={{ color: "#999", fontSize: 13 }}>{total} lançamento(s)</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2d34", color: "#999", fontSize: 13 }}>
            <th style={thStyle}>Data</th>
            <th style={thStyle}>Tipo</th>
            <th style={thStyle}>Descrição</th>
            <th style={thStyle}>Categoria</th>
            <th style={thStyle}>Usuário</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} style={{ borderBottom: "1px solid #1f2128" }}>
              <td style={tdStyle}>{formatDate(t.date)}</td>
              <td style={tdStyle}>{TYPE_LABEL[t.type]}</td>
              <td style={tdStyle}>{t.description}</td>
              <td style={tdStyle}>{t.category?.name ?? "—"}</td>
              <td style={tdStyle}>{t.user.name}</td>
              <td style={{ ...tdStyle, textAlign: "right", color: t.type === "EXPENSE" ? "#ef4444" : "#10b981" }}>
                {formatBRL(Number(t.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#1a1d24",
  border: "1px solid #2a2d34",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#e8e8e8",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "0 16px",
  fontSize: 14,
  cursor: "pointer",
};

const thStyle: React.CSSProperties = { padding: "8px 12px" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
