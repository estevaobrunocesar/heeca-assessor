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
    <main style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
      <h1>Usuários</h1>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2d34", color: "#999", fontSize: 13 }}>
            <th style={thStyle}>Nome</th>
            <th style={thStyle}>WhatsApp</th>
            <th style={thStyle}>Perfil</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #1f2128" }}>
              <td style={tdStyle}>{u.name}</td>
              <td style={tdStyle}>{u.whatsappPhone}</td>
              <td style={tdStyle}>{u.role === "ADMIN" ? "Administrador" : "Usuário"}</td>
              <td style={tdStyle}>{u.status === "ACTIVE" ? "Ativo" : "Inativo"}</td>
              <td style={tdStyle}>
                <form action={toggleStatus}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="status" value={u.status} />
                  <button type="submit" style={linkButtonStyle}>
                    {u.status === "ACTIVE" ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 40, fontSize: 16 }}>Novo usuário</h2>
      <form action={createUser} style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <input name="name" placeholder="Nome" required style={inputStyle} />
        <input name="whatsappPhone" placeholder="+5511999998888" required style={inputStyle} />
        <input name="password" type="password" placeholder="Senha" required style={inputStyle} />
        <select name="role" defaultValue="USER" style={inputStyle}>
          <option value="USER">Usuário</option>
          <option value="ADMIN">Administrador</option>
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
  color: "#3b82f6",
  cursor: "pointer",
  fontSize: 13,
  padding: 0,
};

const thStyle: React.CSSProperties = { padding: "8px 12px" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
