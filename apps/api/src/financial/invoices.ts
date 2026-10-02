import { addDays, addMonths, endOfDay, lastDayOfMonth } from "date-fns";
import { prisma } from "../db/client";

export type InvoiceStatus = "FECHADA" | "ABERTA" | "FUTURA";

export type InvoiceCycle = {
  startDate: Date;
  closingDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
};

// Days past the end of a short month (closing on the 31st in February)
// fall back to that month's last day, the way card issuers do.
function dayInMonth(year: number, month: number, day: number): Date {
  const first = new Date(year, month, 1);
  return new Date(year, month, Math.min(day, lastDayOfMonth(first).getDate()));
}

function closingOfCycleContaining(date: Date, closingDay: number): Date {
  const thisMonthClosing = dayInMonth(date.getFullYear(), date.getMonth(), closingDay);
  if (date <= thisMonthClosing) return thisMonthClosing;
  const next = addMonths(new Date(date.getFullYear(), date.getMonth(), 1), 1);
  return dayInMonth(next.getFullYear(), next.getMonth(), closingDay);
}

/**
 * The invoice cycle that a purchase made on `date` lands in. A purchase on
 * or before the closing day belongs to the invoice closing that month; after
 * it, to the next one. The due date is the next occurrence of `dueDay` after
 * closing (closing 25 / due 5 → due the following month; closing 3 / due 10
 * → due the same month).
 */
export function cycleContaining(date: Date, closingDay: number, dueDay: number, today: Date): InvoiceCycle {
  const closingDate = closingOfCycleContaining(date, closingDay);
  const prevMonth = addMonths(new Date(closingDate.getFullYear(), closingDate.getMonth(), 1), -1);
  const prevClosing = dayInMonth(prevMonth.getFullYear(), prevMonth.getMonth(), closingDay);
  const startDate = addDays(prevClosing, 1);

  const dueMonthOffset = dueDay <= closingDay ? 1 : 0;
  const dueRef = addMonths(new Date(closingDate.getFullYear(), closingDate.getMonth(), 1), dueMonthOffset);
  const dueDate = dayInMonth(dueRef.getFullYear(), dueRef.getMonth(), dueDay);

  const status: InvoiceStatus = closingDate < today ? "FECHADA" : startDate > today ? "FUTURA" : "ABERTA";
  return { startDate, closingDate, dueDate, status };
}

/** The previous, current and next two cycles around `today`, oldest first. */
export function cyclesAround(today: Date, closingDay: number, dueDay: number): InvoiceCycle[] {
  const current = cycleContaining(today, closingDay, dueDay, today);
  const previous = cycleContaining(addDays(current.startDate, -1), closingDay, dueDay, today);
  const next = cycleContaining(addDays(current.closingDate, 1), closingDay, dueDay, today);
  const afterNext = cycleContaining(addDays(next.closingDate, 1), closingDay, dueDay, today);
  return [previous, current, next, afterNext];
}

/** Today's calendar date in São Paulo, as a local-midnight Date. */
export function todayInBrazil(now = new Date()): Date {
  const [y, m, d] = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function getCardInvoices(account: { id: string; closingDay: number; dueDay: number }, workspaceId: string, today = todayInBrazil()) {
  const cycles = cyclesAround(today, account.closingDay, account.dueDay);
  const from = cycles[0].startDate;
  const to = endOfDay(cycles[cycles.length - 1].closingDate);

  const transactions = await prisma.transaction.findMany({
    where: { workspaceId, accountId: account.id, status: "CONFIRMED", type: "EXPENSE", date: { gte: from, lte: to } },
    include: { category: true },
    orderBy: { date: "asc" },
  });

  return cycles.map((cycle) => {
    const items = transactions.filter((t) => t.date >= cycle.startDate && t.date <= endOfDay(cycle.closingDate));
    return {
      ...cycle,
      total: items.reduce((sum, t) => sum + Number(t.amount), 0),
      items: items.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: Number(t.amount),
        category: t.category?.name ?? null,
        installmentNo: t.installmentNo,
        installmentTotal: t.installmentTotal,
      })),
    };
  });
}
