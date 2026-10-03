import { revalidatePath } from "next/cache";
import { Trash2, UserRound } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { ConfirmButton } from "../components/ConfirmButton";

type Person = {
  id: string;
  name: string;
  relation: string | null;
  monthTotal: number;
  monthCount: number;
  totalCount: number;
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function getPeople(): Promise<Person[]> {
  const res = await apiFetch("/api/people");
  if (!res.ok) return [];
  return res.json();
}

async function createPerson(formData: FormData) {
  "use server";
  await apiFetch("/api/people", {
    method: "POST",
    body: JSON.stringify({ name: formData.get("name"), relation: formData.get("relation") || undefined }),
  });
  revalidatePath("/pessoas");
}

async function updatePerson(formData: FormData) {
  "use server";
  await apiFetch(`/api/people/${formData.get("id")}`, {
    method: "PATCH",
    body: JSON.stringify({ name: formData.get("name"), relation: formData.get("relation") || null }),
  });
  revalidatePath("/pessoas");
  revalidatePath("/lancamentos");
}

async function deletePerson(formData: FormData) {
  "use server";
  await apiFetch(`/api/people/${formData.get("id")}`, { method: "DELETE" });
  revalidatePath("/pessoas");
  revalidatePath("/lancamentos");
}

export default async function PeoplePage() {
  const people = await getPeople();

  return (
    <main style={{ padding: "28px 28px 48px" }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Pessoas</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, maxWidth: 680 }}>
          Quem aparece nos seus gastos: esposa, filhos, mãe… Ao registrar &quot;presente pra Marília 120&quot; pelo WhatsApp a pessoa é
          cadastrada sozinha. Depois dá para perguntar &quot;quanto gastei com a Marília?&quot; ou &quot;quanto gastei por pessoa?&quot;.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginTop: 24 }}>
        {people.map((p) => (
          <div key={p.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <UserRound size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.relation && p.relation.toLowerCase() !== p.name.toLowerCase() ? p.relation : "sem relação"}</div>
              </div>
              <ConfirmButton
                action={deletePerson}
                id={p.id}
                title="Apagar pessoa"
                message={`Apagar "${p.name}"? Os ${p.totalCount} lançamento(s) dessa pessoa continuam, só deixam de ter pessoa.`}
              >
                <Trash2 size={15} />
              </ConfirmButton>
            </div>

            <div style={{ marginTop: 14, fontSize: 20, fontWeight: 700 }}>{formatBRL(p.monthTotal)}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              neste mês · {p.monthCount} lançamento(s) · {p.totalCount} no total
            </div>

            <form action={updatePerson} style={{ display: "flex", gap: 6, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--card-border)" }}>
              <input type="hidden" name="id" value={p.id} />
              <input name="name" defaultValue={p.name} required className="field" style={{ flex: 1, minWidth: 0, fontSize: 13 }} />
              <input name="relation" defaultValue={p.relation ?? ""} placeholder="relação" className="field" style={{ width: 90, fontSize: 13 }} />
              <button type="submit" className="btn btn-ghost" style={{ fontSize: 12, padding: "9px 10px" }}>
                Salvar
              </button>
            </form>
          </div>
        ))}

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Nova pessoa</div>
          <form action={createPerson} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input name="name" placeholder="Nome (ex: Marília)" required className="field" />
            <input name="relation" placeholder="Relação (ex: esposa, filho)" className="field" />
            <button type="submit" className="btn btn-primary" style={{ justifyContent: "center" }}>
              Adicionar pessoa
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
