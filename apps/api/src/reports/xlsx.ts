import ExcelJS from "exceljs";
import { format } from "date-fns";
import type { ReportData } from "./data";

const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

export async function buildXlsx(data: ReportData, workspaceName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Heeca Assessor";
  wb.created = new Date();

  // Resumo
  const summary = wb.addWorksheet("Resumo");
  summary.columns = [{ width: 28 }, { width: 22 }];
  summary.addRow(["Relatório financeiro"]).font = { bold: true, size: 16 };
  summary.addRow([workspaceName]);
  summary.addRow(["Período", data.label]);
  summary.addRow(["Gerado em", format(new Date(), "dd/MM/yyyy HH:mm")]);
  summary.addRow([]);
  const header = summary.addRow(["Indicador", "Valor"]);
  styleHeader(header);
  for (const [label, value] of [
    ["Receitas", data.income],
    ["Despesas", data.expense],
    ["Resultado", data.result],
  ] as const) {
    const row = summary.addRow([label, value]);
    row.getCell(2).numFmt = BRL;
    if (label === "Resultado") row.font = { bold: true };
  }
  summary.addRow(["Lançamentos no período", data.transactions.length]);

  // Por categoria
  const cats = wb.addWorksheet("Por categoria");
  cats.columns = [
    { header: "Tipo", width: 12 },
    { header: "Nível", width: 14 },
    { header: "Categoria", width: 30 },
    { header: "Subcategoria", width: 30 },
    { header: "Valor", width: 16 },
    { header: "% das despesas", width: 16 },
  ];
  styleHeader(cats.getRow(1));
  cats.views = [{ state: "frozen", ySplit: 1 }];
  for (const c of data.expenseByCategory) {
    const row = cats.addRow(["Despesa", "Categoria", c.name, "", c.total, c.percent / 100]);
    row.font = { bold: true };
    row.getCell(5).numFmt = BRL;
    row.getCell(6).numFmt = "0.0%";
    for (const s of c.subs) {
      const sub = cats.addRow(["Despesa", "Subcategoria", c.name, s.name, s.total, data.expense > 0 ? s.total / data.expense : 0]);
      sub.getCell(5).numFmt = BRL;
      sub.getCell(6).numFmt = "0.0%";
    }
  }
  for (const c of data.incomeByCategory) {
    const row = cats.addRow(["Receita", "Categoria", c.name, "", c.total, ""]);
    row.getCell(5).numFmt = BRL;
  }

  // Lançamentos
  const tx = wb.addWorksheet("Lançamentos");
  tx.columns = [
    { header: "Data", width: 12 },
    { header: "Descrição", width: 42 },
    { header: "Categoria", width: 24 },
    { header: "Subcategoria", width: 24 },
    { header: "Conta", width: 20 },
    { header: "Tipo", width: 11 },
    { header: "Valor", width: 16 },
  ];
  styleHeader(tx.getRow(1));
  tx.views = [{ state: "frozen", ySplit: 1 }];
  for (const t of data.transactions) {
    const row = tx.addRow([
      t.date,
      t.description,
      t.category ?? "",
      t.subcategory ?? "",
      t.account ?? "",
      t.type === "INCOME" ? "Receita" : "Despesa",
      t.type === "INCOME" ? t.amount : -t.amount,
    ]);
    row.getCell(1).numFmt = "dd/mm/yyyy";
    row.getCell(7).numFmt = BRL;
  }
  if (data.transactions.length > 0) {
    tx.autoFilter = { from: "A1", to: `G${data.transactions.length + 1}` };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
