import { addMonths, format, startOfMonth, subDays, subMonths } from "date-fns";
import { prisma } from "../db/client";
import { normalizeText, usableKeyword } from "./keywords";

// "gasto com uber", "assinatura da Netflix", "despesa em pizza" → the thing
// that was bought, so the same merchant matches across differently worded
// descriptions.
const GENERIC_PREFIX =
  /^(?:(?:gasto|gastos|compra|compras|despesa|despesas|pagamento|pagamentos|assinatura|recebimento)\s+(?:de|do|da|dos|das|com|em|no|na|nos|nas|para|pra)\s+)+/;
const ARTICLE_PREFIX = /^(?:o|a|os|as|um|uma)\s+/;
// Words about how it was paid, not what was bought ("tv parcelada em 10x").
const INSTALLMENT_NOISE = /\b(?:parcelad[oa]s?|em\s+\d+\s*x|\d+\s*x|em\s+\d+\s+vezes|\d+\s+vezes)\b/g;

/** What identifies "the same expense" across transactions: the merchant if known, else the description. */
export function repeatKey(merchant: string | null, description: string): string {
  const base = merchant?.trim() ? merchant : description.replace(/\s*\(parcela \d+\/\d+\)\s*$/i, "");
  return normalizeText(base)
    .replace(INSTALLMENT_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(GENERIC_PREFIX, "")
    .replace(ARTICLE_PREFIX, "");
}

/** Same expense by wording: equal keys, or every word of the shorter one appears in the longer ("tv" / "tv samsung"). */
export function sameKey(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const longWords = new Set(long.split(" "));
  return short.split(" ").every((w) => longWords.has(w));
}

/**
 * An existing transaction with the same kind, amount, day and merchant — the
 * signature of an entry sent twice. It is only ever a warning: buying two
 * identical coffees in a day is legitimate.
 */
export async function findPossibleDuplicate(params: {
  workspaceId: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  date: Date;
  key: string;
  /** Set for an installment purchase: matches another purchase split the same way. */
  installmentTotal?: number | null;
}) {
  const { workspaceId, type, amount, date, key, installmentTotal } = params;
  // Two letters is enough to compare entries ("tv"); the 3-letter floor of
  // usableKeyword exists to keep keyword *rules* from being too broad.
  if (key.length < 2) return null;

  const sameDay = await prisma.transaction.findMany({
    where: {
      workspaceId,
      status: "CONFIRMED",
      type,
      ...(installmentTotal ? { isInstallment: true, installmentNo: 1, installmentTotal } : { isInstallment: false }),
      date,
      // Decimal column vs JS float: compare as a tolerance range, not equality.
      amount: { gte: amount - 0.005, lte: amount + 0.005 },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return sameDay.find((t) => sameKey(repeatKey(t.merchant, t.description), key)) ?? null;
}

export type RecurringSpend = {
  label: string;
  typicalAmount: number;
  months: number;
  lastDate: Date;
  nextDate: Date;
};

export type FrequentSpend = { label: string; count: number; total: number };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/**
 * Looks at the last six months of one-off expenses (installment purchases
 * are a single decision, not a habit) and reports:
 *  - recurring: the same merchant in at least 3 different months with
 *    similar amounts (within ±20% of the median), not more than twice a
 *    month, and seen in the last 45 days — subscriptions and fixed bills;
 *  - frequent: the same merchant at least 4 times in the last 30 days.
 */
export async function detectRepeatedSpending(workspaceId: string, today: Date) {
  const rows = await prisma.transaction.findMany({
    where: {
      workspaceId,
      status: "CONFIRMED",
      type: "EXPENSE",
      isInstallment: false,
      date: { gte: startOfMonth(subMonths(today, 5)), lte: today },
    },
    select: { date: true, amount: true, description: true, merchant: true },
    orderBy: { date: "asc" },
  });

  const groups = new Map<string, { date: Date; amount: number; label: string }[]>();
  for (const r of rows) {
    const key = repeatKey(r.merchant, r.description);
    if (!usableKeyword(key)) continue;
    const entry = { date: r.date, amount: Number(r.amount), label: (r.merchant?.trim() || r.description).trim() };
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const recurring: RecurringSpend[] = [];
  const frequent: FrequentSpend[] = [];
  const recentFrom = subDays(today, 30);

  for (const entries of groups.values()) {
    const months = new Set(entries.map((e) => format(e.date, "yyyy-MM")));
    const amounts = entries.map((e) => e.amount);
    const typical = median(amounts);
    const similar = (Math.max(...amounts) - Math.min(...amounts)) / typical <= 0.4; // ±20% around the median
    const lastDate = entries[entries.length - 1].date;
    // A subscription last seen months ago was most likely cancelled.
    const stillActive = lastDate >= subDays(today, 45);
    if (months.size >= 3 && similar && stillActive && entries.length / months.size <= 2) {
      recurring.push({
        label: mostCommon(entries.map((e) => e.label)),
        typicalAmount: typical,
        months: months.size,
        lastDate,
        nextDate: addMonths(lastDate, 1),
      });
    }

    const recent = entries.filter((e) => e.date >= recentFrom);
    if (recent.length >= 4) {
      frequent.push({
        label: mostCommon(recent.map((e) => e.label)),
        count: recent.length,
        total: recent.reduce((sum, e) => sum + e.amount, 0),
      });
    }
  }

  recurring.sort((a, b) => b.typicalAmount - a.typicalAmount);
  frequent.sort((a, b) => b.total - a.total);
  return { recurring, frequent: frequent.slice(0, 5) };
}
