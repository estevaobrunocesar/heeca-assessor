import { endOfDay, endOfMonth, format, startOfMonth, startOfYear, subMonths, subYears } from "date-fns";
import { prisma } from "../db/client";
import { todayInBrazil } from "./invoices";

export type MonthPoint = { month: string; income: number; expense: number; result: number };
export type NetWorthPoint = { month: string; balance: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The last `count` months (oldest first) up to the month of `today`, each with income, expense and result. */
export function buildMonthSeries(
  entries: { date: Date; type: "INCOME" | "EXPENSE"; amount: number }[],
  today: Date,
  count: number,
): MonthPoint[] {
  const points = new Map<string, MonthPoint>();
  for (let i = count - 1; i >= 0; i--) {
    const key = format(startOfMonth(subMonths(today, i)), "yyyy-MM");
    points.set(key, { month: key, income: 0, expense: 0, result: 0 });
  }
  for (const e of entries) {
    const point = points.get(format(e.date, "yyyy-MM"));
    if (!point) continue;
    if (e.type === "INCOME") point.income += e.amount;
    else point.expense += e.amount;
  }
  return [...points.values()].map((p) => ({ ...p, income: round2(p.income), expense: round2(p.expense), result: round2(p.income - p.expense) }));
}

export type LedgerEntry = {
  date: Date;
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
  amount: number;
  /** Type of the account the entry belongs to (null when it has none). */
  accountType: string | null;
  /** Type of the destination account, for transfers. */
  toAccountType: string | null;
};

/** What an entry does to the combined balance of the cash accounts (everything except credit cards). */
function cashEffect(e: LedgerEntry): number {
  const cash = (type: string | null) => type !== null && type !== "CREDIT_CARD";
  switch (e.type) {
    case "INCOME":
      return cash(e.accountType) ? e.amount : 0;
    case "EXPENSE":
      return cash(e.accountType) ? -e.amount : 0;
    case "ADJUSTMENT":
      return cash(e.accountType) ? e.amount : 0;
    case "TRANSFER":
      // Between two cash accounts the effects cancel; to or from a card, money really leaves or enters.
      return (cash(e.toAccountType) ? e.amount : 0) - (cash(e.accountType) ? e.amount : 0);
  }
}

/**
 * The combined balance of the cash accounts at the end of each of the last `count` months (the
 * current month ends today). Same figure as "Saldo total em contas", seen over time.
 */
export function buildNetWorthSeries(entries: LedgerEntry[], today: Date, count: number): NetWorthPoint[] {
  const ends: { key: string; end: Date }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = startOfMonth(subMonths(today, i));
    ends.push({ key: format(start, "yyyy-MM"), end: i === 0 ? endOfDay(today) : endOfDay(endOfMonth(start)) });
  }
  return ends.map(({ key, end }) => ({
    month: key,
    balance: round2(entries.filter((e) => e.date <= end).reduce((sum, e) => sum + cashEffect(e), 0)),
  }));
}

export type ExpenseRow = { description: string; date: Date; amount: number; isRecurring: boolean; isInstallment: boolean };

const MIN_EXTRAORDINARY = 300;
const EXTRAORDINARY_FACTOR = 3;

export type ExpenseSplit = {
  recurring: number;
  variable: number;
  extraordinary: number;
  threshold: number;
  items: { description: string; date: Date; amount: number }[];
};

/**
 * Splits spending into recurring (marked as such), extraordinary (one-off and at least 3x the typical
 * expense, never below R$ 300; installments are planned, so they never count) and everything else.
 */
export function splitExpenses(rows: ExpenseRow[]): ExpenseSplit {
  const sorted = rows.map((r) => r.amount).sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const threshold = Math.max(MIN_EXTRAORDINARY, median * EXTRAORDINARY_FACTOR);

  let recurring = 0;
  let variable = 0;
  let extraordinary = 0;
  const items: ExpenseSplit["items"] = [];
  for (const r of rows) {
    if (r.isRecurring) recurring += r.amount;
    else if (!r.isInstallment && r.amount >= threshold) {
      extraordinary += r.amount;
      items.push({ description: r.description, date: r.date, amount: r.amount });
    } else variable += r.amount;
  }
  items.sort((a, b) => b.amount - a.amount);
  return { recurring: round2(recurring), variable: round2(variable), extraordinary: round2(extraordinary), threshold: round2(threshold), items: items.slice(0, 5) };
}

export type CommittedIncome = {
  monthlyTotal: number;
  incomeReference: number;
  percent: number | null;
  items: { description: string; amount: number }[];
};

/** Recurring monthly commitments against the average income of the last three closed months. */
export function committedIncome(
  recurring: { description: string; amount: number }[],
  closedMonths: MonthPoint[],
  currentIncome: number,
): CommittedIncome {
  const monthlyTotal = round2(recurring.reduce((s, r) => s + r.amount, 0));
  const withIncome = closedMonths.filter((m) => m.income > 0);
  const incomeReference = withIncome.length > 0 ? withIncome.reduce((s, m) => s + m.income, 0) / withIncome.length : currentIncome;
  return {
    monthlyTotal,
    incomeReference: round2(incomeReference),
    percent: incomeReference > 0 && monthlyTotal > 0 ? (monthlyTotal / incomeReference) * 100 : null,
    items: [...recurring].sort((a, b) => b.amount - a.amount).slice(0, 8),
  };
}

export async function getBi(workspaceId: string, period: { from: Date; to: Date }, today = todayInBrazil()) {
  const windowStart = startOfMonth(subMonths(today, 11));
  const yearStart = startOfYear(subYears(today, 1));

  const [monthRows, ledgerRows, periodRows, rules, repeatingBills] = await Promise.all([
    prisma.transaction.findMany({
      where: { workspaceId, status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: windowStart < yearStart ? windowStart : yearStart, lte: endOfDay(today) } },
      select: { date: true, type: true, amount: true },
    }),
    prisma.transaction.findMany({
      where: { workspaceId, status: "CONFIRMED", date: { lte: endOfDay(today) } },
      select: { date: true, type: true, amount: true, account: { select: { type: true } }, toAccount: { select: { type: true } } },
    }),
    prisma.transaction.findMany({
      where: { workspaceId, status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: period.from, lte: endOfDay(period.to) } },
      include: { category: { include: { parent: true } }, user: { select: { name: true } } },
    }),
    prisma.recurringRule.findMany({ where: { workspaceId, active: true, type: "EXPENSE" }, select: { description: true, amount: true } }),
    prisma.bill.findMany({ where: { workspaceId, status: "PENDING", repeatMonthly: true }, select: { description: true, amount: true } }),
  ]);

  const entries = monthRows.map((r) => ({ date: r.date, type: r.type as "INCOME" | "EXPENSE", amount: Number(r.amount) }));
  const months = buildMonthSeries(entries.filter((e) => e.date >= windowStart), today, 12);

  const sumYear = (year: number, type: "INCOME" | "EXPENSE") =>
    round2(entries.filter((e) => e.date.getFullYear() === year && e.type === type).reduce((s, e) => s + e.amount, 0));
  const thisYear = today.getFullYear();
  const years = {
    current: { year: thisYear, income: sumYear(thisYear, "INCOME"), expense: sumYear(thisYear, "EXPENSE") },
    previous: { year: thisYear - 1, income: sumYear(thisYear - 1, "INCOME"), expense: sumYear(thisYear - 1, "EXPENSE") },
  };

  const ledger: LedgerEntry[] = ledgerRows.map((r) => ({
    date: r.date,
    type: r.type,
    amount: Number(r.amount),
    accountType: r.account?.type ?? null,
    toAccountType: r.toAccount?.type ?? null,
  }));

  const categoryTotals = (type: "INCOME" | "EXPENSE") => {
    const totals = new Map<string, number>();
    for (const r of periodRows) {
      if (r.type !== type) continue;
      const name = r.category?.parent?.name ?? r.category?.name ?? "Sem categoria";
      totals.set(name, (totals.get(name) ?? 0) + Number(r.amount));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total: round2(total) }));
  };

  const byUser = new Map<string, number>();
  for (const r of periodRows) {
    if (r.type === "EXPENSE") byUser.set(r.user.name, (byUser.get(r.user.name) ?? 0) + Number(r.amount));
  }

  const expenseRows: ExpenseRow[] = periodRows
    .filter((r) => r.type === "EXPENSE")
    .map((r) => ({ description: r.description, date: r.date, amount: Number(r.amount), isRecurring: r.isRecurring, isInstallment: r.isInstallment }));

  const closedMonths = months.slice(-4, -1); // the three full months before the current one
  const currentIncome = months[months.length - 1].income;
  const recurring = [...rules, ...repeatingBills].map((r) => ({ description: r.description, amount: Number(r.amount) }));

  return {
    period: { from: period.from, to: period.to },
    months,
    netWorth: buildNetWorthSeries(ledger, today, 12),
    years,
    monthOverMonth: months.slice(-6).map((m, i, all) => ({
      ...m,
      resultChange: i === 0 ? null : all[i - 1].result !== 0 ? round2(((m.result - all[i - 1].result) / Math.abs(all[i - 1].result)) * 100) : null,
      expenseChange: i === 0 ? null : all[i - 1].expense > 0 ? round2(((m.expense - all[i - 1].expense) / all[i - 1].expense) * 100) : null,
    })),
    expenseByCategory: categoryTotals("EXPENSE"),
    incomeByCategory: categoryTotals("INCOME"),
    expenseByUser: [...byUser.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total: round2(total) })),
    committed: committedIncome(recurring, closedMonths, currentIncome),
    split: splitExpenses(expenseRows),
  };
}

