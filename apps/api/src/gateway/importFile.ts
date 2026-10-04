import { format } from "date-fns";
import type { StatementLine } from "../ai/schema";
import { readDocumentText, type DocumentKind } from "../imports/document";
import { parseStatement, resolveImportAccount, stageImport, type StagedImport } from "../imports/statement";
import { parseOfx } from "../imports/ofx";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const dm = (iso: string) => format(new Date(iso), "dd/MM");

export type ReadDocumentResult =
  | { kind: "empty" }
  | { kind: "single"; line: StatementLine; accountMention: string | null }
  | { kind: "staged"; staged: StagedImport };

/** Reads a document and decides whether it holds one entry (register it) or several (stage for confirmation). */
export async function readAndStageDocument(
  buffer: Buffer,
  kind: DocumentKind,
  caption: string,
  user: { workspaceId: string },
): Promise<ReadDocumentResult> {
  const text = await readDocumentText(buffer, kind);
  // An OFX file is already structured: read it directly, no AI involved.
  const parsed = kind === "ofx" ? parseOfx(text) : await parseStatement(text, caption, user.workspaceId);

  const usable = parsed.lines.filter((l) => l.tipo !== "IGNORAR");
  if (usable.length === 0) return { kind: "empty" };
  if (usable.length === 1 && parsed.documentType !== "EXTRATO_CONTA" && parsed.documentType !== "FATURA_CARTAO") {
    return { kind: "single", line: usable[0], accountMention: parsed.accountMention };
  }

  const account = await resolveImportAccount(parsed, caption, user.workspaceId);
  const staged = await stageImport(parsed, account, user.workspaceId);
  return staged.items.length === 0 ? { kind: "empty" } : { kind: "staged", staged };
}

const DOCUMENT_LABEL: Record<string, string> = {
  EXTRATO_CONTA: "o extrato",
  FATURA_CARTAO: "a fatura do cartão",
};

/** The message that asks the user to confirm an import, with the numbers they need to judge it. */
export function summarizeStaged(staged: StagedImport): string {
  const fresh = staged.items.filter((i) => !i.duplicate);
  const duplicates = staged.items.length - fresh.length;
  const total = (type: string) => fresh.filter((i) => i.type === type).reduce((sum, i) => sum + i.amount, 0);
  const count = (type: string) => fresh.filter((i) => i.type === type).length;

  const dates = staged.items.map((i) => i.date).sort();
  const lines = [
    `📄 Li ${DOCUMENT_LABEL[staged.documentType] ?? "o arquivo"}: ${staged.items.length} lançamentos (${dm(dates[0])} a ${dm(dates[dates.length - 1])})`,
  ];

  if (fresh.length === 0) {
    lines.push("Todos já estão registrados, então não há nada a importar. 👍");
    return lines.join("\n");
  }

  const parts = [`Despesas: ${brl(total("EXPENSE"))} (${count("EXPENSE")})`, `Receitas: ${brl(total("INCOME"))} (${count("INCOME")})`];
  if (count("ADJUSTMENT") > 0) parts.push(`Pagamentos de fatura: ${brl(total("ADJUSTMENT"))} (${count("ADJUSTMENT")})`);
  lines.push(parts.join(" · "));

  lines.push(`Conta: ${staged.accountName ?? "nenhuma conta cadastrada"}`);
  if (duplicates > 0) lines.push(`Já registrados (serão ignorados): ${duplicates}`);
  const uncategorized = fresh.filter((i) => i.type !== "ADJUSTMENT" && !i.categoryId).length;
  if (uncategorized > 0) lines.push(`Sem categoria: ${uncategorized} (dá para ajustar depois em Lançamentos)`);
  if (staged.skippedLines > 0) lines.push(`Linhas ignoradas (sem data válida): ${staged.skippedLines}`);
  if (staged.truncated) lines.push("⚠️ O arquivo era grande: li só os primeiros lançamentos. Mande o restante em outro arquivo.");

  lines.push("", "Exemplos:");
  for (const item of fresh.slice(0, 5)) {
    lines.push(`• ${dm(item.date)} ${item.description} — ${brl(item.amount)}${item.categoryLabel ? ` · ${item.categoryLabel}` : ""}`);
  }
  lines.push("", `Responda SIM para importar ${fresh.length} lançamentos ou NÃO para cancelar.`);
  return lines.join("\n");
}
