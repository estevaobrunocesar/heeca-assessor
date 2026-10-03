import { addDays, endOfDay, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { prisma } from "../db/client";
import { normalizeText } from "./keywords";
import { todayInBrazil } from "./invoices";

export type Severity = "alert" | "warn" | "info";
export type InsightKind = "DEFICIT" | "COMMITTED" | "INCREASE" | "CONCENTRATION" | "NON_ESSENTIAL" | "DELIVERY";
export type Insight = { kind: InsightKind; severity: Severity; text: string };

/** One confirmed entry reduced to what the analysis needs: `parent` is the top-level category, `name` the subcategory (null if none). */
export type Entry = { type: "INCOME" | "EXPENSE"; amount: number; parent: string | null; name: string | null };

export type FinanceAnalysis = {
  monthLabel: string;
  dayOfMonth: number;
  income: number;
  expense: number;
  result: number;
  /** Spending from the 1st to the same day of the previous month, and the change against it. */
  previousExpense: number;
  expenseChange: number | null;
  top: { name: string; total: number; percent: number }[];
  recurringCommitted: number;
  committedPercent: number | null;
  nonEssential: number;
  insights: Insight[];
};

// What counts as non-essential spending. Deliberately a short, editable list: top-level categories
// of the taxonomy, plus a few eating-out subcategories of Alimentação (the rest of it is groceries).
const NON_ESSENTIAL_CATEGORIES = new Set(
  ["Lazer", "Viagens", "Beleza e Cuidados Pessoais", "Assinaturas", "Roupas e Acessórios", "Compras", "Presentes", "Tecnologia e Eletrônicos"].map(normalizeText),
);
const NON_ESSENTIAL_SUBCATEGORIES = new Set(["Delivery", "Restaurante", "Fast food", "Café"].map(normalizeText));
const DELIVERY = normalizeText("Delivery");

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const MIN_SPEND = 100; // below this a category is noise, not a bottleneck
const MIN_DAYS_FOR_TRENDS = 5; // a comparison on day 2 of the month says nothing

const categoryOf = (e: Entry) => e.parent ?? e.name ?? "Sem categoria";

function isNonEssential(e: Entry): boolean {
  if (NON_ESSENTIAL_CATEGORIES.has(normalizeText(categoryOf(e)))) return true;
  // For Alimentação the subcategory is the name; for others the parent is.
  return e.name !== null && e.parent !== null && NON_ESSENTIAL_SUBCATEGORIES.has(normalizeText(e.name));
}

const sumBy = (entries: Entry[], pick: (e: Entry) => boolean) => entries.filter(pick).reduce((s, e) => s + e.amount, 0);

const SEVERITY_ORDER: Record<Severity, number> = { alert: 0, warn: 1, info: 2 };

/**
 * Pure: the figures and the points of attention for a month-to-date, given the same window of the
 * previous month, what is already committed every month and the income to measure it against.
 */
export function analyze(input: {
  today: Date;
  current: Entry[];
  previous: Entry[];
  recurringCommitted: number;
  referenceIncome: number;
}): FinanceAnalysis {
  const { today, current, previous, recurringCommitted, referenceIncome } = input;
  const income = sumBy(current, (e) => e.type === "INCOME");
  const expenses = current.filter((e) => e.type === "EXPENSE");
  const expense = expenses.reduce((s, e) => s + e.amount, 0);
  const previousExpense = sumBy(previous, (e) => e.type === "EXPENSE");

  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(categoryOf(e), (byCategory.get(categoryOf(e)) ?? 0) + e.amount);
  const previousByCategory = new Map<string, number>();
  for (const e of previous.filter((x) => x.type === "EXPENSE")) {
    previousByCategory.set(categoryOf(e), (previousByCategory.get(categoryOf(e)) ?? 0) + e.amount);
  }
  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 3).map(([name, total]) => ({ name, total, percent: expense > 0 ? (total / expense) * 100 : 0 }));

  const nonEssential = sumBy(expenses, isNonEssential);
  const delivery = sumBy(expenses, (e) => e.name !== null && normalizeText(e.name) === DELIVERY);
  const committedPercent = referenceIncome > 0 && recurringCommitted > 0 ? (recurringCommitted / referenceIncome) * 100 : null;

  const insights: Insight[] = [];

  if (income > 0 && expense > income && expense >= MIN_SPEND) {
    insights.push({
      kind: "DEFICIT",
      severity: "alert",
      text: `Suas despesas (${brl(expense)}) já superam as receitas (${brl(income)}) deste mês, uma diferença de ${brl(expense - income)}.`,
    });
  }

  if (committedPercent !== null && committedPercent >= 30) {
    insights.push({
      kind: "COMMITTED",
      severity: committedPercent >= 70 ? "alert" : committedPercent >= 50 ? "warn" : "info",
      text: `${committedPercent.toFixed(0)}% da sua renda já está comprometida com despesas recorrentes (${brl(recurringCommitted)} por mês).`,
    });
  }

  if (today.getDate() >= MIN_DAYS_FOR_TRENDS) {
    const rises = ranked
      .map(([name, total]) => ({ name, total, before: previousByCategory.get(name) ?? 0 }))
      .filter((c) => c.before >= 50 && c.total >= c.before * 1.25 && c.total - c.before >= MIN_SPEND)
      .sort((a, b) => b.total - b.before - (a.total - a.before))
      .slice(0, 3);
    for (const c of rises) {
      const pct = ((c.total - c.before) / c.before) * 100;
      insights.push({
        kind: "INCREASE",
        severity: pct >= 50 ? "alert" : "warn",
        text: `Seus gastos com ${c.name} aumentaram ${pct.toFixed(0)}% em relação ao mesmo período do mês passado (${brl(c.before)} → ${brl(c.total)}).`,
      });
    }
  }

  for (const c of top.filter((c) => c.percent >= 20 && c.total >= MIN_SPEND).slice(0, 2)) {
    insights.push({
      kind: "CONCENTRATION",
      severity: c.percent >= 35 ? "warn" : "info",
      text: `${c.name} representa ${c.percent.toFixed(0)}% das suas despesas deste mês (${brl(c.total)}).`,
    });
  }

  if (nonEssential >= MIN_SPEND && expense > 0) {
    const share = (nonEssential / expense) * 100;
    insights.push({
      kind: "NON_ESSENTIAL",
      severity: share >= 40 ? "warn" : "info",
      text: `Seus gastos não essenciais somam ${brl(nonEssential)} este mês (${share.toFixed(0)}% das despesas).`,
    });
  }

  if (delivery >= MIN_SPEND) {
    insights.push({
      kind: "DELIVERY",
      severity: delivery >= 400 ? "warn" : "info",
      text: `Você gastou ${brl(delivery)} com delivery este mês.`,
    });
  }

  insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    monthLabel: format(today, "MM/yyyy"),
    dayOfMonth: today.getDate(),
    income,
    expense,
    result: income - expense,
    previousExpense,
    expenseChange: previousExpense > 0 ? ((expense - previousExpense) / previousExpense) * 100 : null,
    top,
    recurringCommitted,
    committedPercent,
    nonEssential,
    insights: insights.slice(0, 6),
  };
}

const ICON: Record<Severity, string> = { alert: "🚨", warn: "⚠️", info: "💡" };

/** The WhatsApp answer for "como estão minhas finanças?". */
export function formatAnalysis(a: FinanceAnalysis): string {
  const lines = [`📊 Suas finanças — ${a.monthLabel} (até o dia ${a.dayOfMonth})`];
  if (a.income === 0 && a.expense === 0) {
    lines.push("Ainda não há lançamentos neste mês. Me conte seus gastos e recebimentos por aqui. 😉");
    return lines.join("\n");
  }
  lines.push(`Receitas: ${brl(a.income)} · Despesas: ${brl(a.expense)} · Resultado: ${a.result < 0 ? "-" : "+"}${brl(Math.abs(a.result))}`);
  if (a.expenseChange !== null) {
    const rounded = Math.round(Math.abs(a.expenseChange));
    lines.push(
      rounded === 0
        ? `Despesas iguais às do mesmo período do mês passado (${brl(a.previousExpense)}).`
        : `Despesas ${a.expenseChange > 0 ? "▲" : "▼"} ${rounded}% em relação ao mesmo período do mês passado (${brl(a.previousExpense)}).`,
    );
  }
  if (a.top.length > 0) {
    lines.push("", "Onde mais gastou:");
    a.top.forEach((c, i) => lines.push(`${i + 1}. ${c.name} — ${brl(c.total)} (${c.percent.toFixed(0)}%)`));
  }
  lines.push("");
  if (a.insights.length === 0) lines.push("Nenhum ponto de atenção nos seus dados até agora. 👍");
  else {
    lines.push("Pontos de atenção:");
    for (const i of a.insights) lines.push(`${ICON[i.severity]} ${i.text}`);
  }
  return lines.join("\n");
}

/** Loads the month-to-date, the same window of the previous month and the recurring commitments, then analyzes. */
export async function getFinanceAnalysis(workspaceId: string, today = todayInBrazil()): Promise<FinanceAnalysis> {
  const monthStart = startOfMonth(today);
  const prevStart = startOfMonth(subMonths(today, 1));
  const prevEnd = endOfMonth(prevStart);
  // The same days of the previous month: 1st up to today's day number (capped at its last day).
  const prevWindowEnd = addDays(prevStart, today.getDate() - 1) < prevEnd ? addDays(prevStart, today.getDate() - 1) : prevEnd;

  const load = async (from: Date, to: Date): Promise<Entry[]> => {
    const rows = await prisma.transaction.findMany({
      where: { workspaceId, status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: from, lte: endOfDay(to) } },
      select: { type: true, amount: true, category: { select: { name: true, parent: { select: { name: true } } } } },
    });
    return rows.map((r) => {
      const child = r.category?.parent ? r.category.name : null;
      return {
        type: r.type as "INCOME" | "EXPENSE",
        amount: Number(r.amount),
        parent: r.category ? (r.category.parent?.name ?? r.category.name) : null,
        name: child,
      };
    });
  };

  const [current, previous, previousMonthFull, rules, repeatingBills] = await Promise.all([
    load(monthStart, today),
    load(prevStart, prevWindowEnd),
    load(prevStart, prevEnd),
    prisma.recurringRule.findMany({ where: { workspaceId, active: true, type: "EXPENSE" }, select: { amount: true } }),
    prisma.bill.findMany({ where: { workspaceId, status: "PENDING", repeatMonthly: true }, select: { amount: true } }),
  ]);

  const recurringCommitted = [...rules, ...repeatingBills].reduce((s, r) => s + Number(r.amount), 0);
  const currentIncome = current.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);
  const previousIncome = previousMonthFull.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);

  return analyze({ today, current, previous, recurringCommitted, referenceIncome: currentIncome > 0 ? currentIncome : previousIncome });
}
