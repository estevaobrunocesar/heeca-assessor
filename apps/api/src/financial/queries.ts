import { prisma } from "../db/client";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export async function getMonthSummary(referenceDate: Date, workspaceId: string, userId?: string) {
  const from = startOfMonth(referenceDate);
  const to = endOfMonth(referenceDate);

  const transactions = await prisma.transaction.findMany({
    where: {
      workspaceId,
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

export async function getMonthlyTrend(months: number, referenceDate: Date, workspaceId: string) {
  const from = startOfMonth(subMonths(referenceDate, months - 1));

  const transactions = await prisma.transaction.findMany({
    where: { workspaceId, status: "CONFIRMED", date: { gte: from }, type: { in: ["INCOME", "EXPENSE"] } },
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

export type PeriodReportParams = {
  workspaceId: string;
  userId: string;
  from: Date;
  to: Date;
  type: "DESPESA" | "RECEITA" | "AMBOS";
  categoryIds?: string[];
  breakdownBySubcategory?: boolean;
  accountId?: string;
};

export async function getPeriodReport(params: PeriodReportParams) {
  const { workspaceId, userId, from, to, type, categoryIds, breakdownBySubcategory, accountId } = params;

  const transactions = await prisma.transaction.findMany({
    where: {
      workspaceId,
      userId,
      status: "CONFIRMED",
      date: { gte: from, lte: to },
      type: type === "DESPESA" ? "EXPENSE" : type === "RECEITA" ? "INCOME" : { in: ["INCOME", "EXPENSE"] },
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(accountId ? { accountId } : {}),
    },
    include: { category: { include: { parent: true } } },
    orderBy: { date: "desc" },
  });

  const sum = (t: "INCOME" | "EXPENSE") =>
    transactions.filter((x) => x.type === t).reduce((acc, x) => acc + Number(x.amount), 0);
  const expense = sum("EXPENSE");
  const income = sum("INCOME");

  const groups = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;
    const name = breakdownBySubcategory
      ? (t.category?.name ?? "Sem categoria")
      : (t.category?.parent?.name ?? t.category?.name ?? "Sem categoria");
    groups.set(name, (groups.get(name) ?? 0) + Number(t.amount));
  }
  const breakdown = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total }));

  return {
    income,
    expense,
    count: transactions.length,
    breakdown,
    recent: transactions.slice(0, 3).map((t) => ({
      date: t.date,
      description: t.description,
      amount: Number(t.amount),
      type: t.type,
    })),
  };
}
