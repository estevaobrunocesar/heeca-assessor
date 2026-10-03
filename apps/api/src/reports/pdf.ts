import PDFDocument from "pdfkit";
import { format } from "date-fns";
import type { ReportData } from "./data";

const MARGIN = 40;
const INK = "#111827";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const RED = "#DC2626";
const GREEN = "#16A34A";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

type Column = { label: string; width: number; align?: "left" | "right" };

/** Trims text with a trailing "…" until it fits the width in the document's current font. */
function fit(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.widthOfString(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Builds the PDF with PDFKit's built-in Helvetica (Latin-1: covers pt-BR accents and "R$"). */
export function buildPdf(data: ReportData, workspaceName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: "Relatório financeiro", Author: "Heeca Assessor" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - MARGIN * 2;
    const bottom = () => doc.page.height - MARGIN - 20;

    // Header
    doc.rect(0, 0, doc.page.width, 6).fill(RED);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text("Relatório financeiro", MARGIN, 28);
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    doc.text(`${workspaceName}  ·  Período: ${data.label}  ·  Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, MARGIN, 54);

    // Summary boxes
    const boxY = 78;
    const boxW = (pageWidth - 20) / 3;
    const boxes: [string, number, string][] = [
      ["Receitas", data.income, GREEN],
      ["Despesas", data.expense, RED],
      ["Resultado", data.result, data.result >= 0 ? GREEN : RED],
    ];
    boxes.forEach(([label, value, color], i) => {
      const x = MARGIN + i * (boxW + 10);
      doc.roundedRect(x, boxY, boxW, 52, 6).lineWidth(1).strokeColor(LINE).stroke();
      doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(label, x + 12, boxY + 10, { width: boxW - 24 });
      doc.fillColor(color).font("Helvetica-Bold").fontSize(15).text(brl(value), x + 12, boxY + 26, { width: boxW - 24 });
    });
    doc.y = boxY + 70;

    const ensure = (height: number) => {
      if (doc.y + height > bottom()) doc.addPage();
    };

    const drawHeader = (columns: Column[]) => {
      const y = doc.y;
      doc.rect(MARGIN, y, pageWidth, 18).fill("#F3F4F6");
      let x = MARGIN;
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8);
      for (const col of columns) {
        doc.text(col.label.toUpperCase(), x + 6, y + 5, { width: col.width - 12, align: col.align ?? "left", lineBreak: false });
        x += col.width;
      }
      doc.y = y + 20;
    };

    const drawRow = (columns: Column[], cells: string[], opts: { bold?: boolean; color?: string[] } = {}) => {
      const y = doc.y;
      let x = MARGIN;
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      columns.forEach((col, i) => {
        // PDFKit's own ellipsis option still wraps onto extra lines that
        // overlap the next row, so long text is measured and cut by hand.
        doc.fillColor(opts.color?.[i] ?? INK).text(fit(doc, cells[i] ?? "", col.width - 12), x + 6, y + 3, {
          width: col.width - 12,
          align: col.align ?? "left",
          lineBreak: false,
        });
        x += col.width;
      });
      doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + pageWidth, y + 16).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.y = y + 17;
    };

    const section = (title: string) => {
      ensure(60);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(title, MARGIN, doc.y);
      doc.y += 6;
    };

    // Expenses by category
    if (data.expenseByCategory.length > 0) {
      section("Despesas por categoria");
      const cols: Column[] = [
        { label: "Categoria", width: pageWidth - 200 },
        { label: "Valor", width: 120, align: "right" },
        { label: "%", width: 80, align: "right" },
      ];
      drawHeader(cols);
      for (const c of data.expenseByCategory) {
        if (doc.y + 18 > bottom()) {
          doc.addPage();
          drawHeader(cols);
        }
        drawRow(cols, [c.name, brl(c.total), `${c.percent.toFixed(1)}%`], { bold: true });
        for (const s of c.subs) {
          if (doc.y + 18 > bottom()) {
            doc.addPage();
            drawHeader(cols);
          }
          drawRow(cols, [`    ${s.name}`, brl(s.total), ""], { color: [MUTED, MUTED, MUTED] });
        }
      }
      doc.y += 14;
    }

    // Income by category
    if (data.incomeByCategory.length > 0) {
      section("Receitas por categoria");
      const cols: Column[] = [
        { label: "Categoria", width: pageWidth - 120 },
        { label: "Valor", width: 120, align: "right" },
      ];
      drawHeader(cols);
      for (const c of data.incomeByCategory) {
        if (doc.y + 18 > bottom()) {
          doc.addPage();
          drawHeader(cols);
        }
        drawRow(cols, [c.name, brl(c.total)]);
      }
      doc.y += 14;
    }

    // Spending by person
    if (data.expenseByPerson.length > 0) {
      section("Despesas por pessoa");
      const cols: Column[] = [
        { label: "Pessoa", width: pageWidth - 120 },
        { label: "Valor", width: 120, align: "right" },
      ];
      drawHeader(cols);
      for (const p of data.expenseByPerson) {
        if (doc.y + 18 > bottom()) {
          doc.addPage();
          drawHeader(cols);
        }
        drawRow(cols, [p.name, brl(p.total)]);
      }
      doc.y += 14;
    }

    // Transactions
    section(`Lançamentos (${data.transactions.length})`);
    if (data.transactions.length === 0) {
      doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("Nenhum lançamento neste período.", MARGIN, doc.y);
    } else {
      const cols: Column[] = [
        { label: "Data", width: 56 },
        { label: "Descrição", width: pageWidth - 56 - 120 - 90 - 90 },
        { label: "Categoria", width: 120 },
        { label: "Conta", width: 90 },
        { label: "Valor", width: 90, align: "right" },
      ];
      drawHeader(cols);
      for (const t of data.transactions) {
        if (doc.y + 18 > bottom()) {
          doc.addPage();
          drawHeader(cols);
        }
        const sign = t.type === "INCOME" ? "+ " : "- ";
        drawRow(
          cols,
          [format(t.date, "dd/MM/yy"), t.description, t.subcategory ?? t.category ?? "—", t.account ?? "—", `${sign}${brl(t.amount)}`],
          { color: [INK, INK, MUTED, MUTED, t.type === "INCOME" ? GREEN : RED] },
        );
      }
    }

    // Page numbers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Text below the bottom margin makes PDFKit append a new page; the
      // footer is deliberately there, so lift the margin while writing it.
      doc.page.margins.bottom = 0;
      doc.fillColor(MUTED).font("Helvetica").fontSize(8);
      doc.text(`Página ${i + 1} de ${range.count}`, MARGIN, doc.page.height - 30, {
        width: pageWidth,
        align: "right",
        lineBreak: false,
      });
    }

    doc.end();
  });
}
