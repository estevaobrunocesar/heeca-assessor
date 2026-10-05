import { revalidatePath } from "next/cache";
import {
  UtensilsCrossed,
  Car,
  Home,
  HeartPulse,
  GraduationCap,
  Film,
  Wallet,
  Tag,
  Trash2,
} from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { ConfirmButton } from "../../components/ConfirmButton";
import { ApplyRuleButton } from "../../components/ApplyRuleButton";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  children: { id: string; name: string }[];
};

const ICONS: Record<string, typeof Tag> = {
  Alimentação: UtensilsCrossed,
  Transporte: Car,
  Casa: Home,
  Saúde: HeartPulse,
  Educação: GraduationCap,
  Lazer: Film,
  Financeiro: Wallet,
};

async function getCategories(): Promise<Category[]> {
  const res = await apiFetch("/api/categories");
  return res.json();
}

type KeywordRule = { id: string; keyword: string; source: "MANUAL" | "LEARNED"; category: string | null };

async function getKeywordRules(): Promise<KeywordRule[]> {
  const res = await apiFetch("/api/category-keywords");
  if (!res.ok) return [];
  return res.json();
}

async function addKeywordRule(formData: FormData) {
  "use server";
  await apiFetch("/api/category-keywords", {
    method: "POST",
    body: JSON.stringify({ keyword: formData.get("keyword"), categoryId: formData.get("categoryId") }),
  });
  revalidatePath("/admin/categorias");
}

async function deleteKeywordRule(formData: FormData) {
  "use server";
  await apiFetch(`/api/category-keywords/${formData.get("id")}`, { method: "DELETE" });
  revalidatePath("/admin/categorias");
}

async function createCategory(formData: FormData) {
  "use server";
  const parentId = formData.get("parentId") as string;
  await apiFetch("/api/categories", {
    method: "POST",
    body: JSON.stringify({
      name: formData.get("name"),
      type: formData.get("type"),
      parentId: parentId || null,
    }),
  });
  revalidatePath("/admin/categorias");
}

async function deleteCategory(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
  revalidatePath("/admin/categorias");
}

export default async function CategoriesAdminPage() {
  const [categories, rules] = await Promise.all([getCategories(), getKeywordRules()]);
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const incomeCategories = categories.filter((c) => c.type === "INCOME");

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Categorias</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>Organize seus lançamentos por categoria</p>
      </div>

      <h2 style={{ fontSize: 15, marginTop: 28, color: "var(--muted)" }}>Despesas</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 14, marginTop: 12 }}>
        {expenseCategories.map((cat) => {
          const Icon = ICONS[cat.name] ?? Tag;
          return (
            <div key={cat.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 9,
                    background: "var(--red-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={17} color="var(--red)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{cat.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{cat.children.length} subcategorias</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                {cat.children.map((child) => (
                  <form action={deleteCategory} key={child.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="hidden" name="id" value={child.id} />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{child.name}</span>
                    <button type="submit" className="icon-btn icon-btn-danger" style={{ width: 20, height: 20 }} aria-label={`Remover ${child.name}`}>
                      <Trash2 size={11} />
                    </button>
                  </form>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={cat.id} />
                  <button type="submit" className="icon-btn icon-btn-danger" aria-label={`Remover ${cat.name}`}>
                    <Trash2 size={14} />
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 15, marginTop: 32, color: "var(--muted)" }}>Receitas</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 14, marginTop: 12 }}>
        {incomeCategories.map((cat) => (
          <div key={cat.id} className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  background: "var(--green-soft)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Wallet size={17} color="var(--green)" />
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{cat.name}</div>
            </div>
            <form action={deleteCategory}>
              <input type="hidden" name="id" value={cat.id} />
              <button type="submit" className="icon-btn icon-btn-danger" aria-label={`Remover ${cat.name}`}>
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 15, marginTop: 36, color: "var(--muted)" }}>Regras de categoria</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, maxWidth: 640 }}>
        Quando uma palavra aparece na mensagem, o lançamento vai direto para a categoria escolhida, antes do palpite da IA.
        Quando você corrige uma categoria pelo WhatsApp, o assistente cria a regra sozinho.
      </p>
      <div className="card" style={{ padding: 18, marginTop: 12 }}>
        <form action={addKeywordRule} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input name="keyword" placeholder="Palavra ou loja (ex: pizza, Uber)" required className="field" style={{ flex: "1 1 200px" }} />
          <select name="categoryId" required defaultValue="" className="field" style={{ flex: "1 1 240px" }}>
            <option value="" disabled>
              Categoria
            </option>
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
          <button type="submit" className="btn btn-primary">
            Adicionar regra
          </button>
        </form>
        {rules.length > 0 && (
          <table style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Palavra</th>
                <th>Categoria</th>
                <th>Origem</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.keyword}</td>
                  <td style={{ color: "var(--muted)" }}>{r.category ?? "—"}</td>
                  <td>
                    <span className={`pill ${r.source === "LEARNED" ? "pill-green" : "pill-muted"}`}>
                      {r.source === "LEARNED" ? "Aprendida" : "Manual"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                    <ApplyRuleButton ruleId={r.id} keyword={r.keyword} />
                    <ConfirmButton action={deleteKeywordRule} id={r.id} title="Apagar regra" message={`Apagar a regra "${r.keyword}"?`}>
                      <Trash2 size={15} />
                    </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 18, marginTop: 32, maxWidth: 560 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Nova categoria</div>
        <form action={createCategory} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input name="name" placeholder="Nome" required className="field" style={{ flex: "1 1 160px" }} />
          <select name="type" defaultValue="EXPENSE" className="field">
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </select>
          <select name="parentId" defaultValue="" className="field" style={{ flex: "1 1 200px" }}>
            <option value="">Categoria principal (sem pai)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                Sub de: {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            Criar
          </button>
        </form>
      </div>
    </main>
  );
}
