import { addDays, endOfDay, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { prisma } from "../db/client";
import { todayInBrazil } from "./invoices";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const MIN_AVERAGE = 100; // an average under this is not worth an alert
const MIN_INCREASE_BASE = 50;
const MIN_INCREASE_DELTA = 100;
const INCREASE_RATIO = 1.25;
const MIN_DAYS_FOR_TRENDS = 5;

/** The top-level category an entry belongs to, with every id that rolls up into it. */
export async function categoryFamily(workspaceId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, workspaceId }, include: { parent: true } });
  if (!category) return null;
  const top = category.parent ?? category;
  const children = await prisma.category.findMany({ where: { workspaceId, parentId: top.id }, select: { id: true } });
  return { id: top.id, name: top.name, ids: [top.id, ...children.map((c) => c.id)] };
}

export async function spentIn(workspaceId: string, categoryIds: string[], from: Date, to: Date): Promise<number> {
  const sum = await prisma.transaction.aggregate({
    where: { workspaceId, categoryId: { in: categoryIds }, type: "EXPENSE", status: "CONFIRMED", date: { gte: from, lte: endOfDay(to) } },
    _sum: { amount: true },
  });
  return Number(sum._sum.amount ?? 0);
}

/**
 * Average monthly spending on a category over the three full months before `today`'s month. Needs
 * at least two of those months with spending, otherwise there is no "usual" to exceed.
 */
export async function monthlyAverage(workspaceId: string, categoryIds: string[], today: Date): Promise<{ average: number; months: number } | null> {
  const totals: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const start = startOfMonth(subMonths(today, i));
    totals.push(await spentIn(workspaceId, categoryIds, start, endOfMonth(start)));
  }
  const withData = totals.filter((t) => t > 0);
  if (withData.length < 2) return null;
  const average = withData.reduce((s, t) => s + t, 0) / withData.length;
  return average >= MIN_AVERAGE ? { average, months: withData.length } : null;
}

/** Pure: did this expense push the category past its usual monthly spending? (only on the crossing) */
export function crossedAverage(before: number, after: number, average: number): boolean {
  return before <= average && after > average;
}

/** Pure: has spending newly become 25%+ (and R$100+) above the same window of last month? */
export function crossedIncrease(before: number, after: number, base: number): boolean {
  if (base < MIN_INCREASE_BASE) return false;
  const over = (value: number) => value >= base * INCREASE_RATIO && value - base >= MIN_INCREASE_DELTA;
  return over(after) && !over(before);
}

/**
 * Alert lines to append to the confirmation of an expense that was just registered: it passed the
 * category's usual monthly spend, or its spending became noticeably higher than last month's.
 * Both fire only on the crossing, so nothing repeats and no state is stored. Entries from other
 * months (or in the future) say nothing about "this month so far" and are ignored.
 */
export async function checkSpendingAlerts(
  workspaceId: string,
  transactionId: string,
  amountThisMonth: number,
  today = todayInBrazil(),
): Promise<string> {
  const tx = await prisma.transaction.findFirst({ where: { id: transactionId, workspaceId, type: "EXPENSE", status: "CONFIRMED" } });
  if (!tx?.categoryId) return "";
  if (format(tx.date, "yyyy-MM") !== format(today, "yyyy-MM") || tx.date > endOfDay(today)) return "";

  const family = await categoryFamily(workspaceId, tx.categoryId);
  if (!family) return "";

  const monthStart = startOfMonth(today);
  const after = await spentIn(workspaceId, family.ids, monthStart, today);
  const before = after - amountThisMonth;
  const lines: string[] = [];

  const usual = await monthlyAverage(workspaceId, family.ids, today);
  if (usual && crossedAverage(before, after, usual.average)) {
    lines.push(
      `📊 Você ultrapassou sua média mensal de ${family.name}: ${brl(after)} este mês, contra uma média de ${brl(usual.average)} nos últimos ${usual.months} meses.`,
    );
  }

  if (today.getDate() >= MIN_DAYS_FOR_TRENDS) {
    const prevStart = startOfMonth(subMonths(today, 1));
    const prevEnd = endOfMonth(prevStart);
    const windowEnd = addDays(prevStart, today.getDate() - 1) < prevEnd ? addDays(prevStart, today.getDate() - 1) : prevEnd;
    const base = await spentIn(workspaceId, family.ids, prevStart, windowEnd);
    if (crossedIncrease(before, after, base)) {
      const pct = ((after - base) / base) * 100;
      lines.push(`📈 Seus gastos com ${family.name} aumentaram ${pct.toFixed(0)}% em relação ao mesmo período do mês passado (${brl(base)} → ${brl(after)}).`);
    }
  }

  return lines.map((l) => `\n\n${l}`).join("");
}
