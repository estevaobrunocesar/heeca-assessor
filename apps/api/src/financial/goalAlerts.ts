import { prisma } from "../db/client";
import { isEmailConfigured, sendGoalAlertEmail } from "../email/resend";
import { todayInBrazil } from "./invoices";
import { describeGoal, pickGoalAlert, type GoalAlertKind, type GoalView } from "./goals";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dmy = (d: Date) => d.toLocaleDateString("pt-BR");

/** The subject and the sentences of an alert (plain text, reused by the e-mail body). */
export function describeAlert(kind: GoalAlertKind, g: GoalView): { subject: string; lines: string[] } {
  const progress = `Você guardou ${brl(g.saved)} de ${brl(g.target)} (${g.percent.toFixed(0)}%).`;
  if (kind === "OVERDUE") {
    return {
      subject: `Prazo da meta "${g.name}" venceu`,
      lines: [
        `O prazo da meta ${g.name} era ${dmy(g.deadline!)} e ela não foi concluída.`,
        `${progress} Faltam ${brl(g.remaining)}.`,
        "Você pode guardar o que falta ou ajustar o prazo na página Metas.",
      ],
    };
  }
  if (kind === "NEAR") {
    const when = g.daysLeft === 0 ? "hoje" : g.daysLeft === 1 ? "amanhã" : `em ${g.daysLeft} dias`;
    return {
      subject: `A meta "${g.name}" vence ${when}`,
      lines: [`O prazo da meta ${g.name} é ${dmy(g.deadline!)} (${when}).`, `${progress} Faltam ${brl(g.remaining)}.`],
    };
  }
  return {
    subject: `A meta "${g.name}" está atrasada`,
    lines: [
      `A meta ${g.name} está abaixo do ritmo para chegar em ${dmy(g.deadline!)}.`,
      `${progress} Até hoje o esperado era ${brl(g.expectedSoFar ?? 0)}.`,
      `Para chegar no prazo, guarde cerca de ${brl(g.monthlyNeeded ?? 0)} por mês (${g.monthsLeft} ${g.monthsLeft === 1 ? "mês" : "meses"}).`,
    ],
  };
}

export function buildAlertHtml(name: string, kind: GoalAlertKind, g: GoalView, webUrl: string | undefined): string {
  const { lines } = describeAlert(kind, g);
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:520px">
    <p>Olá, ${escapeHtml(name.split(" ")[0])}!</p>
    ${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
    ${webUrl ? `<p><a href="${webUrl}/metas">Abrir Metas no painel</a></p>` : ""}
    <p style="color:#9CA3AF;font-size:12px">Você recebe este aviso porque tem uma meta de economia. Para parar, desative os alertas por e-mail na página Metas.</p>
  </div>`;
}

/**
 * Daily job: for every goal that needs an alert, e-mails the people of its workspace who have
 * alerts on, and records what was sent so it is not repeated. Nothing is recorded if nobody
 * could be notified, so the next run tries again.
 */
export async function runGoalAlerts(today = todayInBrazil()) {
  if (!isEmailConfigured()) return 0;

  const goals = await prisma.savingsGoal.findMany({ where: { deadline: { not: null } } });
  if (goals.length === 0) return 0;
  const sums = await prisma.goalContribution.groupBy({ by: ["goalId"], _sum: { amount: true } });
  const saved = new Map(sums.map((s) => [s.goalId, Number(s._sum.amount ?? 0)]));

  let sent = 0;
  for (const goal of goals) {
    const view = describeGoal(goal, saved.get(goal.id) ?? 0, today);
    const alert = pickGoalAlert(view, { key: goal.lastAlertKey, at: goal.lastAlertAt }, today);
    if (!alert) continue;

    const people = await prisma.user.findMany({
      where: { workspaceId: goal.workspaceId, status: "ACTIVE", goalAlertsEmail: true },
      select: { name: true, email: true },
    });
    const { subject } = describeAlert(alert.kind, view);

    let delivered = 0;
    for (const person of people) {
      try {
        await sendGoalAlertEmail(person.email, { subject, html: buildAlertHtml(person.name, alert.kind, view, process.env.WEB_URL) });
        delivered++;
      } catch (err) {
        console.error(`Goal alert e-mail failed for goal ${goal.id}:`, err);
      }
    }
    if (delivered > 0) {
      await prisma.savingsGoal.update({ where: { id: goal.id }, data: { lastAlertKey: alert.key, lastAlertAt: new Date() } });
      sent += delivered;
    }
  }
  return sent;
}
