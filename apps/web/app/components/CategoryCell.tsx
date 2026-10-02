"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

type Category = { id: string; name: string; type: string; parentId: string | null; children: { id: string; name: string }[] };

export type ChangeCategoryResult = { ok: boolean; learnedKeyword?: string | null };

// The taxonomy has ~460 categories; rendering it inside every table row would
// bloat the page, so it is fetched once, on first edit, and shared by all rows.
let categoriesRequest: Promise<Category[]> | null = null;
function loadCategories(): Promise<Category[]> {
  categoriesRequest ??= fetch("/api/categories")
    .then((r) => (r.ok ? (r.json() as Promise<Category[]>) : []))
    .catch(() => []);
  return categoriesRequest.then((list) => {
    if (list.length === 0) categoriesRequest = null; // let a failed load be retried
    return list;
  });
}

export function CategoryCell({
  id,
  type,
  categoryId,
  categoryName,
  action,
}: {
  id: string;
  type: "INCOME" | "EXPENSE";
  categoryId: string | null;
  categoryName: string | null;
  action: (id: string, categoryId: string) => Promise<ChangeCategoryResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tree, setTree] = useState<Category[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [status]);

  function open() {
    setEditing(true);
    loadCategories().then(setTree);
  }

  async function choose(newId: string) {
    if (!newId || newId === categoryId) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await action(id, newId);
      setStatus(
        result.ok
          ? { ok: true, text: result.learnedKeyword ? `Lembrarei: "${result.learnedKeyword}"` : "Categoria atualizada" }
          : { ok: false, text: "Não foi possível alterar" },
      );
    } catch {
      setStatus({ ok: false, text: "Não foi possível alterar" });
    }
    setSaving(false);
    setEditing(false);
  }

  const groups = tree.filter((c) => !c.parentId && c.type === type);

  return (
    <div>
      {editing ? (
        <select
          autoFocus
          disabled={saving}
          defaultValue={categoryId ?? ""}
          onChange={(e) => choose(e.target.value)}
          onBlur={() => !saving && setEditing(false)}
          className="field"
          style={{ fontSize: 12, padding: "5px 8px", maxWidth: 190 }}
        >
          <option value="" disabled>
            {tree.length === 0 ? "Carregando…" : "Escolha a categoria"}
          </option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              <option value={g.id}>{g.name} (geral)</option>
              {g.children.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={open}
          title="Alterar categoria"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--muted)", font: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {categoryName ?? "Sem categoria"}
          <Pencil size={12} />
        </button>
      )}
      {status && <div style={{ fontSize: 11, marginTop: 2, color: status.ok ? "var(--green)" : "var(--red)" }}>{status.text}</div>}
    </div>
  );
}
