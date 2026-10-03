"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

type Person = { id: string; name: string; relation: string | null };

export type ChangePersonResult = { ok: boolean };

export function PersonCell({
  id,
  personId,
  personName,
  action,
}: {
  id: string;
  personId: string | null;
  personName: string | null;
  action: (id: string, personId: string | null) => Promise<ChangePersonResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(false), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  function open() {
    setEditing(true);
    // People are few and can change from WhatsApp at any time, so load them fresh on every edit.
    fetch("/api/people")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople)
      .catch(() => setPeople([]));
  }

  async function choose(value: string) {
    if (value === (personId ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await action(id, value || null);
      if (!result.ok) setError(true);
    } catch {
      setError(true);
    }
    setSaving(false);
    setEditing(false);
  }

  return (
    <div>
      {editing ? (
        <select
          autoFocus
          disabled={saving || people === null}
          defaultValue={personId ?? ""}
          onChange={(e) => choose(e.target.value)}
          onBlur={() => !saving && setEditing(false)}
          className="field"
          style={{ fontSize: 12, padding: "5px 8px", maxWidth: 150 }}
        >
          <option value="">{people === null ? "Carregando…" : "Ninguém"}</option>
          {(people ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.relation && p.relation.toLowerCase() !== p.name.toLowerCase() ? ` (${p.relation})` : ""}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={open}
          title="Alterar pessoa"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--muted)", font: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {personName ?? "—"}
          <Pencil size={12} />
        </button>
      )}
      {error && <div style={{ fontSize: 11, marginTop: 2, color: "var(--red)" }}>Não foi possível alterar</div>}
    </div>
  );
}
