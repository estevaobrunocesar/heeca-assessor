import { revalidatePath } from "next/cache";
import { Star } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { BankLogo } from "../../components/BankLogo";
import { NewAccountForm } from "../../components/NewAccountForm";

type Account = {
  id: string;
  name: string;
  bank: string | null;
  type: "CHECKING" | "SAVINGS" | "DIGITAL" | "CASH" | "CREDIT_CARD" | "INVESTMENT" | "COFRINHO";
  isDefault: boolean;
  balance: number;
  creditLimit: number | null;
  availableLimit: number | null;
};

const TYPE_LABEL: Record<Account["type"], string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  DIGITAL: "Conta digital",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimentos",
  COFRINHO: "Cofrinho",
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function getAccounts(): Promise<Account[]> {
  const res = await apiFetch("/api/accounts");
  return res.json();
}

async function createAccount(formData: FormData) {
  "use server";
  const creditLimit = formData.get("creditLimit");
  await apiFetch("/api/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: formData.get("name"),
      bank: formData.get("bank") || null,
      type: formData.get("type"),
      isDefault: formData.get("isDefault") === "on",
      creditLimit: creditLimit ? Number(creditLimit) : undefined,
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

async function setCreditLimit(formData: FormData) {
  "use server";
  await apiFetch(`/api/accounts/${formData.get("id")}`, {
    method: "PATCH",
    body: JSON.stringify({ creditLimit: Number(formData.get("creditLimit")) }),
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
        {accounts.map((a) => {
          const isCard = a.type === "CREDIT_CARD";
          return (
            <div key={a.id} className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BankLogo bankName={a.bank} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.bank || a.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{TYPE_LABEL[a.type]}</div>
                </div>
                {a.isDefault && <Star size={16} color="var(--amber)" fill="var(--amber)" />}
              </div>

              {isCard ? (
                a.creditLimit !== null ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>
                      {formatBRL(a.availableLimit ?? 0)}
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}> disponível</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      de {formatBRL(a.creditLimit)} de limite
                    </div>
                    <div style={{ background: "var(--field-bg)", borderRadius: 999, height: 6, marginTop: 10, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(Math.max(((a.creditLimit - (a.availableLimit ?? 0)) / a.creditLimit) * 100, 0), 100)}%`,
                          background: "var(--red)",
                          height: "100%",
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 16 }}>Limite ainda não definido</div>
                )
              ) : (
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>{formatBRL(a.balance)}</div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--card-border)" }}>
                {!a.isDefault && (
                  <form action={setDefault}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
                      Tornar padrão
                    </button>
                  </form>
                )}

                {isCard && (
                  <form action={setCreditLimit} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      name="creditLimit"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={a.creditLimit ?? ""}
                      placeholder="Limite do cartão"
                      required
                      className="field"
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "9px 10px" }}>
                      Salvar limite
                    </button>
                  </form>
                )}

                <form action={adjustBalance} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="id" value={a.id} />
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    placeholder="+150 ou -80"
                    required
                    className="field"
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "9px 10px" }}>
                    Ajustar
                  </button>
                </form>
                {isCard && (
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
                    "Ajustar" lança uma correção avulsa (ex: pagamento de fatura). O limite se edita acima.
                  </p>
                )}
              </div>
            </div>
          );
        })}

        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Nova conta</div>
          <NewAccountForm action={createAccount} />
        </div>
      </div>
    </main>
  );
}
