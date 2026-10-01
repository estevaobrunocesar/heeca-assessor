import { revalidatePath } from "next/cache";
import { apiFetch } from "../../../lib/api";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  children: { id: string; name: string }[];
};

async function getCategories(): Promise<Category[]> {
  const res = await apiFetch("/api/categories");
  return res.json();
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
  const categories = await getCategories();

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 64px" }}>
      <p className="eyebrow">Classificação</p>
      <h1 style={{ fontSize: 22, marginTop: 4 }}>Categorias</h1>

      <div style={{ marginTop: 28 }}>
        {categories.map((cat) => (
          <div key={cat.id} style={{ marginTop: 20 }}>
            <div className="ledger-row" style={{ borderBottom: "1px solid var(--ink)" }}>
              <strong style={{ fontSize: 14 }}>{cat.name}</strong>
              <span className="eyebrow">{cat.type === "EXPENSE" ? "despesa" : "receita"}</span>
              <span className="ledger-fill" />
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={cat.id} />
                <button type="submit" className="btn-danger-ghost">
                  remover
                </button>
              </form>
            </div>
            {cat.children.map((child) => (
              <div className="ledger-row" key={child.id} style={{ paddingLeft: 16 }}>
                <span className="ledger-label" style={{ color: "var(--muted)" }}>
                  {child.name}
                </span>
                <span className="ledger-fill" />
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={child.id} />
                  <button type="submit" className="btn-danger-ghost">
                    remover
                  </button>
                </form>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 15, marginTop: 40 }}>Nova categoria</h2>
      <form action={createCategory} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <input name="name" placeholder="Nome" required className="field" />
        <select name="type" defaultValue="EXPENSE" className="field">
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
        </select>
        <select name="parentId" defaultValue="" className="field">
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
    </main>
  );
}
