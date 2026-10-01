import { prisma } from "../db/client";
import { startOfMonth, endOfMonth } from "date-fns";

export async function getMonthSummary(referenceDate: Date, userId?: string) {
  const from = startOfMonth(referenceDate);
  const to = endOfMonth(referenceDate);

  const transactions = await prisma.transaction.findMany({
    where: {
      status: "CONFIRMED",
      date: { gte: from, lte: to },
      ...(userId ? { userId } : {}),
    },
    include: { category: true },
  });

  const income = transactions.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + Number(t.amount), 0);
  const expense = transactions.filter((t) => t.type === "EXPENSE").reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;
    const key = t.category?.name ?? "Sem categoria";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(t.amount));
  }

  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => ({ name, total }));

  return {
    period: { from, to },
    income,
    expense,
    result: income - expense,
    topCategories,
  };
}
