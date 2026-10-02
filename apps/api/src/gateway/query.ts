import { startOfDay, endOfDay, format } from "date-fns";
import { interpretQuery } from "../ai/engine";
import { findCategoryScope } from "../financial/categories";
import { findAccountByMention } from "../financial/accounts";
import { getPeriodReport } from "../financial/queries";

// Cheap pre-filter so ordinary expense messages ("gastei 50 no posto") never
// pay for an extra AI call: only things that read like a question go through
// the query interpreter, which then makes the real call on whether it is one.
export const QUERY_GATE_RE =
  /\?\s*$|^\s*(qual|quais|quanto|quantos|quantas|mostra|mostre|me (mostra|diz|fala|passa|d[aá])|liste|lista|resumo|extrato)\b|como est[aá]|sobrou|maior (categoria|gasto)|quanto (gastei|recebi)/i;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** Returns the reply text, or null when the message turned out not to be a query. */
export async function answerFinanceQuery(
  text: string,
  user: { id: string; workspaceId: string },
): Promise<string | null> {
  const q = await interpretQuery(text, user.workspaceId, new Date());
  if (!q.eh_consulta) return null;

  let from = startOfDay(new Date(q.data_inicio));
  let to = endOfDay(new Date(q.data_fim));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "Não consegui entender o período dessa consulta. Pode dizer de novo, por exemplo \"quanto gastei em setembro?\"";
  }
  if (from > to) [from, to] = [to, from];

  let scope: Awaited<ReturnType<typeof findCategoryScope>> = null;
  if (q.categoria || q.subcategoria) {
    scope = await findCategoryScope(q.categoria, q.subcategoria, user.workspaceId);
    if (!scope) return `Não encontrei a categoria "${q.subcategoria ?? q.categoria}" entre as suas categorias.`;
  }

  let account: Awaited<ReturnType<typeof findAccountByMention>> = undefined;
  if (q.conta) {
    account = await findAccountByMention(q.conta, user.workspaceId);
    if (!account) return `Não encontrei a conta "${q.conta}" entre as suas contas.`;
  }

  const report = await getPeriodReport({
    workspaceId: user.workspaceId,
    userId: user.id,
    from,
    to,
    type: q.tipo,
    categoryIds: scope?.ids,
    breakdownBySubcategory: scope?.isParent,
    accountId: account?.id,
  });

  const subject = [scope?.label, account ? (account.bank ?? account.name) : null].filter(Boolean).join(" · ") || "Resumo";
  const header = `📊 ${subject} — ${q.descricao_periodo}`;

  if (report.count === 0) return `${header}\nNenhum lançamento encontrado.`;

  const lines = [header];
  const plural = report.count === 1 ? "lançamento" : "lançamentos";
  if (q.tipo === "DESPESA") lines.push(`Despesas: ${brl(report.expense)} (${report.count} ${plural})`);
  else if (q.tipo === "RECEITA") lines.push(`Receitas: ${brl(report.income)} (${report.count} ${plural})`);
  else {
    lines.push(`Receitas: ${brl(report.income)}`, `Despesas: ${brl(report.expense)}`, `Resultado: ${brl(report.income - report.expense)}`);
  }

  if (q.tipo !== "RECEITA" && report.breakdown.length > 1) {
    lines.push("", scope?.isParent ? "Por subcategoria:" : "Maiores gastos:");
    for (const g of report.breakdown.slice(0, 5)) lines.push(`• ${g.name} — ${brl(g.total)}`);
  }

  if (scope || account) {
    lines.push("", "Últimos:");
    for (const t of report.recent) lines.push(`• ${format(t.date, "dd/MM")} ${t.description} — ${brl(t.amount)}`);
  }

  return lines.join("\n");
}
