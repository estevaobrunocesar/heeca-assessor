import { parseOfx } from "./ofx";
import { readDocumentText, UnreadableTextError, type DocumentKind } from "./document";
import { parseStatementFromPdfImages } from "./pdfImages";
import { parseStatement, type ParsedDocument } from "./statement";

/**
 * Turns an uploaded file into statement lines: OFX is read directly, the rest goes through the model.
 * A PDF whose text is missing or scrambled falls back to reading its pages as images.
 */
export async function parseDocument(buffer: Buffer, kind: DocumentKind, caption: string, workspaceId: string): Promise<ParsedDocument> {
  let text: string;
  try {
    text = await readDocumentText(buffer, kind);
  } catch (err) {
    if (err instanceof UnreadableTextError) return parseStatementFromPdfImages(buffer, caption, workspaceId);
    throw err;
  }
  return kind === "ofx" ? parseOfx(text) : parseStatement(text, caption, workspaceId);
}
