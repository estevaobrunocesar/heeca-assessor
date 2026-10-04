import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, Scale } from "lucide-react";
import { revalidatePath } from "next/cache";
import { apiFetch } from "../../lib/api";
import { DeleteTransactionButton } from "../components/DeleteTransactionButton";
import { CategoryCell, type ChangeCategoryResult } from "../components/CategoryCell";
import { PersonCell, type ChangePersonResult } from "../components/PersonCell";

type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
  amount: string;
  description: string;
  date: string;
  categoryId: string | null;
  category: { name: string } | null;
  user: { name: string };
  account: { name: string } | null;
  toAccount: { name: string } | null;
  personId: string | null;
  person: { name: string } | null;
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

const FILTER_KEYS = ["from", "to", "categoryId", "type", "userId", "accountId", "minAmount", "maxAmount", "q"] as const;

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

async function changeCategory(id: string, categoryId: string): Promise<ChangeCategoryResult> {
  "use server";
  const res = await apiFetch(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ categoryId }) });
  if (!res.ok) return { ok: false };
  const { learnedKeyword } = (await res.json()) as { learnedKeyword: string | null };
  revalidatePath("/lancamentos");
  revalidatePath("/");
  return { ok: true, learnedKeyword };
}

async function changePerson(id: string, personId: string | null): Promise<ChangePersonResult> {
  "use server";
  const res = await apiFetch(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ personId }) });
  if (!res.ok) return { ok: false };
  revalidatePath("/lancamentos");
  revalidatePath("/pessoas");
  return { ok: true };
}

async function getUsers() {
  const res = await apiFetch("/api/users"); // admins only; anyone else just gets no user filter
  return res.ok ? ((await res.json()) as { id: string; name: string }[]) : [];
}

async function getAccounts() {
  const res = await apiFetch("/api/accounts");
  return res.ok ? ((await res.json()) as { id: string; name: string }[]) : [];
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
  { type: "TRANSFER", label: "Transferências" },
];

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const activeType = params.type ?? "";
  const [{ transactions, total }, categories, users, accounts] = await Promise.all([getTransactions(params), getCategories(), getUsers(), getAccounts()]);
  const exportQuery = new URLSearchParams();
  for (const key of FILTER_KEYS) if (params[key]) exportQuery.set(key, params[key]!);

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
        {users.length > 1 && (
          <select name="userId" defaultValue={params.userId ?? ""} className="field" style={{ flex: "1 1 150px" }}>
            <option value="">Todos os usuários</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <select name="accountId" defaultValue={params.accountId ?? ""} className="field" style={{ flex: "1 1 160px" }}>
          <option value="">Todas as contas e cartões</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input name="minAmount" inputMode="decimal" placeholder="Valor mínimo" defaultValue={params.minAmount} className="field" style={{ flex: "1 1 110px" }} />
        <input name="maxAmount" inputMode="decimal" placeholder="Valor máximo" defaultValue={params.maxAmount} className="field" style={{ flex: "1 1 110px" }} />
        <input name="q" placeholder="Buscar descrição ou loja" defaultValue={params.q} className="field" style={{ flex: "2 1 180px" }} />
        <button type="submit" className="btn btn-primary">
          Filtrar
        </button>
        <a href={`/api/transactions/export?${exportQuery.toString()}`} className="btn btn-ghost" download>
          Exportar CSV
        </a>
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
              <th style={{ paddingTop: 16 }}>Pessoa</th>
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
              const isTransfer = t.type === "TRANSFER"; // moves money between own accounts: neither income nor spending
              return (
                <tr key={t.id}>
                  <td style={{ paddingLeft: 18, color: "var(--muted)" }}>{formatDate(t.date)}</td>
                  <td style={{ fontWeight: 500 }}>
                    <Link href={`/lancamentos/${t.id}`} style={{ color: "inherit" }} title="Ver detalhes">
                      {t.description}
                    </Link>
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    {t.type === "INCOME" || t.type === "EXPENSE" ? (
                      <CategoryCell
                        id={t.id}
                        type={t.type}
                        categoryId={t.categoryId}
                        categoryName={t.category?.name ?? null}
                        action={changeCategory}
                      />
                    ) : (
                      (t.category?.name ?? "—")
                    )}
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    {t.type === "TRANSFER" ? `${t.account?.name ?? "—"} → ${t.toAccount?.name ?? "—"}` : (t.account?.name ?? "—")}
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    {t.type === "INCOME" || t.type === "EXPENSE" ? (
                      <PersonCell id={t.id} personId={t.personId} personName={t.person?.name ?? null} action={changePerson} />
                    ) : (
                      "—"
                    )}
                  </td>
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
                      color: isTransfer ? "var(--muted)" : isNegative ? "var(--red)" : "var(--green)",
                    }}
                  >
                    {isTransfer ? "" : isNegative ? "- " : "+ "}
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
                <td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>
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
