import ExcelJS from "exceljs";
import { PDFParse } from "pdf-parse";

/** An error whose message is safe to show the user as-is. */
export class FriendlyError extends Error {}

export type DocumentKind = "pdf" | "xlsx" | "csv" | "ofx";

const MAX_TEXT_CHARS = 200_000;
const MAX_SHEET_ROWS = 2_000;

/** What kind of file this is, from the media type and the file's own signature; null if unsupported. */
export function classifyDocument(mediaType: string, buffer: Buffer): DocumentKind | null {
  const type = mediaType.toLowerCase();
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" — an .xlsx is a zip
  if (type === "application/pdf") return "pdf";
  // OFX/QFX from the bank: known types, or any text-like file whose own header says it is one.
  if (/ofx|qfx/.test(type)) return "ofx";
  if (!isZip && !buffer.subarray(0, 2000).includes(0) && /OFXHEADER\s*:|<OFX[\s>]/i.test(buffer.subarray(0, 2000).toString("latin1"))) return "ofx";
  if (type.includes("spreadsheetml") || (isZip && type.includes("excel"))) return "xlsx";
  if (type === "text/csv" || type === "application/csv" || type === "text/plain") return "csv";
  // Some phones label a CSV as "excel"; a real legacy .xls is binary and can't be read.
  if (type === "application/vnd.ms-excel") return buffer.includes(0) ? null : "csv";
  return null;
}

async function pdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function xlsxText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const cell = (value: ExcelJS.CellValue): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object") {
      if ("result" in value && value.result !== undefined) return cell(value.result as ExcelJS.CellValue);
      if ("richText" in value) return value.richText.map((r) => r.text).join("");
      if ("text" in value) return String(value.text);
      return "";
    }
    return String(value);
  };

  const lines: string[] = [];
  for (const sheet of workbook.worksheets.slice(0, 3)) {
    let rows = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rows++ >= MAX_SHEET_ROWS) return;
      lines.push((row.values as ExcelJS.CellValue[]).slice(1).map(cell).join(" | "));
    });
  }
  return lines.join("\n");
}

function csvText(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  // Brazilian bank exports are often Latin-1; a replacement character means the guess was wrong.
  return utf8.includes("�") ? buffer.toString("latin1") : utf8;
}

/** The text of a PDF, spreadsheet or CSV, ready to be read by the model. */
export async function readDocumentText(buffer: Buffer, kind: DocumentKind): Promise<string> {
  let text: string;
  try {
    text = kind === "pdf" ? await pdfText(buffer) : kind === "xlsx" ? await xlsxText(buffer) : csvText(buffer); // csv and ofx are plain text
  } catch (err) {
    console.error("Could not read document:", err);
    throw new FriendlyError("Não consegui abrir esse arquivo. Ele pode estar protegido por senha ou corrompido.");
  }

  text = text.trim();
  if (text.length < 20) {
    throw new FriendlyError(
      kind === "pdf"
        ? "Esse PDF parece ser uma imagem (digitalizado), sem texto para eu ler. Manda uma foto dele, ou exporta o extrato em PDF com texto, CSV ou Excel."
        : "Não encontrei dados nesse arquivo.",
    );
  }
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

/** Splits text on line boundaries into pieces the model can read one at a time. */
export function chunkText(text: string, maxChars = 6_000): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > maxChars && current) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) chunks.push(current);
  return chunks;
}
