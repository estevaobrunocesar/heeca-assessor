import { startOfMonth, endOfMonth } from "date-fns";
import { prisma } from "../db/client";
import { interpretQuery } from "../ai/engine";
import { parseDay } from "../financial/bills";
import { todayInBrazil } from "../financial/invoices";
import { getReportData, reportFilename } from "../reports/data";
import { buildPdf } from "../reports/pdf";
import { buildXlsx } from "../reports/xlsx";
import { PDF_TYPE, XLSX_TYPE, putTemporaryFile } from "../reports/store";

const REPORT_RE = /\b(relat[óo]rio|planilha|excel|xlsx|pdf)\b/i;
const PAID_RE = /\b(paguei|pagamos|quitei)\b/i;
const EXCEL_RE = /\b(excel|xlsx|planilha)\b/i;
const PDF_RE = /\bpdf\b/i;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export function isReportRequest(text: string): boolean {
  return REPORT_RE.test(text) && !PAID_RE.test(text);
}

/**
 * Generates the requested report and returns the reply text plus the public
 * URLs Twilio should attach. Asking only for "excel" or only for "pdf" gets
 * that file; "relatório" alone gets both.
 */
export async function buildReportReply(
  text: string,
  user: { workspaceId: string },
  publicBaseUrl: string,
): Promise<{ message: string; media: string[] }> {
  const today = todayInBrazil();

  // The query interpreter already knows how to turn "de setembro", "do mês
  // passado", "últimos 30 dias" into real dates; its eh_consulta verdict is
  // irrelevant here, only the period matters.
  const q = await interpretQuery(text, user.workspaceId, new Date());
  const from = parseDay(q.data_inicio) ?? startOfMonth(today);
  const to = parseDay(q.data_fim) ?? endOfMonth(today);
  const [start, end] = from <= to ? [from, to] : [to, from];
  // The model sometimes folds the format word into the label ("pdf de outubro").
  q.descricao_periodo = q.descricao_periodo.replace(/^(?:o\s+)?(?:pdf|excel|xlsx|planilha)\s+(?:de\s+|do\s+|da\s+)?/i, "").trim() || q.descricao_periodo;

  const [data, workspace] = await Promise.all([
    getReportData(user.workspaceId, start, end, q.descricao_periodo),
    prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } }),
  ]);

  if (data.transactions.length === 0) {
    return { message: `Não encontrei nenhum lançamento em ${q.descricao_periodo}, então não gerei relatório.`, media: [] };
  }

  const wantsExcel = EXCEL_RE.test(text);
  const wantsPdf = PDF_RE.test(text);
  const makePdf = wantsPdf || !wantsExcel;
  const makeXlsx = wantsExcel || !wantsPdf;

  const media: string[] = [];
  if (makePdf) {
    const name = reportFilename(data, "pdf");
    media.push(`${publicBaseUrl}/reports/${putTemporaryFile(await buildPdf(data, workspace.name), PDF_TYPE, name)}/${name}`);
  }
  if (makeXlsx) {
    const name = reportFilename(data, "xlsx");
    media.push(`${publicBaseUrl}/reports/${putTemporaryFile(await buildXlsx(data, workspace.name), XLSX_TYPE, name)}/${name}`);
  }

  const message = [
    `📎 Relatório — ${q.descricao_periodo}`,
    `Receitas: ${brl(data.income)}`,
    `Despesas: ${brl(data.expense)}`,
    `Resultado: ${brl(data.result)}`,
    `${data.transactions.length} lançamento(s)`,
  ].join("\n");

  return { message, media };
}
