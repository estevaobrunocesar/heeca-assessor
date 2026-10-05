import { randomUUID } from "node:crypto";
import { addDays, format, subYears } from "date-fns";
import { prisma } from "../db/client";
import { extractStatementChunk } from "../ai/engine";
import type { StatementLine } from "../ai/schema";
import { chunkText } from "./document";
import { findAccountByMention, getDefaultAccount } from "../financial/accounts";
import { parseDay } from "../financial/bills";
import { todayInBrazil } from "../financial/invoices";
import { matchKeywordRule, normalizeText } from "../financial/keywords";
import { repeatKey, sameKey } from "../financial/repeats";

const MAX_CHUNKS = 10;
export const MAX_ITEMS = 500;

export type StagedItem = {
  date: string; // YYYY-MM-DD
  description: string;
  merchant: string | null;
  amount: number;
  type: "EXPENSE" | "INCOME" | "ADJUSTMENT";
  categoryId: string | null;
  categoryLabel: string | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  /** Already in the ledger (same day, amount and merchant) — skipped on import. */
  duplicate: boolean;
};

export type StagedImport = {
  documentType: string;
  accountId: string | null;
  accountName: string | null;
  items: StagedItem[];
  skippedLines: number;
  truncated: boolean;
};

export type ParsedDocument = {
  documentType: string;
  accountMention: string | null;
  lines: StatementLine[];
  truncated: boolean;
};

/**
 * The model tends to copy one line's "3/10" onto its neighbours, so an installment only
 * counts if that marker is printed in the source on the same line as the entry.
 */
export function installmentIsInSource(line: StatementLine, chunk: string): boolean {
  if (!line.parcela_atual || !line.parcela_total) return true;
  const no = line.parcela_atual;
  const total = line.parcela_total;
  const marker = new RegExp(`(?<!\d)0*${no}\s*(?:/|de)\s*0*${total}(?!\d)|parc\w*\.?\s*0*${no}(?!\d)`, "i");
  const words = normalizeText([line.estabelecimento, line.descricao].filter(Boolean).join(" "))
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 2);
  if (words.length === 0) return false;
  return chunk
    .split("\n")
    .some((row) => marker.test(row) && words.every((w) => normalizeText(row).includes(w)));
}

/**
 * Every number written in the text, in cents, under each plausible reading ("1.234,56", "1,234.56", "23.5",
 * "1.200"), so a value is found whichever convention the bank used.
 */
export function amountsInText(text: string): Set<number> {
  const found = new Set<number>();
  const add = (n: number) => {
    if (Number.isFinite(n)) found.add(Math.round(n * 100));
  };
  const read = (token: string) => {
    const hasDot = token.includes(".");
    const hasComma = token.includes(",");
    if (hasDot && hasComma) {
      const decimalIsComma = token.lastIndexOf(",") > token.lastIndexOf(".");
      add(Number(decimalIsComma ? token.replace(/\./g, "").replace(",", ".") : token.replace(/,/g, "")));
    } else if (hasComma) {
      add(Number(token.replace(",", "."))); // decimal comma
      if (/^\d{1,3}(,\d{3})+$/.test(token)) add(Number(token.replace(/,/g, ""))); // or thousands
    } else if (hasDot) {
      add(Number(token)); // decimal point
      if (/^\d{1,3}(\.\d{3})+$/.test(token)) add(Number(token.replace(/\./g, ""))); // or thousands
    } else {
      add(Number(token));
    }
  };
  for (const token of text.match(/\d[\d.,]*\d|\d/g) ?? []) {
    read(token);
    // In a CSV the comma also separates columns: "Parcela 2/5,199.90" must still yield 199.90 on its own.
    if (token.includes(",")) for (const piece of token.split(",")) if (piece) read(piece);
  }
  return found;
}

/** A line is only trusted if its amount is actually written in the source: the model must not invent values. */
export function amountIsInSource(valor: number, known: Set<number>): boolean {
  return known.has(Math.round(Math.abs(valor) * 100));
}

/** Reads the whole document, one chunk at a time, into a flat list of entries. */
export async function parseStatement(text: string, caption: string, workspaceId: string): Promise<ParsedDocument> {
  const chunks = chunkText(text);
  const header = text.slice(0, 500);
  const today = new Date();

  const lines: StatementLine[] = [];
  let documentType = "OUTRO";
  let accountMention: string | null = null;

  for (const [index, chunk] of chunks.slice(0, MAX_CHUNKS).entries()) {
    const result = await extractStatementChunk(chunk, header, caption, workspaceId, today);
    if (index === 0 || documentType === "OUTRO") documentType = result.tipo_documento;
    accountMention ??= result.conta;
    const known = amountsInText(chunk);
    for (const line of result.lancamentos) {
      // A value that is not in the text was made up by the model: better to lose a line than to invent money.
      if (!amountIsInSource(line.valor, known)) {
        console.warn(`Dropped an imported line whose amount (${line.valor}) is not in the source text.`);
        continue;
      }
      if (line.parcela_total && !installmentIsInSource(line, chunk)) {
        line.parcela_atual = null;
        line.parcela_total = null;
      }
      lines.push(line);
    }
  }

  return {
    documentType,
    accountMention,
    lines: lines.slice(0, MAX_ITEMS),
    truncated: chunks.length > MAX_CHUNKS || lines.length > MAX_ITEMS,
  };
}

/** The account the entries belong to: named in the caption, else in the document, else the default. */
export async function resolveImportAccount(parsed: ParsedDocument, caption: string, workspaceId: string) {
  const isCardStatement = parsed.documentType === "FATURA_CARTAO";

  if (caption) {
    const fromCaption = await findAccountByMention(caption, workspaceId);
    if (fromCaption) return fromCaption;
  }
  if (parsed.accountMention) {
    // "Nubank" on a card bill means the card, not the checking account at the same bank.
    const mention = isCardStatement ? `${parsed.accountMention} cartão` : parsed.accountMention;
    const fromDocument = await findAccountByMention(mention, workspaceId);
    if (fromDocument) return fromDocument;
  }
  return (await getDefaultAccount(workspaceId)) ?? null;
}

/**
 * Turns the model's lines into entries ready to insert: validated dates,
 * categories (the user's keyword rules first, then the model's choice, but
 * never inventing a category), and each one marked if it is already in the
 * ledger so importing the same file twice adds nothing.
 */
export async function stageImport(
  parsed: ParsedDocument,
  account: { id: string; name: string; bank: string | null; type: string } | null,
  workspaceId: string,
): Promise<StagedImport> {
  const today = todayInBrazil();
  const earliest = subYears(today, 3);
  const isCard = account?.type === "CREDIT_CARD";

  const categories = await prisma.category.findMany({ where: { workspaceId }, include: { parent: true } });
  const lookup = (cat: string | null, sub: string | null, type: "EXPENSE" | "INCOME") => {
    const pool = categories.filter((c) => c.type === type);
    const eq = (a: string, b: string) => normalizeText(a) === normalizeText(b);
    if (cat && sub) {
      const exact = pool.find((c) => c.parent && eq(c.name, sub) && eq(c.parent.name, cat));
      if (exact) return exact;
    }
    if (sub) {
      const anywhere = pool.find((c) => c.parent && eq(c.name, sub));
      if (anywhere) return anywhere;
    }
    if (cat) return pool.find((c) => !c.parent && eq(c.name, cat)) ?? null;
    return null;
  };

  const items: StagedItem[] = [];
  let skippedLines = 0;

  for (const line of parsed.lines) {
    const date = parseDay(line.data);
    const amount = Math.round(Math.abs(line.valor) * 100) / 100;
    if (line.tipo === "IGNORAR" || !date || amount <= 0 || date > addDays(today, 1) || date < earliest) {
      skippedLines++;
      continue;
    }

    // Paying a card's invoice gives limit back (a positive adjustment); the same
    // line on a checking-account statement is money leaving the account.
    const type: StagedItem["type"] =
      line.tipo === "RECEITA" ? "INCOME" : line.tipo === "PAGAMENTO_FATURA" && isCard ? "ADJUSTMENT" : "EXPENSE";

    let categoryId: string | null = null;
    let label: string | null = null;
    if (type !== "ADJUSTMENT") {
      const words = [line.descricao, line.estabelecimento].filter(Boolean).join(" ");
      const rule = await matchKeywordRule(words, workspaceId, type);
      const category = rule?.category ?? lookup(line.categoria, line.subcategoria, type);
      if (category) {
        categoryId = category.id;
        const parentName = "parent" in category && category.parent ? category.parent.name : null;
        label = parentName ? `${parentName} > ${category.name}` : category.name;
      }
    }

    const installment = line.parcela_total && line.parcela_total > 1 && line.parcela_atual ? line : null;
    items.push({
      date: format(date, "yyyy-MM-dd"),
      description: line.descricao.trim() || "Lançamento importado",
      merchant: line.estabelecimento,
      amount,
      type,
      categoryId,
      categoryLabel: label,
      installmentNo: installment ? installment.parcela_atual : null,
      installmentTotal: installment ? installment.parcela_total : null,
      duplicate: false,
    });
  }

  await markDuplicates(items, workspaceId);

  return {
    documentType: parsed.documentType,
    accountId: account?.id ?? null,
    accountName: account ? (account.bank ? `${account.bank} · ${account.name}` : account.name) : null,
    items,
    skippedLines,
    truncated: parsed.truncated,
  };
}

export async function markDuplicates(items: StagedItem[], workspaceId: string) {
  if (items.length === 0) return;
  const dates = items.map((i) => i.date).sort();
  const existing = await prisma.transaction.findMany({
    where: {
      workspaceId,
      status: "CONFIRMED",
      date: { gte: new Date(dates[0]), lte: new Date(dates[dates.length - 1]) },
    },
    select: { id: true, date: true, amount: true, type: true, description: true, merchant: true },
  });

  // Each existing row can account for one imported line, so two identical
  // lines against one existing entry still leaves one of them new.
  const used = new Set<string>();
  for (const item of items) {
    const key = repeatKey(item.merchant, item.description);
    const match = existing.find(
      (e) =>
        !used.has(e.id) &&
        e.type === item.type &&
        format(e.date, "yyyy-MM-dd") === item.date &&
        Math.abs(Number(e.amount) - item.amount) < 0.005 &&
        (sameKey(repeatKey(e.merchant, e.description), key) || normalizeText(e.description) === normalizeText(item.description)),
    );
    if (match) {
      used.add(match.id);
      item.duplicate = true;
    }
  }
}

/** Inserts the new entries as one batch (so the import can be undone as a whole). */
export async function commitImport(
  staged: Pick<StagedImport, "accountId" | "items">,
  user: { id: string; workspaceId: string },
  origin: "WHATSAPP_FILE" | "DASHBOARD" = "WHATSAPP_FILE",
) {
  const fresh = staged.items.filter((i) => !i.duplicate);
  const batchId = randomUUID();

  for (let i = 0; i < fresh.length; i += 200) {
    await prisma.transaction.createMany({
      data: fresh.slice(i, i + 200).map((item) => ({
        workspaceId: user.workspaceId,
        userId: user.id,
        type: item.type,
        amount: item.amount,
        description: item.installmentNo
          ? `${item.description} (parcela ${item.installmentNo}/${item.installmentTotal})`
          : item.description,
        date: new Date(item.date),
        categoryId: item.categoryId,
        accountId: staged.accountId,
        merchant: item.merchant,
        isInstallment: item.installmentNo !== null,
        installmentNo: item.installmentNo,
        installmentTotal: item.installmentTotal,
        origin,
        originalMessage: "Importado de arquivo",
        importBatchId: batchId,
      })),
    });
  }

  return { batchId, imported: fresh.length, skipped: staged.items.length - fresh.length };
}

/** Soft-deletes everything the latest (or given) import created. */
export async function undoImport(batchId: string, workspaceId: string) {
  const result = await prisma.transaction.updateMany({
    where: { workspaceId, importBatchId: batchId, status: "CONFIRMED" },
    data: { status: "DELETED" },
  });
  return result.count;
}

export async function latestImportBatch(workspaceId: string) {
  const last = await prisma.transaction.findFirst({
    where: { workspaceId, importBatchId: { not: null }, status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
    select: { importBatchId: true },
  });
  if (!last?.importBatchId) return null;
  const count = await prisma.transaction.count({
    where: { workspaceId, importBatchId: last.importBatchId, status: "CONFIRMED" },
  });
  return { batchId: last.importBatchId, count };
}
