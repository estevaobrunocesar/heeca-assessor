import { format } from "date-fns";
import { prisma } from "../db/client";
import { getCardInvoices, todayInBrazil } from "../financial/invoices";
import { QUERY_GATE_RE } from "./query";

const PAYMENT_RE = /\b(paguei|pagar|pago|pagamento|quitei|quitar)\b/i;
const INVOICE_WORD_RE = /fatura/i;
const INVOICE_HINT_RE = /\b(vence|vencimento|fecha|fechamento|atual|pr[óo]xima)\b/i;

function normalize(text: string) {
  return text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const dm = (date: Date) => format(date, "dd/MM");

/** True for questions about the card invoice, never for paying it ("paguei a fatura"). */
export function isInvoiceQuery(text: string): boolean {
  if (!INVOICE_WORD_RE.test(text) || PAYMENT_RE.test(text)) return false;
  return QUERY_GATE_RE.test(text) || INVOICE_HINT_RE.test(text) || /^\s*(minha |a |o )?fatura/i.test(text);
}

export async function answerInvoiceQuery(text: string, user: { workspaceId: string }): Promise<string> {
  const cards = await prisma.account.findMany({
    where: { workspaceId: user.workspaceId, type: "CREDIT_CARD" },
    orderBy: { createdAt: "asc" },
  });
  if (cards.length === 0) return "Você ainda não tem nenhum cartão de crédito cadastrado.";

  // A named card ("fatura do nubank") narrows the answer; otherwise answer
  // for every card rather than guessing.
  const needle = normalize(text);
  const named = cards.filter((c) => {
    const bank = c.bank ? normalize(c.bank) : null;
    return needle.includes(normalize(c.name)) || (bank !== null && needle.includes(bank));
  });
  const targets = named.length > 0 ? named : cards;

  const today = todayInBrazil();
  const blocks: string[] = [];

  for (const card of targets) {
    const label = card.bank ?? card.name;
    if (card.closingDay === null || card.dueDay === null) {
      blocks.push(
        `💳 ${label}\nAinda não sei o dia de fechamento e de vencimento desse cartão. Cadastre em Contas bancárias no painel que eu calculo a fatura.`,
      );
      continue;
    }

    const invoices = await getCardInvoices({ id: card.id, closingDay: card.closingDay, dueDay: card.dueDay }, user.workspaceId, today);
    const previous = invoices.filter((i) => i.status === "FECHADA").at(-1);
    const current = invoices.find((i) => i.status === "ABERTA");
    const next = invoices.find((i) => i.status === "FUTURA");

    const lines = [`💳 ${label}`];
    if (current) lines.push(`Fatura atual (aberta): ${brl(current.total)}\nFecha ${dm(current.closingDate)} · vence ${dm(current.dueDate)}`);
    if (previous) lines.push(`Última fechada: ${brl(previous.total)}\nVencimento ${dm(previous.dueDate)}`);
    if (next) lines.push(`Próxima: ${brl(next.total)}\nFecha ${dm(next.closingDate)} · vence ${dm(next.dueDate)}`);
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}
