import { addDays, endOfDay, format, startOfWeek, subDays } from "date-fns";
import { prisma } from "../db/client";
import { sendWhatsapp, sendWhatsappTemplate } from "../gateway/outbound";
import { listPendingBills } from "./bills";
import { listGoals } from "./goals";
import { todayInBrazil } from "./invoices";

export type Period = { from: Date; to: Date };

export type WeeklySummary = {
  label: string;
  income: number;
  expense: number;
  result: number;
  previousExpense: number;
  /** Change in spending against the previous period, in percent; null when there was nothing to compare with. */
  expenseChange: number | null;
  top: { name: string; total: number; percent: number }[];
  biggest: { description: string; amount: number; date: Date } | null;
  bills: { count: number; total: number; overdue: number };
  goalsNeedingAttention: string[];
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const dm = (d: Date) => format(d, "dd/MM");

/** The last Monday-to-Sunday week that is already over. */
export function lastClosedWeek(today = todayInBrazil()): Period & { key: string } {
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const from = subDays(thisMonday, 7);
  return { from, to: subDays(thisMonday, 1), key: `W:${format(from, "yyyy-MM-dd")}` };
}

/** Today and the six days before it. */
export function lastSevenDays(today = todayInBrazil()): Period {
  return { from: subDays(today, 6), to: today };
}

/** The period of the same length immediately before this one. */
export function previousPeriod(period: Period): Period {
  const days = Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000) + 1;
  return { from: subDays(period.from, days), to: subDays(period.from, 1) };
}

async function expenseTotal(workspaceId: string, period: Period) {
  const sum = await prisma.transaction.aggregate({
    where: { workspaceId, status: "CONFIRMED", type: "EXPENSE", date: { gte: period.from, lte: endOfDay(period.to) } },
    _sum: { amount: true },
  });
  return Number(sum._sum.amount ?? 0);
}

export async function getWeeklySummary(workspaceId: string, period: Period, today = todayInBrazil()): Promise<WeeklySummary> {
  const rows = await prisma.transaction.findMany({
    where: { workspaceId, status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: period.from, lte: endOfDay(period.to) } },
    include: { category: { include: { parent: true } } },
  });

  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();
  let biggest: WeeklySummary["biggest"] = null;
  for (const r of rows) {
    const amount = Number(r.amount);
    if (r.type === "INCOME") {
      income += amount;
      continue;
    }
    expense += amount;
    const name = r.category?.parent?.name ?? r.category?.name ?? "Sem categoria";
    byCategory.set(name, (byCategory.get(name) ?? 0) + amount);
    if (!biggest || amount > biggest.amount) biggest = { description: r.description, amount, date: r.date };
  }

  const previousExpense = await expenseTotal(workspaceId, previousPeriod(period));

  const horizon = addDays(today, 7);
  const pending = await listPendingBills(workspaceId);
  const due = pending.filter((b) => b.dueDate <= horizon);
  const goals = await listGoals(workspaceId);

  return {
    label: `${dm(period.from)} a ${dm(period.to)}`,
    income,
    expense,
    result: income - expense,
    previousExpense,
    expenseChange: previousExpense > 0 ? ((expense - previousExpense) / previousExpense) * 100 : null,
    top: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, total]) => ({ name, total, percent: expense > 0 ? (total / expense) * 100 : 0 })),
    biggest,
    bills: {
      count: due.length,
      total: due.reduce((s, b) => s + Number(b.amount), 0),
      overdue: due.filter((b) => b.dueDate < today).length,
    },
    goalsNeedingAttention: goals
      .filter((g) => g.state === "VENCIDA" || g.behind || (g.state === "COM_PRAZO" && g.daysLeft !== null && g.daysLeft <= 7))
      .map((g) => g.name),
  };
}

/** The full message, for when the 24h window is open or the person asked for it. */
export function formatSummaryMessage(s: WeeklySummary, title = "Resumo da semana"): string {
  const lines = [`📊 ${title} (${s.label})`];

  if (s.income === 0 && s.expense === 0) {
    lines.push("Nenhum lançamento neste período. Me conte seus gastos por aqui e eu acompanho. 😉");
  } else {
    lines.push(`Receitas: ${brl(s.income)} · Despesas: ${brl(s.expense)} · Saldo: ${brl(s.result)}`);
    if (s.expenseChange !== null) {
      const rounded = Math.round(Math.abs(s.expenseChange));
      lines.push(
        rounded === 0
          ? `Despesas iguais às do período anterior (${brl(s.previousExpense)}).`
          : `Despesas ${s.expenseChange > 0 ? "▲" : "▼"} ${rounded}% em relação ao período anterior (${brl(s.previousExpense)}).`,
      );
    }
    if (s.top.length > 0) {
      lines.push("", "Onde mais gastou:");
      s.top.forEach((c, i) => lines.push(`${i + 1}. ${c.name} — ${brl(c.total)} (${c.percent.toFixed(0)}%)`));
    }
    if (s.biggest) lines.push("", `Maior gasto: ${s.biggest.description} — ${brl(s.biggest.amount)} (${dm(s.biggest.date)})`);
  }

  if (s.bills.count > 0) {
    const overdue = s.bills.overdue > 0 ? `, ${s.bills.overdue} já vencida${s.bills.overdue === 1 ? "" : "s"}` : "";
    lines.push("", `💳 Contas a pagar até 7 dias: ${s.bills.count} (${brl(s.bills.total)})${overdue}`);
  }
  if (s.goalsNeedingAttention.length > 0) {
    lines.push(`⚠️ Metas pedindo atenção: ${s.goalsNeedingAttention.join(", ")}`);
  }
  if (s.bills.count > 0 || s.goalsNeedingAttention.length > 0) {
    lines.push("", 'Para ver os detalhes, responda "contas a pagar" ou "minhas metas".');
  }
  return lines.join("\n");
}

/** WhatsApp template variables cannot hold line breaks, tabs or runs of spaces. */
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The four values of the short template:
 * "Resumo da sua semana ({{1}}): você gastou {{2}} e recebeu {{3}}. Maior categoria: {{4}}. Responda *resumo* para ver os detalhes."
 */
export function templateVariables(s: WeeklySummary): Record<string, string> {
  const top = s.top[0];
  return {
    "1": clean(s.label),
    "2": clean(brl(s.expense)),
    "3": clean(brl(s.income)),
    "4": clean(top ? `${top.name} (${brl(top.total)})` : "nenhuma"),
  };
}

const WINDOW_MS = 23 * 60 * 60 * 1000; // a safety margin inside WhatsApp's 24 hours

export type Delivery = "free_form" | "template" | "no_window";

/**
 * Sends the summary the only way WhatsApp allows: in full if the person wrote to us in the last
 * ~23h, otherwise as the approved short template (TWILIO_SUMMARY_TEMPLATE_SID). With neither,
 * nothing is sent and "no_window" is returned.
 */
export async function deliverSummary(
  user: { whatsappPhone: string | null; lastWhatsappAt: Date | null },
  summary: WeeklySummary,
  now = new Date(),
): Promise<Delivery> {
  if (!user.whatsappPhone) return "no_window";
  const to = `whatsapp:${user.whatsappPhone}`;

  if (user.lastWhatsappAt && now.getTime() - user.lastWhatsappAt.getTime() < WINDOW_MS) {
    await sendWhatsapp(to, formatSummaryMessage(summary));
    return "free_form";
  }
  const sid = process.env.TWILIO_SUMMARY_TEMPLATE_SID;
  if (sid) {
    await sendWhatsappTemplate(to, sid, templateVariables(summary));
    return "template";
  }
  return "no_window";
}

/**
 * Runs Monday to Wednesday: sends the closed week to everyone who turned the summary on and has not
 * got it yet. Retrying for three days lets someone whose 24h window was closed on Monday still get it
 * once they write to the bot; the week key makes every other run a no-op. Returns null outside those days.
 */
export async function runWeeklySummaries(today = todayInBrazil(), now = new Date()) {
  const weekday = today.getDay();
  if (weekday < 1 || weekday > 3) return null;
  const week = lastClosedWeek(today);
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", weeklyWhatsappSummary: true, whatsappPhone: { not: null } },
    select: { id: true, workspaceId: true, whatsappPhone: true, lastWhatsappAt: true, weeklyWhatsappLastKey: true },
  });

  const cache = new Map<string, WeeklySummary>();
  const result = { free_form: 0, template: 0, no_window: 0, failed: 0 };
  for (const user of users) {
    if (user.weeklyWhatsappLastKey === week.key) continue;
    try {
      let summary = cache.get(user.workspaceId);
      if (!summary) {
        summary = await getWeeklySummary(user.workspaceId, week, today);
        cache.set(user.workspaceId, summary);
      }
      const delivery = await deliverSummary(user, summary, now);
      result[delivery]++;
      // Only a delivered summary counts as sent; "no_window" leaves the week open for a later run.
      if (delivery !== "no_window") await prisma.user.update({ where: { id: user.id }, data: { weeklyWhatsappLastKey: week.key } });
    } catch (err) {
      result.failed++;
      console.error(`Weekly WhatsApp summary failed for user ${user.id}:`, err);
    }
  }
  return result;
}
