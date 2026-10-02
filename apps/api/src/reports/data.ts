import { endOfDay, format, startOfMonth, endOfMonth, subMonths, subDays, startOfYear } from "date-fns";
import { prisma } from "../db/client";
import { parseDay } from "../financial/bills";
import { todayInBrazil } from "../financial/invoices";

export type ReportData = {
  from: Date;
  to: Date;
  label: string;
  income: number;
  expense: number;
  result: number;
  expenseByCategory: { name: string; total: number; percent: number; subs: { name: string; total: number }[] }[];
  incomeByCategory: { name: string; total: number }[];
  transactions: {
    date: Date;
    description: string;
    category: string | null;
    subcategory: string | null;
    account: string | null;
    type: "INCOME" | "EXPENSE";
    amount: number;
  }[];
};

export function periodLabel(from: Date, to: Date): string {
  return `${format(from, "dd/MM/yyyy")} a ${format(to, "dd/MM/yyyy")}`;
}

/** Period from explicit YYYY-MM-DD dates, or one of the named presets; defaults to the current month. */
export function resolvePeriod(query: { from?: string; to?: string; preset?: string }, today = todayInBrazil()) {
  const from = query.from ? parseDay(query.from) : null;
  const to = query.to ? parseDay(query.to) : null;
  if (from && to) return from <= to ? { from, to } : { from: to, to: from };

  switch (query.preset) {
    case "mes-passado": {
      const ref = subMonths(today, 1);
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    }
    case "30d":
      return { from: subDays(today, 29), to: today };
    case "ano":
      return { from: startOfYear(today), to: today };
    default:
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

export async function getReportData(workspaceId: string, from: Date, to: Date, label?: string): Promise<ReportData> {
  const rows = await prisma.transaction.findMany({
    where: {
      workspaceId,
      status: "CONFIRMED",
      type: { in: ["INCOME", "EXPENSE"] },
      date: { gte: from, lte: endOfDay(to) },
    },
    include: { category: { include: { parent: true } }, account: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const transactions = rows.map((t) => ({
    date: t.date,
    description: t.description,
    category: t.category?.parent?.name ?? t.category?.name ?? null,
    subcategory: t.category?.parent ? t.category.name : null,
    account: t.account ? (t.account.bank ?? t.account.name) : null,
    type: t.type as "INCOME" | "EXPENSE",
    amount: Number(t.amount),
  }));

  const sum = (type: "INCOME" | "EXPENSE") => transactions.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount, 0);
  const income = sum("INCOME");
  const expense = sum("EXPENSE");

  const group = (type: "INCOME" | "EXPENSE") => {
    const byCategory = new Map<string, { total: number; subs: Map<string, number> }>();
    for (const t of transactions) {
      if (t.type !== type) continue;
      const name = t.category ?? "Sem categoria";
      const entry = byCategory.get(name) ?? { total: 0, subs: new Map<string, number>() };
      entry.total += t.amount;
      if (t.subcategory) entry.subs.set(t.subcategory, (entry.subs.get(t.subcategory) ?? 0) + t.amount);
      byCategory.set(name, entry);
    }
    return [...byCategory.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, e]) => ({
        name,
        total: e.total,
        subs: [...e.subs.entries()].sort((a, b) => b[1] - a[1]).map(([subName, total]) => ({ name: subName, total })),
      }));
  };

  return {
    from,
    to,
    label: label ?? periodLabel(from, to),
    income,
    expense,
    result: income - expense,
    expenseByCategory: group("EXPENSE").map((c) => ({ ...c, percent: expense > 0 ? (c.total / expense) * 100 : 0 })),
    incomeByCategory: group("INCOME").map(({ name, total }) => ({ name, total })),
    transactions,
  };
}

export function reportFilename(data: Pick<ReportData, "from" | "to">, ext: "pdf" | "xlsx"): string {
  return `relatorio-${format(data.from, "yyyy-MM-dd")}_${format(data.to, "yyyy-MM-dd")}.${ext}`;
}
