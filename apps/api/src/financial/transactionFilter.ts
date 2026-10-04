import { endOfDay } from "date-fns";
import type { Prisma, TransactionType } from "@prisma/client";
import { parseDay } from "./bills";

export type TransactionQuery = {
  from?: string;
  to?: string;
  categoryId?: string;
  userId?: string;
  type?: string;
  accountId?: string;
  minAmount?: string;
  maxAmount?: string;
  q?: string;
};

const TYPES = new Set(["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"]);

/** "1.234,56" or "1234.56" -> number; undefined when empty or not a number. */
function money(raw: string | undefined): number | undefined {
  const text = (raw ?? "").trim().replace(/[R$\s]/g, "");
  if (!text) return undefined;
  const n = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * The one place a list of entries is filtered, used by the Lançamentos screen and the CSV export so
 * both always agree. Always scoped to the workspace and to confirmed entries. An account filter
 * matches money leaving or arriving (transfers); amounts compare the entry's value.
 */
export function buildTransactionWhere(workspaceId: string, query: TransactionQuery): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [];
  const where: Prisma.TransactionWhereInput = { workspaceId, status: "CONFIRMED", AND: and };

  const from = query.from ? parseDay(query.from) : null;
  const to = query.to ? parseDay(query.to) : null;
  if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: endOfDay(to) } : {}) };

  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.userId) where.userId = query.userId;
  if (query.type && TYPES.has(query.type)) where.type = query.type as TransactionType;
  if (query.accountId) and.push({ OR: [{ accountId: query.accountId }, { toAccountId: query.accountId }] });

  const min = money(query.minAmount);
  const max = money(query.maxAmount);
  if (min !== undefined || max !== undefined) where.amount = { ...(min !== undefined ? { gte: min } : {}), ...(max !== undefined ? { lte: max } : {}) };

  const text = query.q?.trim();
  if (text) and.push({ OR: [{ description: { contains: text, mode: "insensitive" } }, { merchant: { contains: text, mode: "insensitive" } }] });

  return where;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell (";" separated, pt-BR Excel): quoted when needed, and neutralized if it could run as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvAmount = (n: number) => n.toFixed(2).replace(".", ",");
