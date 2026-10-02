import type { TransactionType } from "@prisma/client";
import { prisma } from "../db/client";
import { findCategoryByNames } from "./categories";

/** Lowercase, accent-free, punctuation-free, single-spaced — the form keywords are stored and matched in. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Well-known establishments, applied when the workspace has no rule of its
// own. Deliberately conservative: only names that point to one category
// almost every time. Category names must match the workspace taxonomy; a
// rule whose category isn't found there is skipped rather than invented.
const DEFAULT_RULES: { keyword: string; categoria: string; subcategoria: string }[] = [
  { keyword: "uber", categoria: "Transporte", subcategoria: "Uber" },
  { keyword: "uber eats", categoria: "Alimentação", subcategoria: "Delivery" },
  { keyword: "ifood", categoria: "Alimentação", subcategoria: "Delivery" },
  { keyword: "rappi", categoria: "Alimentação", subcategoria: "Delivery" },
  { keyword: "mcdonalds", categoria: "Alimentação", subcategoria: "Fast food" },
  { keyword: "burger king", categoria: "Alimentação", subcategoria: "Fast food" },
  { keyword: "subway", categoria: "Alimentação", subcategoria: "Fast food" },
  { keyword: "starbucks", categoria: "Alimentação", subcategoria: "Café" },
  { keyword: "padaria", categoria: "Alimentação", subcategoria: "Padaria" },
  { keyword: "carrefour", categoria: "Alimentação", subcategoria: "Supermercado" },
  { keyword: "pao de acucar", categoria: "Alimentação", subcategoria: "Supermercado" },
  { keyword: "assai", categoria: "Alimentação", subcategoria: "Supermercado" },
  { keyword: "atacadao", categoria: "Alimentação", subcategoria: "Supermercado" },
  { keyword: "netflix", categoria: "Assinaturas", subcategoria: "Netflix" },
  { keyword: "disney", categoria: "Assinaturas", subcategoria: "Disney+" },
  { keyword: "amazon prime", categoria: "Assinaturas", subcategoria: "Amazon Prime" },
  { keyword: "prime video", categoria: "Assinaturas", subcategoria: "Amazon Prime" },
  { keyword: "spotify", categoria: "Assinaturas", subcategoria: "Spotify" },
  { keyword: "youtube premium", categoria: "Assinaturas", subcategoria: "YouTube Premium" },
  { keyword: "globoplay", categoria: "Assinaturas", subcategoria: "Globoplay" },
  { keyword: "hbo", categoria: "Assinaturas", subcategoria: "Max" },
  { keyword: "drogasil", categoria: "Saúde", subcategoria: "Farmácia" },
  { keyword: "droga raia", categoria: "Saúde", subcategoria: "Farmácia" },
  { keyword: "pague menos", categoria: "Saúde", subcategoria: "Farmácia" },
  { keyword: "farmacia", categoria: "Saúde", subcategoria: "Farmácia" },
  { keyword: "ipiranga", categoria: "Transporte", subcategoria: "Combustível" },
  { keyword: "gasolina", categoria: "Transporte", subcategoria: "Combustível" },
  { keyword: "etanol", categoria: "Transporte", subcategoria: "Combustível" },
  { keyword: "combustivel", categoria: "Transporte", subcategoria: "Combustível" },
  { keyword: "estacionamento", categoria: "Transporte", subcategoria: "Estacionamento" },
  { keyword: "sem parar", categoria: "Transporte", subcategoria: "Pedágio" },
  { keyword: "pedagio", categoria: "Transporte", subcategoria: "Pedágio" },
  { keyword: "mercado livre", categoria: "Compras", subcategoria: "Marketplace" },
  { keyword: "mercadolivre", categoria: "Compras", subcategoria: "Marketplace" },
  { keyword: "shopee", categoria: "Compras", subcategoria: "Marketplace" },
  { keyword: "aliexpress", categoria: "Compras", subcategoria: "Marketplace" },
];

export type KeywordMatch = {
  category: { id: string; name: string; type: TransactionType; parent: { name: string } | null };
  keyword: string;
  source: "MANUAL" | "LEARNED" | "DEFAULT";
};

/**
 * Finds the category a message's wording decides on, or null to leave it to
 * the AI. The most specific (longest) matching keyword wins — "mercado
 * livre" over "mercado" — and on a tie the workspace's own rule beats the
 * built-in one. Matching is whole-word on the normalized text.
 */
export async function matchKeywordRule(
  text: string,
  workspaceId: string,
  type?: TransactionType,
): Promise<KeywordMatch | null> {
  const haystack = ` ${normalizeText(text)} `;
  const contains = (keyword: string) => haystack.includes(` ${keyword} `);

  const ownRules = await prisma.categoryKeyword.findMany({
    where: { workspaceId },
    include: { category: { include: { parent: true } } },
  });

  const candidates: { keyword: string; own: (typeof ownRules)[number] | null; fallback: (typeof DEFAULT_RULES)[number] | null }[] = [
    ...ownRules.filter((r) => contains(r.keyword) && (!type || r.category.type === type)).map((r) => ({ keyword: r.keyword, own: r, fallback: null })),
    ...DEFAULT_RULES.filter((r) => contains(r.keyword)).map((r) => ({ keyword: r.keyword, own: null, fallback: r })),
  ];
  candidates.sort((a, b) => b.keyword.length - a.keyword.length || (a.own ? -1 : 0) - (b.own ? -1 : 0));

  for (const c of candidates) {
    if (c.own) {
      return { category: c.own.category, keyword: c.keyword, source: c.own.source };
    }
    const category = await findCategoryByNames(c.fallback!.categoria, c.fallback!.subcategoria, workspaceId, type);
    if (category) return { category, keyword: c.keyword, source: "DEFAULT" };
  }
  return null;
}

// Words that describe the act of spending rather than what was bought — a
// rule keyed on them would swallow every future message.
const TOO_GENERIC = new Set(["gasto", "gastei", "compra", "comprei", "despesa", "pagamento", "paguei", "conta", "valor", "reais", "real"]);

/** The normalized form a keyword would be stored in, or null if it is too short or too generic to be a safe rule. */
export function usableKeyword(raw: string): string | null {
  const keyword = normalizeText(raw);
  if (keyword.length < 3 || /^[0-9 ]+$/.test(keyword) || TOO_GENERIC.has(keyword)) return null;
  return keyword;
}

/** Creates or updates a rule; the user's latest decision for a keyword replaces the earlier one. */
export async function saveKeyword(workspaceId: string, raw: string, categoryId: string, source: "MANUAL" | "LEARNED") {
  const keyword = usableKeyword(raw);
  if (!keyword) return null;
  await prisma.categoryKeyword.upsert({
    where: { workspaceId_keyword: { workspaceId, keyword } },
    create: { workspaceId, keyword, categoryId, source },
    update: { categoryId, source },
  });
  return keyword;
}
