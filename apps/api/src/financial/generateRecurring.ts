import { prisma } from "../db/client";
import { format } from "date-fns";

/**
 * Generates today's due recurring transactions (rent, subscriptions, salary...).
 * Idempotent per rule per month via lastGeneratedMonth, so it's safe to call
 * more than once on the same day (e.g. after a server restart).
 */
export async function generateDueRecurringTransactions(today: Date = new Date()) {
  const currentMonth = format(today, "yyyy-MM");
  const dayOfMonth = today.getDate();

  const dueRules = await prisma.recurringRule.findMany({
    where: {
      active: true,
      dayOfMonth,
      OR: [{ lastGeneratedMonth: null }, { lastGeneratedMonth: { not: currentMonth } }],
    },
  });

  for (const rule of dueRules) {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          workspaceId: rule.workspaceId,
          userId: rule.userId,
          type: rule.type,
          amount: rule.amount,
          description: rule.description,
          date: today,
          categoryId: rule.categoryId ?? undefined,
          accountId: rule.accountId ?? undefined,
          isRecurring: true,
          origin: "DASHBOARD",
        },
      }),
      prisma.recurringRule.update({
        where: { id: rule.id },
        data: { lastGeneratedMonth: currentMonth },
      }),
    ]);
  }

  return dueRules.length;
}
