import { prisma } from "../db/client";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

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

export async function getMonthlyTrend(months: number, referenceDate: Date) {
  const from = startOfMonth(subMonths(referenceDate, months - 1));

  const transactions = await prisma.transaction.findMany({
    where: { status: "CONFIRMED", date: { gte: from }, type: { in: ["INCOME", "EXPENSE"] } },
    select: { date: true, type: true, amount: true },
  });

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i < months; i++) {
    const key = format(startOfMonth(subMonths(referenceDate, months - 1 - i)), "yyyy-MM");
    byMonth.set(key, { income: 0, expense: 0 });
  }

  for (const t of transactions) {
    const key = format(startOfMonth(t.date), "yyyy-MM");
    const bucket = byMonth.get(key);
    if (!bucket) continue;
    if (t.type === "INCOME") bucket.income += Number(t.amount);
    else bucket.expense += Number(t.amount);
  }

  return [...byMonth.entries()].map(([month, v]) => ({ month, ...v, result: v.income - v.expense }));
}
