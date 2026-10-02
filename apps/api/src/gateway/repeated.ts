import { format } from "date-fns";
import { detectRepeatedSpending } from "../financial/repeats";
import { todayInBrazil } from "../financial/invoices";

const REPEATED_RE =
  /(gastos?|despesas?|cobran[cç]as?|assinaturas?|contas?)\s+(que\s+)?(se\s+)?(repetem|repetid[oa]s?|recorrentes?|fixos?|fixas?)|\bminhas?\s+assinaturas\b|\bquais\s+assinaturas\b|\bgastos?\s+repetid/i;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export function isRepeatedQuery(text: string): boolean {
  return REPEATED_RE.test(text);
}

export async function answerRepeated(user: { workspaceId: string }): Promise<string> {
  const today = todayInBrazil();
  const { recurring, frequent } = await detectRepeatedSpending(user.workspaceId, today);

  if (recurring.length === 0 && frequent.length === 0) {
    return "🔁 Ainda não identifiquei gastos que se repetem. Para achar assinaturas e contas fixas preciso de pelo menos 3 meses de histórico com o mesmo estabelecimento.";
  }

  const lines = ["🔁 Gastos que se repetem"];

  if (recurring.length > 0) {
    lines.push("", "Recorrentes (todo mês)");
    for (const r of recurring.slice(0, 10)) {
      const next = r.nextDate >= today ? `próxima ~${format(r.nextDate, "dd/MM")}` : `esperada desde ${format(r.nextDate, "dd/MM")}, ainda não registrada`;
      lines.push(`• ${r.label} — ~${brl(r.typicalAmount)} · ${r.months} meses · ${next}`);
    }
    lines.push(`Total mensal estimado: ${brl(recurring.reduce((sum, r) => sum + r.typicalAmount, 0))}`);
  }

  if (frequent.length > 0) {
    lines.push("", "Frequentes nos últimos 30 dias");
    for (const f of frequent) lines.push(`• ${f.label} — ${f.count}x · ${brl(f.total)}`);
  }

  return lines.join("\n");
}
