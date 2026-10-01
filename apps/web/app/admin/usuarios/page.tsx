import { revalidatePath } from "next/cache";
import { apiFetch } from "../../../lib/api";

type User = {
  id: string;
  name: string;
  whatsappPhone: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "INACTIVE";
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

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
      email: formData.get("email"),
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
    <main style={{ padding: "28px 28px 48px" }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Usuários</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>Gerencie os usuários do sistema</p>
      </div>

      <div className="card" style={{ marginTop: 24, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 18, paddingTop: 16 }}>Nome</th>
              <th style={{ paddingTop: 16 }}>E-mail</th>
              <th style={{ paddingTop: 16 }}>WhatsApp</th>
              <th style={{ paddingTop: 16 }}>Perfil</th>
              <th style={{ paddingTop: 16 }}>Status</th>
              <th style={{ paddingTop: 16, paddingRight: 18, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ paddingLeft: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "var(--primary)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {initials(u.name)}
                    </div>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ color: "var(--muted)" }}>{u.email}</td>
                <td style={{ color: "var(--muted)" }}>{u.whatsappPhone}</td>
                <td style={{ color: "var(--muted)" }}>{u.role === "ADMIN" ? "Administrador" : "Usuário"}</td>
                <td>
                  <span className={`pill ${u.status === "ACTIVE" ? "pill-green" : "pill-muted"}`}>
                    {u.status === "ACTIVE" ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td style={{ paddingRight: 18, textAlign: "right" }}>
                  <form action={toggleStatus}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="status" value={u.status} />
                    <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
                      {u.status === "ACTIVE" ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 24, maxWidth: 640 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Novo usuário</div>
        <form action={createUser} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input name="name" placeholder="Nome" required className="field" style={{ flex: "1 1 140px" }} />
          <input name="email" type="email" placeholder="E-mail" required className="field" style={{ flex: "1 1 160px" }} />
          <input name="whatsappPhone" placeholder="+5511999998888" required className="field" style={{ flex: "1 1 160px" }} />
          <input name="password" type="password" placeholder="Senha" required className="field" style={{ flex: "1 1 120px" }} />
          <select name="role" defaultValue="USER" className="field">
            <option value="USER">Usuário</option>
            <option value="ADMIN">Administrador</option>
          </select>
          <button type="submit" className="btn btn-primary">
            Criar
          </button>
        </form>
      </div>
    </main>
  );
}
