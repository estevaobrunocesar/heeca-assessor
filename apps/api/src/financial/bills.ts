import { addMonths } from "date-fns";
import type { TransactionOrigin } from "@prisma/client";
import { prisma } from "../db/client";
import { getDefaultAccount } from "./accounts";
import { todayInBrazil } from "./invoices";

export type BillState = "VENCIDA" | "HOJE" | "A_VENCER";

/** Parses YYYY-MM-DD into a local-midnight Date, or null if it isn't a real calendar date. */
export function parseDay(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function billState(dueDate: Date, today = todayInBrazil()): BillState {
  if (dueDate < today) return "VENCIDA";
  if (dueDate.getTime() === today.getTime()) return "HOJE";
  return "A_VENCER";
}

export async function createBill(params: {
  workspaceId: string;
  userId: string;
  description: string;
  amount: number;
  dueDate: Date;
  categoryId?: string | null;
  accountId?: string | null;
  repeatMonthly?: boolean;
  originalMessage?: string;
}) {
  return prisma.bill.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      description: params.description,
      amount: params.amount,
      dueDate: params.dueDate,
      categoryId: params.categoryId ?? null,
      accountId: params.accountId ?? null,
      repeatMonthly: params.repeatMonthly ?? false,
      originalMessage: params.originalMessage,
    },
  });
}

export async function listPendingBills(workspaceId: string) {
  return prisma.bill.findMany({
    where: { workspaceId, status: "PENDING" },
    include: { category: true, account: true },
    orderBy: { dueDate: "asc" },
  });
}

/**
 * Marks a pending bill as paid and records the actual expense. The status
 * flip is a conditional update, so two simultaneous requests (a double
 * click, a retried message) can't both pay the same bill — the loser gets
 * null. A monthly bill spawns next month's on payment.
 */
export async function payBill(params: {
  billId: string;
  workspaceId: string;
  userId: string;
  origin: TransactionOrigin;
  amount?: number;
  paidOn?: Date;
}) {
  const { billId, workspaceId, userId, origin } = params;
  const paidOn = params.paidOn ?? todayInBrazil();

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.bill.updateMany({
      where: { id: billId, workspaceId, status: "PENDING" },
      data: { status: "PAID", paidAt: paidOn },
    });
    if (claimed.count === 0) return null;

    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
    const accountId = bill.accountId ?? (await getDefaultAccount(workspaceId))?.id ?? null;
    const amount = params.amount ?? Number(bill.amount);

    const transaction = await tx.transaction.create({
      data: {
        workspaceId,
        userId,
        type: "EXPENSE",
        amount,
        description: bill.description,
        date: paidOn,
        categoryId: bill.categoryId,
        accountId,
        isRecurring: bill.repeatMonthly,
        origin,
        originalMessage: bill.originalMessage,
      },
    });

    await tx.bill.update({ where: { id: billId }, data: { paymentTransactionId: transaction.id } });

    let nextDueDate: Date | null = null;
    if (bill.repeatMonthly) {
      nextDueDate = addMonths(bill.dueDate, 1);
      await tx.bill.create({
        data: {
          workspaceId,
          userId: bill.userId,
          description: bill.description,
          amount: bill.amount,
          dueDate: nextDueDate,
          categoryId: bill.categoryId,
          accountId: bill.accountId,
          repeatMonthly: true,
          sourceBillId: bill.id,
          originalMessage: bill.originalMessage,
        },
      });
    }

    return { bill, transactionId: transaction.id, amount, nextDueDate };
  });
}

export async function cancelBill(billId: string, workspaceId: string) {
  const result = await prisma.bill.updateMany({
    where: { id: billId, workspaceId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
  return result.count > 0;
}

/**
 * When the expense that paid a bill is deleted, the bill was never really
 * paid — put it back as pending, and drop the next month's copy that
 * paying it created (it will be recreated if the bill is paid again).
 */
export async function reopenBillsPaidBy(transactionId: string, workspaceId: string) {
  const bills = await prisma.bill.findMany({ where: { workspaceId, paymentTransactionId: transactionId } });
  for (const bill of bills) {
    await prisma.bill.updateMany({
      where: { workspaceId, sourceBillId: bill.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    await prisma.bill.update({
      where: { id: bill.id },
      data: { status: "PENDING", paidAt: null, paymentTransactionId: null },
    });
  }
  return bills.length;
}
