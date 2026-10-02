import { prisma } from "../db/client";

export async function getAccountBalance(accountId: string) {
  const transactions = await prisma.transaction.findMany({
    where: { accountId, status: "CONFIRMED" },
    select: { type: true, amount: true },
  });

  return transactions.reduce((balance, t) => {
    const amount = Number(t.amount);
    if (t.type === "INCOME") return balance + amount;
    if (t.type === "EXPENSE") return balance - amount;
    if (t.type === "ADJUSTMENT") return balance + amount;
    return balance; // TRANSFER: not yet tracked per-account (see briefing section 16)
  }, 0);
}

export async function getDefaultAccount(workspaceId: string) {
  return prisma.account.findFirst({ where: { workspaceId, isDefault: true } });
}

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents so "Itaú" matches "itau"
}

// Keywords that pin a mention to a specific account type, so "cartão
// Nubank" doesn't accidentally match a checking account that happens to
// share the same bank — which account name/bank matching alone can't tell
// apart when someone has more than one account at the same bank.
const TYPE_KEYWORDS: [RegExp, string][] = [
  [/cart(a|ã)o/, "CREDIT_CARD"],
  [/corrente/, "CHECKING"],
  [/poupan(c|ç)a/, "SAVINGS"],
  [/dinheiro|especie/, "CASH"],
  [/investiment/, "INVESTMENT"],
  [/digital/, "DIGITAL"],
];

/**
 * Matches a free-text account mention against this workspace's registered
 * accounts by name/bank/type, accent- and case-insensitive. Scored rather
 * than first-match: a name/bank hit is the base signal, and a type keyword
 * in the mention ("cartão", "conta corrente") boosts accounts of that type
 * and penalizes accounts of a conflicting type — otherwise "cartão Nubank"
 * could resolve to a checking account just because it's at the same bank
 * and happened to be matched first. Ambiguous or unmatched mentions are the
 * caller's responsibility (e.g. ask instead of guessing).
 */
export async function findAccountByMention(mention: string, workspaceId: string) {
  const accounts = await prisma.account.findMany({ where: { workspaceId } });
  const needle = normalize(mention);

  const mentionedTypes = TYPE_KEYWORDS.filter(([re]) => re.test(needle)).map(([, type]) => type);

  let best: { account: (typeof accounts)[number]; score: number } | null = null;

  for (const a of accounts) {
    const name = normalize(a.name);
    const bank = a.bank ? normalize(a.bank) : null;
    const nameMatch = needle.includes(name) || name.includes(needle);
    const bankMatch = bank !== null && (needle.includes(bank) || bank.includes(needle));
    if (!nameMatch && !bankMatch) continue;

    let score = nameMatch ? 3 : 1;
    if (mentionedTypes.length > 0) {
      score += mentionedTypes.includes(a.type) ? 5 : -5;
    }

    if (!best || score > best.score) best = { account: a, score };
  }

  return best && best.score > 0 ? best.account : undefined;
}

export async function setDefaultAccount(accountId: string, workspaceId: string) {
  await prisma.$transaction([
    prisma.account.updateMany({ where: { workspaceId, isDefault: true }, data: { isDefault: false } }),
    prisma.account.update({ where: { id: accountId }, data: { isDefault: true } }),
  ]);
}
