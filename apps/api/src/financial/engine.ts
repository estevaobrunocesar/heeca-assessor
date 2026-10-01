import { prisma } from "../db/client";
import type { Extraction } from "../ai/schema";
import { resolveDate } from "./resolveDate";
import { resolveCategory } from "./categories";
import { shouldAutoConfirm } from "./confidence";
import type { TransactionOrigin } from "@prisma/client";

const TIPO_MAP = {
  DESPESA: "EXPENSE",
  RECEITA: "INCOME",
  TRANSFERENCIA: "TRANSFER",
} as const;

export type RegisterResult =
  | { kind: "registered"; transactionId: string }
  | { kind: "needs_clarification"; question: string };

export async function registerFromExtraction(params: {
  userId: string;
  extraction: Extraction;
  origin: TransactionOrigin;
  originalMessage: string;
  receivedAt: Date;
}): Promise<RegisterResult> {
  const { userId, extraction, origin, originalMessage, receivedAt } = params;

  if (extraction.tipo === "INDEFINIDO" || !shouldAutoConfirm(extraction)) {
    return {
      kind: "needs_clarification",
      question:
        extraction.pergunta_esclarecimento ??
        "Não consegui entender todos os detalhes desse lançamento. Pode detalhar o valor e a categoria?",
    };
  }

  const type = TIPO_MAP[extraction.tipo as keyof typeof TIPO_MAP];
  const category = await resolveCategory(extraction.categoria, type);
  const date = resolveDate(extraction.data_relativa, receivedAt);

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      type,
      amount: extraction.valor!,
      description: extraction.descricao,
      date,
      categoryId: category?.id,
      isRecurring: extraction.recorrente,
      isInstallment: extraction.parcelado,
      installmentTotal: extraction.numero_parcelas ?? undefined,
      origin,
      originalMessage,
      aiConfidence: extraction.confianca,
    },
  });

  return { kind: "registered", transactionId: transaction.id };
}

export async function getLastTransaction(userId: string) {
  return prisma.transaction.findFirst({
    where: { userId, status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteTransaction(transactionId: string) {
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { status: "DELETED" },
  });
}

export async function updateTransactionAmount(transactionId: string, amount: number) {
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { amount },
  });
}

export async function updateTransactionCategory(transactionId: string, categoryName: string) {
  const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  const category = await resolveCategory(categoryName, tx.type);
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { categoryId: category?.id },
  });
}
