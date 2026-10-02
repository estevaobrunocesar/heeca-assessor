import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, Scale } from "lucide-react";
import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";
import { DeleteTransactionButton } from "../components/DeleteTransactionButton";

type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
  amount: string;
  description: string;
  date: string;
  category: { name: string } | null;
  user: { name: string };
  account: { name: string } | null;
  isInstallment: boolean;
  installmentTotal: number | null;
};

type Category = { id: string; name: string };

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

const TYPE_META = {
  INCOME: { label: "Receita", icon: ArrowUpRight, pill: "pill-green" },
  EXPENSE: { label: "Despesa", icon: ArrowDownRight, pill: "pill-red" },
  TRANSFER: { label: "Transferência", icon: ArrowLeftRight, pill: "pill-muted" },
  ADJUSTMENT: { label: "Ajuste", icon: Scale, pill: "pill-muted" },
} as const;

async function getTransactions(searchParams: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  if (searchParams.from) params.set("from", searchParams.from);
  if (searchParams.to) params.set("to", searchParams.to);
  if (searchParams.categoryId) params.set("categoryId", searchParams.categoryId);
  if (searchParams.type) params.set("type", searchParams.type);

  const res = await apiFetch(`/api/transactions?${params.toString()}`);
  return res.json() as Promise<{ transactions: Transaction[]; total: number }>;
}

async function deleteTransaction(formData: FormData) {
  "use server";
  await apiFetch(`/api/transactions/${formData.get("id")}`, { method: "DELETE" });
  revalidatePath("/lancamentos");
  revalidatePath("/");
}

async function getCategories() {
  const res = await apiFetch("/api/categories");
  const categories = (await res.json()) as (Category & { children: Category[] })[];
  return categories.flatMap((c) => [c, ...c.children]);
}

const TABS = [
  { type: "", label: "Todos" },
  { type: "INCOME", label: "Receitas" },
  { type: "EXPENSE", label: "Despesas" },
];

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const activeType = params.type ?? "";
  const [{ transactions, total }, categories] = await Promise.all([getTransactions(params), getCategories()]);

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Lançamentos</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>Gerencie todas as suas receitas e despesas</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 20 }}>
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.type ? `?type=${tab.type}` : "?"}
            className={`tab ${activeType === tab.type ? "tab-active" : ""}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <form className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 16, marginTop: 16 }}>
        <input type="hidden" name="type" value={activeType} />
        <input type="date" name="from" defaultValue={params.from} className="field" style={{ flex: "1 1 140px" }} />
        <input type="date" name="to" defaultValue={params.to} className="field" style={{ flex: "1 1 140px" }} />
        <select name="categoryId" defaultValue={params.categoryId ?? ""} className="field" style={{ flex: "1 1 180px" }}>
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

      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 16 }}>{total} lançamento(s)</p>

      <div className="card" style={{ marginTop: 10, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 18, paddingTop: 16 }}>Data</th>
              <th style={{ paddingTop: 16 }}>Descrição</th>
              <th style={{ paddingTop: 16 }}>Categoria</th>
              <th style={{ paddingTop: 16 }}>Conta</th>
              <th style={{ paddingTop: 16 }}>Tipo</th>
              <th style={{ textAlign: "right", paddingTop: 16 }}>Valor</th>
              <th style={{ paddingRight: 18, paddingTop: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const meta = TYPE_META[t.type];
              const Icon = meta.icon;
              const amount = Number(t.amount);
              const isNegative = t.type === "EXPENSE" || (t.type === "ADJUSTMENT" && amount < 0);
              return (
                <tr key={t.id}>
                  <td style={{ paddingLeft: 18, color: "var(--muted)" }}>{formatDate(t.date)}</td>
                  <td style={{ fontWeight: 500 }}>{t.description}</td>
                  <td style={{ color: "var(--muted)" }}>{t.category?.name ?? "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{t.account?.name ?? "—"}</td>
                  <td>
                    <span className={`pill ${meta.pill}`}>
                      <Icon size={12} />
                      {meta.label}
                    </span>
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color: isNegative ? "var(--red)" : "var(--green)",
                    }}
                  >
                    {isNegative ? "- " : "+ "}
                    {formatBRL(Math.abs(amount))}
                  </td>
                  <td style={{ paddingRight: 18, textAlign: "right" }}>
                    <DeleteTransactionButton
                      action={deleteTransaction}
                      id={t.id}
                      installmentTotal={t.isInstallment ? t.installmentTotal : null}
                    />
                  </td>
                </tr>
              );
            })}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>
                  Nenhum lançamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
