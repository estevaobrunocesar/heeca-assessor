import { prisma } from "../db/client";
import { addMonths } from "date-fns";
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
  | {
      kind: "registered";
      transactionId: string;
      accountName: string | null;
      categoryId: string | null;
      amount: number;
      type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
      installments: { total: number; amountEach: number } | null;
    }
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
  const category = await resolveCategory(extraction.categoria, extraction.subcategoria, type, workspaceId);
  const date = resolveDate(extraction.data_relativa, receivedAt);

  // Paying a card's invoice isn't new spending — the purchases were already
  // counted when made. Stored as a positive adjustment (same as the
  // statement importer does) so it gives the limit back, and stays out of
  // both the invoice total and the month's expense figures.
  const isInvoicePayment =
    type === "EXPENSE" &&
    account?.type === "CREDIT_CARD" &&
    !!category &&
    /pagamento (de|da) fatura/.test(category.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  const storedType = isInvoicePayment ? ("ADJUSTMENT" as const) : type;

  const installmentCount = extraction.parcelado && extraction.numero_parcelas && extraction.numero_parcelas > 1
    ? extraction.numero_parcelas
    : 1;

  // Split into one transaction per month so each installment lands in its
  // own month's spend/category totals, matching how a Brazilian credit card
  // statement itemizes "Loja X 2/5" each month. The full amount still counts
  // against the account's balance immediately (see getAccountBalance), since
  // that's how available credit limit actually works — it's consumed in
  // full at purchase time, not released installment by installment.
  const baseAmount = Math.floor((extraction.valor! / installmentCount) * 100) / 100;
  const roundingRemainder = Math.round((extraction.valor! - baseAmount * installmentCount) * 100) / 100;

  let firstTransactionId: string | null = null;
  for (let i = 0; i < installmentCount; i++) {
    const amount = i === installmentCount - 1 ? baseAmount + roundingRemainder : baseAmount;
    const description =
      installmentCount > 1 ? `${extraction.descricao} (parcela ${i + 1}/${installmentCount})` : extraction.descricao;

    const transaction = await prisma.transaction.create({
      data: {
        workspaceId,
        userId,
        type: storedType,
        amount,
        description,
        date: addMonths(date, i),
        categoryId: category?.id,
        accountId: account?.id,
        isRecurring: extraction.recorrente,
        isInstallment: installmentCount > 1,
        installmentNo: installmentCount > 1 ? i + 1 : undefined,
        installmentTotal: installmentCount > 1 ? installmentCount : undefined,
        origin,
        originalMessage,
        aiConfidence: extraction.confianca,
      },
    });

    if (i === 0) firstTransactionId = transaction.id;
  }

  return {
    kind: "registered",
    transactionId: firstTransactionId!,
    accountName: account?.name ?? null,
    categoryId: category?.id ?? null,
    amount: extraction.valor!,
    type: storedType,
    installments: installmentCount > 1 ? { total: installmentCount, amountEach: baseAmount } : null,
  };
}

export async function getLastTransaction(userId: string, workspaceId: string) {
  return prisma.transaction.findFirst({
    where: { userId, workspaceId, status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteTransaction(transactionId: string, workspaceId: string) {
  const target = await prisma.transaction.findFirst({ where: { id: transactionId, workspaceId, status: "CONFIRMED" } });
  if (!target) return { count: 0 };

  // An installment purchase is several rows (one per month) with no shared
  // group id — matched here by the original message, since that's unique
  // enough per purchase in practice. Deleting "the last lançamento" should
  // undo the whole purchase, not just whichever installment happened to be
  // created last.
  if (target.isInstallment && target.originalMessage) {
    return prisma.transaction.updateMany({
      where: {
        workspaceId,
        userId: target.userId,
        originalMessage: target.originalMessage,
        installmentTotal: target.installmentTotal,
        isInstallment: true,
      },
      data: { status: "DELETED" },
    });
  }

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
  const category = await resolveCategory(categoryName, null, tx.type, workspaceId);
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { categoryId: category?.id },
  });
}
