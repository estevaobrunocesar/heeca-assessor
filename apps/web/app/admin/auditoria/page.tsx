import Link from "next/link";
import { apiFetch } from "../../../lib/api";

type Item = { id: string; at: string; user: string | null; label: string; action: string; entityId: string | null; detail: string | null; ip: string | null; status: number | null };
type Audit = { total: number; page: number; pageSize: number; items: Item[] };

const stamp = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["userId", "from", "to", "page"] as const) if (params[key]) query.set(key, params[key]!);

  const [res, usersRes] = await Promise.all([apiFetch(`/api/audit?${query.toString()}`), apiFetch("/api/users")]);
  const audit: Audit | null = res.ok ? await res.json() : null;
  const users: { id: string; name: string }[] = usersRes.ok ? await usersRes.json() : [];

  const page = audit?.page ?? 1;
  const pages = audit ? Math.max(1, Math.ceil(audit.total / audit.pageSize)) : 1;
  const link = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/admin/auditoria?${q.toString()}`;
  };

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <h1 style={{ fontSize: 24 }}>Auditoria</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, maxWidth: 700 }}>
        Quem fez o quê e quando: entradas no sistema, alterações e exclusões. Não guarda senhas nem valores, só a ação e o item afetado.
      </p>

      <form className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 16, marginTop: 20 }}>
        <select name="userId" defaultValue={params.userId ?? ""} className="field" style={{ flex: "1 1 180px" }}>
          <option value="">Todos os usuários</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={params.from} className="field" style={{ flex: "1 1 140px" }} />
        <input type="date" name="to" defaultValue={params.to} className="field" style={{ flex: "1 1 140px" }} />
        <button type="submit" className="btn btn-primary">
          Filtrar
        </button>
      </form>

      {!audit ? (
        <p style={{ color: "var(--muted)", marginTop: 20 }}>Não foi possível carregar a auditoria (apenas administradores têm acesso).</p>
      ) : (
        <>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 16 }}>{audit.total} registro(s)</p>
          <div className="card" style={{ marginTop: 10, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18, paddingTop: 16 }}>Quando</th>
                  <th style={{ paddingTop: 16 }}>Quem</th>
                  <th style={{ paddingTop: 16 }}>O quê</th>
                  <th style={{ paddingTop: 16 }}>Detalhe</th>
                  <th style={{ paddingTop: 16, paddingRight: 18 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {audit.items.map((i) => {
                  const failed = i.action === "LOGIN_FAILED" || i.action === "LOGIN_MFA_FAILED";
                  return (
                    <tr key={i.id}>
                      <td style={{ paddingLeft: 18, color: "var(--muted)", whiteSpace: "nowrap" }}>{stamp(i.at)}</td>
                      <td>{i.user ?? "—"}</td>
                      <td style={{ color: failed ? "var(--red)" : undefined }}>{i.label}</td>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>{i.detail ?? (i.entityId ? i.entityId.slice(0, 8) : "—")}</td>
                      <td style={{ color: "var(--muted)", fontSize: 12, paddingRight: 18 }}>{i.ip ?? "—"}</td>
                    </tr>
                  );
                })}
                {audit.items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, color: "var(--muted)" }}>
                      Nenhum registro neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, fontSize: 13 }}>
              {page > 1 && <Link href={link(page - 1)}>← Anteriores</Link>}
              <span style={{ color: "var(--muted)" }}>
                Página {page} de {pages}
              </span>
              {page < pages && <Link href={link(page + 1)}>Mais antigos →</Link>}
            </div>
          )}
        </>
      )}
    </main>
  );
}
