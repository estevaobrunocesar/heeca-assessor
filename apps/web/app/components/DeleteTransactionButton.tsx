"use client";

import { Trash2 } from "lucide-react";

export function DeleteTransactionButton({
  action,
  id,
  installmentTotal,
}: {
  action: (formData: FormData) => void;
  id: string;
  installmentTotal: number | null;
}) {
  const message = installmentTotal
    ? `Apagar este lançamento? Ele faz parte de uma compra parcelada em ${installmentTotal}x — todas as parcelas serão apagadas.`
    : "Apagar este lançamento?";

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="icon-btn" aria-label="Apagar lançamento" title="Apagar" style={{ color: "var(--muted)" }}>
        <Trash2 size={15} />
      </button>
    </form>
  );
}
