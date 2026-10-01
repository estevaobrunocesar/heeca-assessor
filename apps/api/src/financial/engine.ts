import { prisma } from "../db/client";
import type { Extraction } from "../ai/schema";
import { resolveDate } from "./resolveDate";
import { resolveCategory } from "./categories";
import { shouldAutoConfirm } from "./confidence";
import { findAccountByMention, getDefaultAccount } from "./accounts";
import type { TransactionOrigin } from "@prisma/client";

const TIPO_MAP = {
  DESPESA: "EXPENSE",
  RECEITA: "INCOME",
  TRANSFERENCIA: "TRANSFER",
} as const;

export type RegisterResult =
  | { kind: "registered"; transactionId: string; accountName: string | null }
  | { kind: "needs_clarification"; question: string };

export async function registerFromExtraction(params: {
  userId: string;
  workspaceId: string;
  extraction: Extraction;
  origin: TransactionOrigin;
  originalMessage: string;
  receivedAt: Date;
}): Promise<RegisterResult> {
  const { userId, workspaceId, extraction, origin, originalMessage, receivedAt } = params;

  if (extraction.tipo === "INDEFINIDO" || !shouldAutoConfirm(extraction)) {
    return {
      kind: "needs_clarification",
      question:
        extraction.pergunta_esclarecimento ??
        "Não consegui entender todos os detalhes desse lançamento. Pode detalhar o valor e a categoria?",
    };
  }

  let account = extraction.conta
    ? await findAccountByMention(extraction.conta, workspaceId)
    : await getDefaultAccount(workspaceId);
  if (extraction.conta && !account) {
    return {
      kind: "needs_clarification",
      question: `Não encontrei nenhuma conta cadastrada parecida com "${extraction.conta}". Quer que eu use a conta padrão, ou cadastra essa conta primeiro?`,
    };
  }

  const type = TIPO_MAP[extraction.tipo as keyof typeof TIPO_MAP];
  const category = await resolveCategory(extraction.categoria, type, workspaceId);
  const date = resolveDate(extraction.data_relativa, receivedAt);

  const transaction = await prisma.transaction.create({
    data: {
      workspaceId,
      userId,
      type,
      amount: extraction.valor!,
      description: extraction.descricao,
      date,
      categoryId: category?.id,
      accountId: account?.id,
      isRecurring: extraction.recorrente,
      isInstallment: extraction.parcelado,
      installmentTotal: extraction.numero_parcelas ?? undefined,
      origin,
      originalMessage,
      aiConfidence: extraction.confianca,
    },
  });

  return { kind: "registered", transactionId: transaction.id, accountName: account?.name ?? null };
}

export async function getLastTransaction(userId: string, workspaceId: string) {
  return prisma.transaction.findFirst({
    where: { userId, workspaceId, status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteTransaction(transactionId: string, workspaceId: string) {
  return prisma.transaction.updateMany({
    where: { id: transactionId, workspaceId },
    data: { status: "DELETED" },
  });
}

export async function updateTransactionAmount(transactionId: string, workspaceId: string, amount: number) {
  return prisma.transaction.updateMany({
    where: { id: transactionId, workspaceId },
    data: { amount },
  });
}

export async function updateTransactionCategory(transactionId: string, workspaceId: string, categoryName: string) {
  const tx = await prisma.transaction.findFirstOrThrow({ where: { id: transactionId, workspaceId } });
  const category = await resolveCategory(categoryName, tx.type, workspaceId);
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { categoryId: category?.id },
  });
}
