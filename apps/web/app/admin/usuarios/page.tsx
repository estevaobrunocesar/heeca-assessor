import { revalidatePath } from "next/cache";
import { apiFetch } from "../../../lib/api";

type User = {
  id: string;
  name: string;
  whatsappPhone: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "INACTIVE";
};

async function getUsers(): Promise<User[]> {
  const res = await apiFetch("/api/users");
  if (!res.ok) return [];
  return res.json();
}

async function createUser(formData: FormData) {
  "use server";
  await apiFetch("/api/users", {
    method: "POST",
    body: JSON.stringify({
      name: formData.get("name"),
      whatsappPhone: formData.get("whatsappPhone"),
      password: formData.get("password"),
      role: formData.get("role"),
    }),
  });
  revalidatePath("/admin/usuarios");
}

async function toggleStatus(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  await apiFetch(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
  });
  revalidatePath("/admin/usuarios");
}

export default async function UsersAdminPage() {
  const users = await getUsers();

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 64px" }}>
      <p className="eyebrow">Acesso</p>
      <h1 style={{ fontSize: 22, marginTop: 4 }}>Usuários</h1>

      <table style={{ marginTop: 28 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>WhatsApp</th>
            <th>Perfil</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td className="mono">{u.whatsappPhone}</td>
              <td>{u.role === "ADMIN" ? "Administrador" : "Usuário"}</td>
              <td>
                <span className={u.status === "ACTIVE" ? "" : "eyebrow"} style={{ color: u.status === "ACTIVE" ? "var(--azul)" : "var(--muted)" }}>
                  {u.status === "ACTIVE" ? "Ativo" : "Inativo"}
                </span>
              </td>
              <td>
                <form action={toggleStatus}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="status" value={u.status} />
                  <button type="submit" className="btn-ghost" style={{ border: "none", padding: 0 }}>
                    {u.status === "ACTIVE" ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 15, marginTop: 40 }}>Novo usuário</h2>
      <form action={createUser} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <input name="name" placeholder="Nome" required className="field" />
        <input name="whatsappPhone" placeholder="+5511999998888" required className="field mono" />
        <input name="password" type="password" placeholder="Senha" required className="field" />
        <select name="role" defaultValue="USER" className="field">
          <option value="USER">Usuário</option>
          <option value="ADMIN">Administrador</option>
        </select>
        <button type="submit" className="btn btn-primary">
          Criar
        </button>
      </form>
    </main>
  );
}
