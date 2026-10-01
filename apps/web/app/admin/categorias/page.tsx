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
    <main style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
      <h1>Categorias</h1>

      {categories.map((cat) => (
        <div key={cat.id} style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>{cat.name}</strong>
            <span style={{ fontSize: 12, color: "#999" }}>{cat.type === "EXPENSE" ? "Despesa" : "Receita"}</span>
            <form action={deleteCategory}>
              <input type="hidden" name="id" value={cat.id} />
              <button type="submit" style={linkButtonStyle}>
                remover
              </button>
            </form>
          </div>
          <ul style={{ marginTop: 6 }}>
            {cat.children.map((child) => (
              <li key={child.id} style={{ fontSize: 14, color: "#ccc", display: "flex", alignItems: "center", gap: 8 }}>
                {child.name}
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={child.id} />
                  <button type="submit" style={linkButtonStyle}>
                    remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h2 style={{ marginTop: 40, fontSize: 16 }}>Nova categoria</h2>
      <form action={createCategory} style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <input name="name" placeholder="Nome" required style={inputStyle} />
        <select name="type" defaultValue="EXPENSE" style={inputStyle}>
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
        </select>
        <select name="parentId" defaultValue="" style={inputStyle}>
          <option value="">Categoria principal (sem pai)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              Sub de: {c.name}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          Criar
        </button>
      </form>
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

const linkButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#ef4444",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};
