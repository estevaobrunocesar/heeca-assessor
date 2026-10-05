import { PDFParse } from "pdf-parse";
import { extractStatementFromImages } from "../ai/engine";
import type { ParsedDocument } from "./statement";
import { MAX_ITEMS } from "./statement";
import { FriendlyError } from "./document";

const MAX_PAGES = 10;
const PAGES_PER_CALL = 3;
const RENDER_SCALE = 1.6;

/** Draws the first pages of a PDF as PNG data URLs. */
async function renderPages(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getScreenshot({ scale: RENDER_SCALE, first: MAX_PAGES });
    return result.pages.map((page) => page.dataUrl);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Reads a statement whose text layer is missing or unreadable by looking at the pages as images.
 * Slower and costlier than the text route, so it is only the fallback.
 */
export async function parseStatementFromPdfImages(buffer: Buffer, caption: string, workspaceId: string): Promise<ParsedDocument> {
  let pages: string[];
  try {
    pages = await renderPages(buffer);
  } catch (err) {
    console.error("Could not render the PDF pages:", err);
    throw new FriendlyError("Não consegui abrir esse PDF. Exporte o extrato em OFX, CSV ou Excel, ou mande uma foto das páginas.");
  }
  if (pages.length === 0) throw new FriendlyError("Esse PDF não tem páginas legíveis.");

  const lines: ParsedDocument["lines"] = [];
  let documentType = "OUTRO";
  let accountMention: string | null = null;
  const today = new Date();

  for (let i = 0; i < pages.length; i += PAGES_PER_CALL) {
    const result = await extractStatementFromImages(pages.slice(i, i + PAGES_PER_CALL), caption, workspaceId, today);
    if (i === 0 || documentType === "OUTRO") documentType = result.tipo_documento;
    accountMention ??= result.conta;
    lines.push(...result.lancamentos);
  }

  return { documentType, accountMention, lines: lines.slice(0, MAX_ITEMS), truncated: lines.length > MAX_ITEMS };
}
