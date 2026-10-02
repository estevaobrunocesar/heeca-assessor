import { differenceInCalendarDays, format } from "date-fns";
import { interpretBill, interpretBillPayment } from "../ai/engine";
import { resolveCategory } from "../financial/categories";
import { findAccountByMention } from "../financial/accounts";
import { billState, createBill, listPendingBills, parseDay, payBill } from "../financial/bills";
import { todayInBrazil } from "../financial/invoices";
import { QUERY_GATE_RE } from "./query";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const dm = (date: Date) => format(date, "dd/MM");

const PAID_RE = /\b(paguei|pagamos|quitei|pago)\b/i;
const LIST_RE =
  /contas?\s+(a\s+pagar|vencid[ao]s?|atrasad[ao]s?|pendentes?)|o que (vence|tenho (a|pra|para) pagar)|(tenho|tem) (alguma )?conta (vencid|atrasad)|vence.*(semana|hoje|amanh[ãa]|m[eê]s)|\ba pagar\b/i;
const CREATE_GATE_RE =
  /\b(tenho que pagar|tenho de pagar|preciso pagar|vou pagar|devo pagar|lembr\w* (de )?pagar|a pagar|vence|vencimento|boleto)\b/i;

/** "quais contas tenho a pagar?" — a listing request, not a new bill (those carry amounts/dates). */
export function isBillListQuery(text: string): boolean {
  if (!LIST_RE.test(text) || PAID_RE.test(text)) return false;
  return !/\d/.test(text) || QUERY_GATE_RE.test(text);
}

export function mightCreateBill(text: string): boolean {
  return CREATE_GATE_RE.test(text) && !PAID_RE.test(text);
}

export function mightPayBill(text: string): boolean {
  return PAID_RE.test(text);
}

function relative(due: Date, today: Date): string {
  const days = differenceInCalendarDays(due, today);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days > 1) return `em ${days} dias`;
  return days === -1 ? "venceu ontem" : `venceu há ${-days} dias`;
}

export async function answerBillList(user: { workspaceId: string }): Promise<string> {
  const bills = await listPendingBills(user.workspaceId);
  if (bills.length === 0) return "📌 Você não tem nenhuma conta a pagar pendente. 🎉";

  const today = todayInBrazil();
  const overdue = bills.filter((b) => billState(b.dueDate, today) === "VENCIDA");
  const soon = bills.filter((b) => billState(b.dueDate, today) !== "VENCIDA" && differenceInCalendarDays(b.dueDate, today) <= 7);
  const later = bills.filter((b) => differenceInCalendarDays(b.dueDate, today) > 7);

  const line = (b: (typeof bills)[number]) =>
    `• ${b.description} — ${brl(Number(b.amount))} · ${dm(b.dueDate)} (${relative(b.dueDate, today)})`;

  const out: string[] = ["📌 Contas a pagar"];
  let shown = 0;
  const section = (title: string, items: typeof bills) => {
    if (items.length === 0) return;
    const room = Math.max(0, 15 - shown);
    out.push("", title, ...items.slice(0, room).map(line));
    if (items.length > room) out.push(`… e mais ${items.length - room}`);
    shown += Math.min(items.length, room);
  };
  section("🔴 Vencidas", overdue);
  section("🟡 Próximos 7 dias", soon);
  section("⚪ Depois", later);

  const sum = (items: typeof bills) => items.reduce((acc, b) => acc + Number(b.amount), 0);
  out.push("", `Total pendente: ${brl(sum(bills))}`);
  if (overdue.length > 0) out.push(`Vencido: ${brl(sum(overdue))}`);
  return out.join("\n");
}

/** Returns the reply, or null when the message turned out not to be a new bill. */
export async function handleBillCreate(
  text: string,
  user: { id: string; workspaceId: string },
): Promise<string | null> {
  const today = todayInBrazil();
  const b = await interpretBill(text, user.workspaceId, new Date());
  if (!b.eh_conta_a_pagar) return null;

  const due = b.vencimento ? parseDay(b.vencimento) : null;
  if (b.valor === null || !(b.valor > 0) || !due) {
    return `${b.pergunta_esclarecimento ?? "Faltou o valor ou a data de vencimento."}\nManda de novo completo, por exemplo: "aluguel 1500 vence dia 10".`;
  }

  const category = await resolveCategory(b.categoria, b.subcategoria, "EXPENSE", user.workspaceId);
  const account = b.conta ? await findAccountByMention(b.conta, user.workspaceId) : undefined;

  await createBill({
    workspaceId: user.workspaceId,
    userId: user.id,
    description: b.descricao,
    amount: b.valor,
    dueDate: due,
    categoryId: category?.id,
    accountId: account?.id,
    repeatMonthly: b.repete_mensalmente,
    originalMessage: text,
  });

  const lines = [
    "📌 Conta a pagar registrada",
    `${b.descricao} — ${brl(b.valor)}`,
    `Vence ${dm(due)} (${relative(due, today)})`,
  ];
  if (b.categoria) lines.push(`Categoria: ${b.subcategoria ? `${b.categoria} > ${b.subcategoria}` : b.categoria}`);
  if (b.repete_mensalmente) lines.push("🔁 Repete todo mês");
  return lines.join("\n");
}

/** Returns the reply, or null when the message isn't paying one of the pending bills. */
export async function handleBillPayment(
  text: string,
  user: { id: string; workspaceId: string },
): Promise<string | null> {
  const pending = await listPendingBills(user.workspaceId);
  if (pending.length === 0) return null;

  const ai = await interpretBillPayment(
    text,
    pending.map((b) => ({ id: b.id, description: b.description, amount: Number(b.amount), dueDate: dm(b.dueDate) })),
  );
  if (!ai.eh_pagamento_de_conta) return null;

  // Never trust the model's id blindly — it has to be one of the pending bills.
  const bill = pending.find((b) => b.id === ai.conta_id);
  if (!bill) {
    const options = pending.slice(0, 5).map((b) => `• ${b.description} (${dm(b.dueDate)})`).join("\n");
    return `${ai.pergunta_esclarecimento ?? "Qual conta você pagou?"}\n${options}`;
  }

  const result = await payBill({
    billId: bill.id,
    workspaceId: user.workspaceId,
    userId: user.id,
    origin: "WHATSAPP_TEXT",
    amount: ai.valor_pago && ai.valor_pago > 0 ? ai.valor_pago : undefined,
  });
  if (!result) return "Essa conta já estava paga.";

  const lines = [
    "✅ Conta paga",
    `${bill.description} — ${brl(result.amount)} (venc. ${dm(bill.dueDate)})`,
    "Registrei como despesa.",
  ];
  if (result.nextDueDate) lines.push(`🔁 Próxima: ${dm(result.nextDueDate)}`);
  return lines.join("\n");
}
