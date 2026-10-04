import { addDays, differenceInCalendarDays, endOfDay, format, startOfDay, subDays } from "date-fns";
import { prisma } from "../db/client";
import { todayInBrazil } from "./invoices";

export type ForecastEvent = { date: Date; amount: number; label: string; source: "BILL" | "RECURRING" | "SCHEDULED" };
export type ForecastPoint = { date: string; balance: number };

export type Forecast = {
  horizonDays: number;
  startBalance: number;
  /** Average daily spending on things that are not planned (groceries, fuel…), over the last 90 days. */
  dailyVariable: number;
  points: ForecastPoint[];
  endBalance: number;
  lowest: { date: string; balance: number };
  /** First day the projected balance is below zero, or null. */
  firstNegative: string | null;
  events: { date: string; amount: number; label: string; source: ForecastEvent["source"] }[];
  plannedIn: number;
  plannedOut: number;
  variableOut: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const key = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Pure: projects the combined balance of the cash accounts day by day.
 * `events` carry a sign (income positive, expense negative). Events dated before today (an overdue bill)
 * land on day one; events past the horizon are ignored. The variable spending is spread evenly.
 */
export function buildForecast(input: { today: Date; startBalance: number; events: ForecastEvent[]; dailyVariable: number; days: number }): Forecast {
  const { today, startBalance, dailyVariable, days } = input;
  const start = startOfDay(today);
  const last = addDays(start, days);

  const byDay = new Map<string, number>();
  const kept: ForecastEvent[] = [];
  for (const e of input.events) {
    const day = e.date < start ? start : startOfDay(e.date);
    if (day > last) continue;
    byDay.set(key(day), (byDay.get(key(day)) ?? 0) + e.amount);
    kept.push({ ...e, date: day });
  }

  let balance = startBalance;
  const points: ForecastPoint[] = [];
  let lowest = { date: key(start), balance: round2(startBalance) };
  let firstNegative: string | null = null;
  for (let i = 0; i <= days; i++) {
    const day = addDays(start, i);
    // Day zero is today itself: planned events land on it, the variable spending starts tomorrow.
    balance += byDay.get(key(day)) ?? 0;
    if (i > 0) balance -= dailyVariable;
    const point = { date: key(day), balance: round2(balance) };
    points.push(point);
    if (point.balance < lowest.balance) lowest = point;
    if (firstNegative === null && point.balance < 0) firstNegative = point.date;
  }

  const plannedIn = kept.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const plannedOut = kept.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  return {
    horizonDays: days,
    startBalance: round2(startBalance),
    dailyVariable: round2(dailyVariable),
    points,
    endBalance: points[points.length - 1].balance,
    lowest,
    firstNegative,
    events: kept
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((e) => ({ date: key(e.date), amount: round2(e.amount), label: e.label, source: e.source })),
    plannedIn: round2(plannedIn),
    plannedOut: round2(plannedOut),
    variableOut: round2(dailyVariable * days),
  };
}

/** Dates a rule will fire on inside the window: its day each month, skipping the current month if already generated. */
export function ruleDates(rule: { dayOfMonth: number; lastGeneratedMonth: string | null }, today: Date, days: number): Date[] {
  const start = startOfDay(today);
  const last = addDays(start, days);
  const out: Date[] = [];
  for (let m = 0; m <= Math.ceil(days / 28) + 1; m++) {
    const date = new Date(start.getFullYear(), start.getMonth() + m, rule.dayOfMonth);
    // A day that does not exist in the month rolls over (31 -> next month): treat it as the month's last day.
    const month = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const real = date.getMonth() === month.getMonth() ? date : new Date(month.getFullYear(), month.getMonth(), lastDay);
    if (real < start || real > last) continue;
    // The daily job creates today's entry in the morning: once generated this month it is already in the balance.
    if (m === 0 && rule.lastGeneratedMonth === format(start, "yyyy-MM")) continue;
    out.push(real);
  }
  return out;
}

export async function getForecast(workspaceId: string, days = 60, today = todayInBrazil()): Promise<Forecast> {
  const start = startOfDay(today);
  const horizonEnd = endOfDay(addDays(start, days));
  const sinceVariable = subDays(start, 90);

  const [accounts, bills, rules, scheduled, pastRows] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId, type: { not: "CREDIT_CARD" } }, select: { id: true } }),
    prisma.bill.findMany({ where: { workspaceId, status: "PENDING", dueDate: { lte: horizonEnd } }, select: { description: true, amount: true, dueDate: true } }),
    prisma.recurringRule.findMany({ where: { workspaceId, active: true }, select: { description: true, amount: true, type: true, dayOfMonth: true, lastGeneratedMonth: true } }),
    // Entries already dated in the future on cash accounts (the daily job or the person put them there).
    prisma.transaction.findMany({
      where: { workspaceId, status: "CONFIRMED", date: { gt: endOfDay(start), lte: horizonEnd }, type: { in: ["INCOME", "EXPENSE"] }, account: { type: { not: "CREDIT_CARD" } } },
      select: { description: true, amount: true, type: true, date: true },
    }),
    prisma.transaction.findMany({
      where: { workspaceId, status: "CONFIRMED", type: "EXPENSE", date: { gte: sinceVariable, lte: endOfDay(start) }, isRecurring: false, isInstallment: false, account: { type: { not: "CREDIT_CARD" } } },
      select: { amount: true },
    }),
  ]);

  // Current combined cash balance, the same figure as "Saldo total em contas".
  const ids = accounts.map((a) => a.id);
  const ledger = ids.length
    ? await prisma.transaction.findMany({ where: { status: "CONFIRMED", date: { lte: endOfDay(start) }, OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }] }, select: { type: true, amount: true, accountId: true, toAccountId: true } })
    : [];
  const cash = new Set(ids);
  const startBalance = ledger.reduce((sum, t) => {
    const amount = Number(t.amount);
    if (t.type === "TRANSFER") return sum + (t.toAccountId && cash.has(t.toAccountId) ? amount : 0) - (t.accountId && cash.has(t.accountId) ? amount : 0);
    if (!t.accountId || !cash.has(t.accountId)) return sum;
    return t.type === "EXPENSE" ? sum - amount : sum + amount; // INCOME and ADJUSTMENT add
  }, 0);

  const events: ForecastEvent[] = [
    ...bills.map((b) => ({ date: b.dueDate, amount: -Number(b.amount), label: b.description, source: "BILL" as const })),
    ...scheduled.map((t) => ({ date: t.date, amount: t.type === "INCOME" ? Number(t.amount) : -Number(t.amount), label: t.description, source: "SCHEDULED" as const })),
    ...rules.flatMap((r) =>
      ruleDates(r, start, days).map((date) => ({ date, amount: r.type === "INCOME" ? Number(r.amount) : -Number(r.amount), label: r.description, source: "RECURRING" as const })),
    ),
  ];

  const variableTotal = pastRows.reduce((s, r) => s + Number(r.amount), 0);
  const observedDays = Math.max(1, Math.min(90, differenceInCalendarDays(start, sinceVariable)));
  return buildForecast({ today: start, startBalance, events, dailyVariable: variableTotal / observedDays, days });
}
