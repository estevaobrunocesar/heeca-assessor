import { format, startOfWeek, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { prisma } from "../db/client";
import { todayInBrazil } from "../financial/invoices";
import { sendReportEmail, isEmailConfigured } from "../email/resend";
import { getReportData, reportFilename, type ReportData } from "./data";
import { buildPdf } from "./pdf";
import { buildXlsx } from "./xlsx";

export type Frequency = "WEEKLY" | "MONTHLY";

/** The most recent period that is already over: last Mon–Sun week, or last calendar month. */
export function lastClosedPeriod(frequency: Frequency, today = todayInBrazil()) {
  if (frequency === "WEEKLY") {
    const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
    const from = subDays(thisMonday, 7);
    return { from, to: subDays(thisMonday, 1), key: `W:${format(from, "yyyy-MM-dd")}`, label: "da semana" };
  }
  const ref = subMonths(today, 1);
  const from = startOfMonth(ref);
  return { from, to: endOfMonth(ref), key: `M:${format(from, "yyyy-MM")}`, label: "do mês" };
}

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildReportEmailHtml(name: string, workspaceName: string, data: ReportData, webUrl: string | undefined) {
  const top = data.expenseByCategory.slice(0, 5);
  const resultColor = data.result >= 0 ? "#16A34A" : "#DC2626";
  const rows = top.length
    ? top
        .map(
          (c) =>
            `<tr><td style="padding:6px 0">${escapeHtml(c.name)}</td><td style="padding:6px 0;text-align:right">${brl(c.total)}</td><td style="padding:6px 0 6px 12px;text-align:right;color:#6B7280">${c.percent.toFixed(0)}%</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="padding:6px 0;color:#6B7280">Nenhum gasto neste período.</td></tr>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:520px">
    <p>Olá, ${escapeHtml(name.split(" ")[0])}! Segue o resumo de <strong>${escapeHtml(workspaceName)}</strong> para ${data.label}.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 0">Receitas</td><td style="padding:6px 0;text-align:right;color:#16A34A">${brl(data.income)}</td></tr>
      <tr><td style="padding:6px 0">Despesas</td><td style="padding:6px 0;text-align:right;color:#DC2626">${brl(data.expense)}</td></tr>
      <tr style="border-top:1px solid #E5E7EB"><td style="padding:8px 0"><strong>Resultado</strong></td><td style="padding:8px 0;text-align:right;color:${resultColor}"><strong>${brl(data.result)}</strong></td></tr>
    </table>
    <p style="margin:18px 0 4px"><strong>Onde você mais gastou</strong></p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin-top:18px;color:#6B7280;font-size:13px">O relatório completo está anexo em PDF e Excel.${
      webUrl ? ` <a href="${webUrl}/relatorios">Abrir no painel</a>.` : ""
    }</p>
    <p style="color:#9CA3AF;font-size:12px">Você recebe este e-mail porque ativou os relatórios por e-mail. Para parar, desative em Relatórios no painel.</p>
  </div>`;
}

type Recipient = { id: string; name: string; email: string; workspaceId: string };

/** Builds and sends the report for one period to one person. Throws if sending fails. */
export async function sendReportTo(user: Recipient, period: { from: Date; to: Date; label: string }) {
  const [data, workspace] = await Promise.all([
    getReportData(user.workspaceId, period.from, period.to),
    prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } }),
  ]);
  const [pdf, xlsx] = await Promise.all([buildPdf(data, workspace.name), buildXlsx(data, workspace.name)]);

  await sendReportEmail(user.email, {
    subject: `Seu relatório ${period.label} — ${data.label}`,
    html: buildReportEmailHtml(user.name, workspace.name, data, process.env.WEB_URL),
    attachments: [
      { filename: reportFilename(data, "pdf"), content: pdf },
      { filename: reportFilename(data, "xlsx"), content: xlsx },
    ],
  });
}

/** Daily job: sends every opted-in person the latest closed period they haven't received yet. */
export async function runReportEmails(today = todayInBrazil()) {
  if (!isEmailConfigured()) return 0;

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", reportEmailFrequency: { not: "NONE" } },
    select: { id: true, name: true, email: true, workspaceId: true, reportEmailFrequency: true, reportEmailLastKey: true },
  });

  let sent = 0;
  for (const user of users) {
    const period = lastClosedPeriod(user.reportEmailFrequency as Frequency, today);
    if (user.reportEmailLastKey === period.key) continue;
    try {
      await sendReportTo(user, period);
      // Only after a successful send, so a failure is retried on the next run.
      await prisma.user.update({ where: { id: user.id }, data: { reportEmailLastKey: period.key } });
      sent++;
    } catch (err) {
      console.error(`Report e-mail failed for user ${user.id}:`, err);
    }
  }
  return sent;
}
