import { endOfDay, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { prisma } from "../db/client";
import { sendNotificationEmail, isEmailConfigured } from "../email/resend";
import { monthlyAverage } from "./smartAlerts";
import { todayInBrazil } from "./invoices";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthName = (d: Date) => `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;

export type MonthlyReview = {
  month: Date;
  label: string;
  income: number;
  expense: number;
  result: number;
  previousResult: number | null;
  /** Change of the result against the month before, in percent of that month's result; null if there is nothing to compare. */
  resultChange: number | null;
  top: { name: string; total: number }[];
  aboveAverage: { name: string; total: number; average: number }[];
};

/** Pure: how the result moved against the month before. Compared by absolute value, so a smaller loss counts as an improvement. */
export function resultChange(result: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((result - previous) / Math.abs(previous)) * 100;
}

export async function getMonthlyReview(workspaceId: string, month: Date): Promise<MonthlyReview> {
  const start = startOfMonth(month);
  const monthRows = (from: Date, to: Date) =>
    prisma.transaction.findMany({
      where: { workspaceId, status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: from, lte: endOfDay(to) } },
      select: { type: true, amount: true, category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } } },
    });

  const rows = await monthRows(start, endOfMonth(start));
  const before = startOfMonth(subMonths(start, 1));
  const previousRows = await monthRows(before, endOfMonth(before));

  const income = rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + Number(r.amount), 0);
  const expense = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + Number(r.amount), 0);
  const prevIncome = previousRows.filter((r) => r.type === "INCOME").reduce((s, r) => s + Number(r.amount), 0);
  const prevExpense = previousRows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + Number(r.amount), 0);
  const result = income - expense;
  const previousResult = previousRows.length > 0 ? prevIncome - prevExpense : null;

  // Spending by top-level category.
  const groups = new Map<string, { name: string; total: number }>();
  for (const r of rows) {
    if (r.type !== "EXPENSE") continue;
    const top = r.category?.parent ?? r.category;
    const key = top?.id ?? "none";
    const g = groups.get(key) ?? { name: top?.name ?? "Sem categoria", total: 0 };
    g.total += Number(r.amount);
    groups.set(key, g);
  }
  const ranked = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);

  // Categories noticeably above their usual month (the three months before this one).
  const aboveAverage: MonthlyReview["aboveAverage"] = [];
  for (const [id, g] of ranked.slice(0, 8)) {
    if (id === "none") continue;
    const family = await prisma.category.findMany({ where: { workspaceId, OR: [{ id }, { parentId: id }] }, select: { id: true } });
    const usual = await monthlyAverage(workspaceId, family.map((c) => c.id), start);
    if (usual && g.total > usual.average * 1.2 && g.total - usual.average >= 100) {
      aboveAverage.push({ name: g.name, total: g.total, average: usual.average });
    }
  }
  aboveAverage.sort((a, b) => b.total - b.average - (a.total - a.average));

  return {
    month: start,
    label: monthName(start),
    income,
    expense,
    result,
    previousResult,
    resultChange: resultChange(result, previousResult),
    top: ranked.slice(0, 3).map(([, g]) => ({ name: g.name, total: g.total })),
    aboveAverage: aboveAverage.slice(0, 3),
  };
}

/** The sentences of the review (plain text, reused by the e-mail body). */
export function describeReview(r: MonthlyReview): string[] {
  const signed = (v: number) => `${v < 0 ? "-" : "+"}${brl(Math.abs(v))}`;
  const lines = [`Receitas de ${r.label}: ${brl(r.income)}. Despesas: ${brl(r.expense)}. Resultado: ${signed(r.result)}.`];
  if (r.resultChange !== null) {
    const pct = Math.round(Math.abs(r.resultChange));
    if (pct === 0) lines.push("Seu resultado ficou igual ao do mês anterior.");
    else lines.push(`Seu resultado deste mês está ${pct}% ${r.resultChange > 0 ? "acima" : "abaixo"} do mês anterior (${signed(r.previousResult!)}).`);
  }
  if (r.top.length > 0) lines.push(`Onde mais gastou: ${r.top.map((c) => `${c.name} (${brl(c.total)})`).join(", ")}.`);
  for (const c of r.aboveAverage) {
    lines.push(`${c.name} ficou acima da sua média: ${brl(c.total)} contra ${brl(c.average)} nos meses anteriores.`);
  }
  return lines;
}

export function buildReviewHtml(name: string, r: MonthlyReview, webUrl: string | undefined): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:520px">
    <p>Olá, ${escapeHtml(name.split(" ")[0])}! Aqui está o fechamento de <strong>${escapeHtml(r.label)}</strong>.</p>
    ${describeReview(r).map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
    ${webUrl ? `<p><a href="${webUrl}/relatorios">Abrir os relatórios no painel</a></p>` : ""}
    <p style="color:#9CA3AF;font-size:12px">Você recebe este e-mail porque ativou o fechamento do mês. Para parar, desative em Relatórios no painel.</p>
  </div>`;
}

/**
 * Runs on days 1 to 3: e-mails the month that just closed to everyone who turned it on. The month
 * key makes any later run a no-op; a failed send keeps the key empty so the next run retries.
 */
export async function runMonthlyReviews(today = todayInBrazil()) {
  if (today.getDate() > 3 || !isEmailConfigured()) return 0;
  const month = startOfMonth(subMonths(today, 1));
  const key = `M:${format(month, "yyyy-MM")}`;

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", monthlyReviewEmail: true },
    select: { id: true, name: true, email: true, workspaceId: true, monthlyReviewLastKey: true },
  });

  const cache = new Map<string, MonthlyReview>();
  let sent = 0;
  for (const user of users) {
    if (user.monthlyReviewLastKey === key) continue;
    try {
      let review = cache.get(user.workspaceId);
      if (!review) {
        review = await getMonthlyReview(user.workspaceId, month);
        cache.set(user.workspaceId, review);
      }
      // A month with no entries has nothing to say: mark it done instead of retrying every day.
      if (review.income > 0 || review.expense > 0) {
        await sendNotificationEmail(user.email, {
          subject: `Fechamento de ${review.label}`,
          html: buildReviewHtml(user.name, review, process.env.WEB_URL),
        });
        sent++;
      }
      await prisma.user.update({ where: { id: user.id }, data: { monthlyReviewLastKey: key } });
    } catch (err) {
      console.error(`Monthly review e-mail failed for user ${user.id}:`, err);
    }
  }
  return sent;
}
