"use client";

import { useState } from "react";
import { BANKS } from "../../lib/banks";

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  DIGITAL: "Conta digital",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimentos",
  COFRINHO: "Cofrinho",
};

export function NewAccountForm({ action }: { action: (formData: FormData) => void }) {
  const [type, setType] = useState("CHECKING");

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input name="name" placeholder="Nome (ex: Conta corrente)" required className="field" />
      <select name="bank" required defaultValue="" className="field">
        <option value="" disabled>
          Selecione o banco
        </option>
        {BANKS.map((b) => (
          <option key={b.name} value={b.name}>
            {b.name}
          </option>
        ))}
      </select>
      <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="field">
        {Object.entries(TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {type === "CREDIT_CARD" && (
        <input
          name="creditLimit"
          type="number"
          step="0.01"
          min="0"
          placeholder="Limite do cartão (R$)"
          className="field"
        />
      )}
      {type === "CREDIT_CARD" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input name="closingDay" type="number" min="1" max="31" placeholder="Fecha dia" className="field" style={{ flex: 1, minWidth: 0 }} />
          <input name="dueDay" type="number" min="1" max="31" placeholder="Vence dia" className="field" style={{ flex: 1, minWidth: 0 }} />
        </div>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
        <input type="checkbox" name="isDefault" /> Definir como padrão
      </label>
      <button type="submit" className="btn btn-primary" style={{ justifyContent: "center", marginTop: 4 }}>
        Adicionar conta
      </button>
    </form>
  );
}
