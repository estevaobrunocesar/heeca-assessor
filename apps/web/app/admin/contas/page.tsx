import { revalidatePath } from "next/cache";
import { apiFetch } from "../../../lib/api";

type Account = {
  id: string;
  name: string;
  bank: string | null;
  type: "CHECKING" | "SAVINGS" | "DIGITAL" | "CASH" | "CREDIT_CARD" | "INVESTMENT";
  isDefault: boolean;
  balance: number;
};

const TYPE_LABEL: Record<Account["type"], string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  DIGITAL: "Conta digital",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimentos",
};

function formatBRL(value: number) {
  return Math.abs(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function getAccounts(): Promise<Account[]> {
  const res = await apiFetch("/api/accounts");
  return res.json();
}

async function createAccount(formData: FormData) {
  "use server";
  await apiFetch("/api/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: formData.get("name"),
      bank: formData.get("bank") || null,
      type: formData.get("type"),
      isDefault: formData.get("isDefault") === "on",
    }),
  });
  revalidatePath("/admin/contas");
}

async function setDefault(formData: FormData) {
  "use server";
  await apiFetch(`/api/accounts/${formData.get("id")}`, {
    method: "PATCH",
    body: JSON.stringify({ isDefault: true }),
  });
  revalidatePath("/admin/contas");
}

async function adjustBalance(formData: FormData) {
  "use server";
  const amount = Number(formData.get("amount"));
  await apiFetch(`/api/accounts/${formData.get("id")}/adjust`, {
    method: "POST",
    body: JSON.stringify({ amount, note: formData.get("note") || undefined }),
  });
  revalidatePath("/admin/contas");
}

export default async function AccountsAdminPage() {
  const accounts = await getAccounts();

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 64px" }}>
      <p className="eyebrow">Contas e saldos</p>
      <h1 style={{ fontSize: 22, marginTop: 4 }}>Contas</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10, maxWidth: 560 }}>
        O saldo é calculado pelos lançamentos registrados em cada conta. Use o ajuste manual para corrigir
        divergências com o extrato real do banco.
      </p>

      <div style={{ display: "grid", gap: 1, marginTop: 28 }}>
        {accounts.map((a) => (
          <div key={a.id} className="panel" style={{ padding: "18px 20px", marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ fontSize: 15 }}>{a.name}</strong>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {" "}
                  {a.bank && `· ${a.bank} `}· {TYPE_LABEL[a.type]}
                </span>
                {a.isDefault && <span className="badge" style={{ marginLeft: 10 }}>padrão</span>}
              </div>
              <div
                className={`mono ${a.balance >= 0 ? "sign-up" : "sign-down"}`}
                style={{ fontSize: 20, fontWeight: 600 }}
              >
                {formatBRL(a.balance)}
              </div>
            </div>

            <hr className="hairline" style={{ margin: "14px 0" }} />

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {!a.isDefault && (
                <form action={setDefault}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="btn-ghost" style={{ border: "none", padding: 0 }}>
                    Tornar padrão
                  </button>
                </form>
              )}
              <form action={adjustBalance} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="hidden" name="id" value={a.id} />
                <input name="amount" type="number" step="0.01" placeholder="Ex: 150 ou -80" required className="field mono" style={{ width: 130 }} />
                <input name="note" placeholder="Motivo (opcional)" className="field" style={{ width: 180 }} />
                <button type="submit" className="btn btn-ghost">
                  Ajustar saldo
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 15, marginTop: 40 }}>Nova conta</h2>
      <form action={createAccount} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <input name="name" placeholder="Nome (ex: Conta corrente)" required className="field" />
        <input name="bank" placeholder="Banco (opcional)" className="field" />
        <select name="type" defaultValue="CHECKING" className="field">
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
          <input type="checkbox" name="isDefault" /> Definir como padrão
        </label>
        <button type="submit" className="btn btn-primary">
          Criar
        </button>
      </form>
    </main>
  );
}
