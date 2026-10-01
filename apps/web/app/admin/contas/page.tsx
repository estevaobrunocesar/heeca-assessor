import { revalidatePath } from "next/cache";
import { Landmark, Star } from "lucide-react";
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

const BADGE_COLORS = ["#e11d2e", "#7c3aed", "#2563eb", "#16a34a", "#d97706", "#0891b2"];

function badgeColor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    <main style={{ padding: "28px 28px 48px" }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Contas bancárias</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
          Gerencie suas contas e saldos — calculados pelos lançamentos, com ajuste manual quando precisar
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginTop: 24 }}>
        {accounts.map((a) => (
          <div key={a.id} className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  background: badgeColor(a.bank ?? a.name),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Landmark size={17} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.bank || a.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{TYPE_LABEL[a.type]}</div>
              </div>
              {a.isDefault && <Star size={16} color="var(--amber)" fill="var(--amber)" />}
            </div>

            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>{formatBRL(a.balance)}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--card-border)" }}>
              {!a.isDefault && (
                <form action={setDefault}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
                    Tornar padrão
                  </button>
                </form>
              )}
              <form action={adjustBalance} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="id" value={a.id} />
                <input name="amount" type="number" step="0.01" placeholder="+150 ou -80" required className="field" style={{ flex: 1, fontSize: 13 }} />
                <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "9px 10px" }}>
                  Ajustar
                </button>
              </form>
            </div>
          </div>
        ))}

        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Nova conta</div>
          <form action={createAccount} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input name="name" placeholder="Nome (ex: Conta corrente)" required className="field" />
            <input name="bank" placeholder="Banco (opcional)" className="field" />
            <select name="type" defaultValue="CHECKING" className="field">
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
              <input type="checkbox" name="isDefault" /> Definir como padrão
            </label>
            <button type="submit" className="btn btn-primary" style={{ justifyContent: "center", marginTop: 4 }}>
              Adicionar conta
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
