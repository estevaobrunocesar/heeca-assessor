import { prisma } from "../db/client";
import { startOfMonth, endOfMonth } from "date-fns";

export async function getBudgetStatus(workspaceId: string, referenceDate: Date = new Date()) {
  const from = startOfMonth(referenceDate);
  const to = endOfMonth(referenceDate);

  const budgets = await prisma.budget.findMany({
    where: { workspaceId },
    include: { category: true },
  });

  return Promise.all(
    budgets.map(async (b) => {
      const spent = await prisma.transaction.aggregate({
        where: { workspaceId, categoryId: b.categoryId, type: "EXPENSE", status: "CONFIRMED", date: { gte: from, lte: to } },
        _sum: { amount: true },
      });
      const spentAmount = Number(spent._sum.amount ?? 0);
      const limit = Number(b.monthlyLimit);
      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.category.name,
        limit,
        spent: spentAmount,
        percent: limit > 0 ? spentAmount / limit : 0,
      };
    }),
  );
}

/**
 * Checks whether a just-registered expense pushed its category's budget
 * past a warning threshold, and if so, returns the WhatsApp alert line to
 * append to the confirmation message. Fires once per crossing (80% and
 * 100%) rather than on every message once already over, by checking the
 * spend *before* this transaction was added.
 */
export async function checkBudgetAlert(
  workspaceId: string,
  categoryId: string,
  amountJustSpent: number,
): Promise<string | null> {
  const budget = await prisma.budget.findUnique({
    where: { workspaceId_categoryId: { workspaceId, categoryId } },
    include: { category: true },
  });
  if (!budget) return null;

  const from = startOfMonth(new Date());
  const to = endOfMonth(new Date());
  const spent = await prisma.transaction.aggregate({
    where: { workspaceId, categoryId, type: "EXPENSE", status: "CONFIRMED", date: { gte: from, lte: to } },
    _sum: { amount: true },
  });

  const totalSpent = Number(spent._sum.amount ?? 0);
  const previousSpent = totalSpent - amountJustSpent;
  const limit = Number(budget.monthlyLimit);
  if (limit <= 0) return null;

  const previousPercent = previousSpent / limit;
  const currentPercent = totalSpent / limit;

  if (previousPercent < 1 && currentPercent >= 1) {
    return `\n\n⚠️ Você estourou o orçamento de ${budget.category.name} este mês (R$ ${totalSpent.toFixed(2)} de R$ ${limit.toFixed(2)}).`;
  }
  if (previousPercent < 0.8 && currentPercent >= 0.8) {
    return `\n\n⚠️ Você já usou ${Math.round(currentPercent * 100)}% do orçamento de ${budget.category.name} este mês.`;
  }
  return null;
}
