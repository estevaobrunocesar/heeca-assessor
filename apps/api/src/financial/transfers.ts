import type { TransactionOrigin } from "@prisma/client";
import { prisma } from "../db/client";
import type { Extraction } from "../ai/schema";
import type { RegisterResult } from "./engine";
import { findAccountsTiedAtTop, getDefaultAccount } from "./accounts";
import { resolveDate } from "./resolveDate";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const ask = (question: string): RegisterResult => ({ kind: "needs_clarification", question });

const whichOne = (names: string[], where: string, amount: number) =>
  `Encontrei mais de uma conta que combina com isso (${names.join(", ")}). Para qual delas ${where} na transferência de ${brl(amount)}? Mande a transferência de novo com o nome completo da conta, por exemplo: "passei ${Math.round(amount)} da corrente para ${names[0]}".`;

/**
 * Money moving between two of the person's own accounts. One TRANSFER entry carries both ends
 * (it leaves `accountId`, arrives at `toAccountId`): account balances move, but it is neither
 * income nor spending, so reports and the month's figures stay untouched. When either account
 * cannot be identified it asks instead of guessing.
 */
export async function registerTransfer(params: {
  userId: string;
  workspaceId: string;
  extraction: Extraction;
  origin: TransactionOrigin;
  originalMessage: string;
  receivedAt: Date;
}): Promise<RegisterResult> {
  const { userId, workspaceId, extraction, origin, originalMessage, receivedAt } = params;
  const amount = extraction.valor!;

  const accounts = await prisma.account.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  if (accounts.length < 2) {
    return ask("Para registrar uma transferência entre contas você precisa ter pelo menos duas contas cadastradas. Cadastre em Contas bancárias.");
  }
  const names = accounts.map((a) => a.name).join(", ");

  const fromMatches = extraction.conta ? await findAccountsTiedAtTop(extraction.conta, workspaceId) : [];
  if (fromMatches.length > 1) return ask(whichOne(fromMatches.map((a) => a.name), "saiu o dinheiro", amount));
  const from = extraction.conta ? fromMatches[0] : await getDefaultAccount(workspaceId);
  if (!from) {
    return ask(`De qual conta saiu o dinheiro? Suas contas: ${names}. Diga, por exemplo, "passei ${Math.round(amount)} da corrente para a poupança".`);
  }

  const toMatches = extraction.conta_destino ? await findAccountsTiedAtTop(extraction.conta_destino, workspaceId) : [];
  if (toMatches.length > 1) return ask(whichOne(toMatches.map((a) => a.name), "foi o dinheiro", amount));
  const to = toMatches[0] ?? null;
  if (!to) {
    return ask(`Para qual conta foi a transferência de ${brl(amount)}? Suas contas: ${names}. Diga, por exemplo, "passei ${Math.round(amount)} da corrente para a poupança".`);
  }
  if (to.id === from.id) {
    return ask(`A origem e o destino são a mesma conta (${from.name}). De qual conta para qual foi a transferência de ${brl(amount)}?`);
  }

  const transaction = await prisma.transaction.create({
    data: {
      workspaceId,
      userId,
      type: "TRANSFER",
      amount,
      description: extraction.descricao?.trim() || `Transferência ${from.name} → ${to.name}`,
      date: resolveDate(extraction.data_relativa, receivedAt),
      accountId: from.id,
      toAccountId: to.id,
      origin,
      originalMessage,
      aiConfidence: extraction.confianca,
    },
  });

  return {
    kind: "registered",
    transactionId: transaction.id,
    accountName: from.name,
    toAccountName: to.name,
    categoryId: null,
    categoryLabel: null,
    amount,
    type: "TRANSFER",
    installments: null,
    possibleDuplicate: null,
    person: null,
  };
}
