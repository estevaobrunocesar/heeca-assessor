import { prisma } from "../db/client";
import { addMonths } from "date-fns";
import type { Extraction } from "../ai/schema";
import { resolveDate } from "./resolveDate";
import { resolveCategory, resolveCategoryByName, categoryLabel } from "./categories";
import { matchKeywordRule, saveKeyword } from "./keywords";
import { findPossibleDuplicate, repeatKey } from "./repeats";
import { shouldAutoConfirm } from "./confidence";
import { findAccountByMention, getDefaultAccount } from "./accounts";
import { reopenBillsPaidBy } from "./bills";
import { randomUUID } from "node:crypto";
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
      categoryLabel: string | null;
      amount: number;
      type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
      installments: { total: number; amountEach: number } | null;
      possibleDuplicate: { description: string; createdAt: Date } | null;
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

  // A keyword the user taught (or a well-known merchant) decides the category
  // ahead of the AI's guess, so a correction made once sticks — and it also
  // answers the AI's "which category?" doubt, so no question is needed.
  const type = extraction.tipo === "INDEFINIDO" ? null : TIPO_MAP[extraction.tipo];
  const rule = type && type !== "TRANSFER" ? await matchKeywordRule(originalMessage, workspaceId, type) : null;
  const ruleDecidesCategory = rule !== null && extraction.valor !== null;

  if (type === null || (!ruleDecidesCategory && !shouldAutoConfirm(extraction))) {
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

  const category = rule?.category ?? (await resolveCategory(extraction.categoria, extraction.subcategoria, type, workspaceId));
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

  // Checked before inserting, so the new entry can't match itself. A
  // warning only — it never blocks the registration. For an installment
  // purchase the first installment is what is compared (a double-sent
  // purchase is the costly kind of duplicate: every parcela twice).
  const duplicate =
    storedType === "EXPENSE" || storedType === "INCOME"
      ? await findPossibleDuplicate({
          workspaceId,
          type: storedType,
          amount: baseAmount,
          date,
          key: repeatKey(extraction.estabelecimento, extraction.descricao),
          installmentTotal: installmentCount > 1 ? installmentCount : null,
        })
      : null;

  const installmentGroupId = randomUUID();
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
        merchant: extraction.estabelecimento,
        isRecurring: extraction.recorrente,
        isInstallment: installmentCount > 1,
        installmentNo: installmentCount > 1 ? i + 1 : undefined,
        installmentTotal: installmentCount > 1 ? installmentCount : undefined,
        installmentGroupId: installmentCount > 1 ? installmentGroupId : undefined,
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
    categoryLabel: await categoryLabel(category),
    amount: extraction.valor!,
    type: storedType,
    installments: installmentCount > 1 ? { total: installmentCount, amountEach: baseAmount } : null,
    possibleDuplicate: duplicate
      ? { description: duplicate.description.replace(/\s*\(parcela \d+\/\d+\)$/i, ""), createdAt: duplicate.createdAt }
      : null,
  };
}

export async function getLastTransaction(userId: string, workspaceId: string) {
  return prisma.transaction.findFirst({
    where: { userId, workspaceId, status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * The rows that make up the same purchase as `tx`: itself, or every
 * installment of an installment purchase. New purchases share an
 * installmentGroupId; older rows fall back to matching by original message,
 * which cannot tell apart two purchases typed with the same words.
 */
function purchaseRows(tx: {
  id: string;
  workspaceId: string;
  userId: string;
  isInstallment: boolean;
  installmentTotal: number | null;
  installmentGroupId: string | null;
  originalMessage: string | null;
}) {
  if (tx.installmentGroupId) return { workspaceId: tx.workspaceId, installmentGroupId: tx.installmentGroupId };
  if (tx.isInstallment && tx.originalMessage) {
    return {
      workspaceId: tx.workspaceId,
      userId: tx.userId,
      originalMessage: tx.originalMessage,
      installmentTotal: tx.installmentTotal,
      isInstallment: true,
    };
  }
  return { id: tx.id, workspaceId: tx.workspaceId };
}

export async function deleteTransaction(transactionId: string, workspaceId: string) {
  const target = await prisma.transaction.findFirst({ where: { id: transactionId, workspaceId, status: "CONFIRMED" } });
  if (!target) return { count: 0 };

  // Deleting "the last lançamento" should undo the whole purchase, not just
  // whichever installment happened to be created last.
  if (target.isInstallment) {
    return prisma.transaction.updateMany({ where: purchaseRows(target), data: { status: "DELETED" } });
  }

  const result = await prisma.transaction.updateMany({
    where: { id: transactionId, workspaceId },
    data: { status: "DELETED" },
  });
  // If this expense was what paid a bill, the bill is unpaid again.
  await reopenBillsPaidBy(transactionId, workspaceId);
  return result;
}

export async function updateTransactionAmount(transactionId: string, workspaceId: string, amount: number) {
  return prisma.transaction.updateMany({
    where: { id: transactionId, workspaceId },
    data: { amount },
  });
}

export type SetCategoryResult =
  | { ok: true; label: string | null; learnedKeyword: string | null }
  | { ok: false; reason: "not_found" | "unsupported_type" | "category_not_found" | "type_mismatch" };

/**
 * Moves a transaction to a category. An installment purchase is one purchase
 * split into rows, so all of its rows move together. The change is also a
 * lesson: when the transaction has a known merchant, next time that merchant
 * comes up it lands in the category the user chose, not wherever the AI
 * guesses (see keywords.ts).
 */
export async function setTransactionCategory(
  transactionId: string,
  workspaceId: string,
  categoryId: string,
): Promise<SetCategoryResult> {
  const tx = await prisma.transaction.findFirst({ where: { id: transactionId, workspaceId, status: "CONFIRMED" } });
  if (!tx) return { ok: false, reason: "not_found" };
  if (tx.type !== "INCOME" && tx.type !== "EXPENSE") return { ok: false, reason: "unsupported_type" };

  const category = await prisma.category.findFirst({ where: { id: categoryId, workspaceId }, include: { parent: true } });
  if (!category) return { ok: false, reason: "category_not_found" };
  if (category.type !== tx.type) return { ok: false, reason: "type_mismatch" };

  await prisma.transaction.updateMany({ where: purchaseRows(tx), data: { categoryId: category.id } });

  const learnedKeyword = tx.merchant ? await saveKeyword(workspaceId, tx.merchant, category.id, "LEARNED") : null;
  return { ok: true, label: await categoryLabel(category), learnedKeyword };
}

/** WhatsApp flavour: the user names the category in words ("Delivery", "Alimentação > Mercado"). */
export async function updateTransactionCategory(transactionId: string, workspaceId: string, categoryName: string) {
  const tx = await prisma.transaction.findFirstOrThrow({ where: { id: transactionId, workspaceId } });
  if (tx.type !== "INCOME" && tx.type !== "EXPENSE") return { ok: false, reason: "unsupported_type" } as const;
  const category = await resolveCategoryByName(categoryName, tx.type, workspaceId);
  return setTransactionCategory(transactionId, workspaceId, category.id);
}
