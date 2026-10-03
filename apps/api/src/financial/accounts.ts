import type { Account } from "@prisma/client";
import { prisma } from "../db/client";

export async function getAccountBalance(accountId: string) {
  // A transfer touches two accounts: it leaves `accountId` and arrives at `toAccountId`.
  const transactions = await prisma.transaction.findMany({
    where: { status: "CONFIRMED", OR: [{ accountId }, { toAccountId: accountId }] },
    select: { type: true, amount: true, accountId: true, toAccountId: true },
  });

  return transactions.reduce((balance, t) => {
    const amount = Number(t.amount);
    if (t.type === "TRANSFER") {
      if (t.toAccountId === accountId) return balance + amount;
      return t.accountId === accountId ? balance - amount : balance;
    }
    if (t.type === "INCOME") return balance + amount;
    if (t.type === "EXPENSE") return balance - amount;
    if (t.type === "ADJUSTMENT") return balance + amount;
    return balance;
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
  [/cofrinho/, "COFRINHO"],
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
async function rankAccounts(mention: string, workspaceId: string) {
  const accounts = await prisma.account.findMany({ where: { workspaceId } });
  const needle = normalize(mention);

  const mentionedTypes = TYPE_KEYWORDS.filter(([re]) => re.test(needle)).map(([, type]) => type);

  const ranked: { account: (typeof accounts)[number]; score: number }[] = [];
  for (const a of accounts) {
    const name = normalize(a.name);
    const bank = a.bank ? normalize(a.bank) : null;
    const nameMatch = needle.includes(name) || name.includes(needle);
    const bankMatch = bank !== null && (needle.includes(bank) || bank.includes(needle));
    if (!nameMatch && !bankMatch) continue;

    let score = nameMatch ? 3 : 1;
    // Specificity: the exact name beats a name merely contained in the sentence, which beats a
    // mention that is only part of the name ("poupança" vs "Poupança Nubank").
    if (nameMatch) {
      if (name === needle) score += 2;
      else if (needle.includes(name)) score += 1 + name.length / 100;
    }
    if (mentionedTypes.length > 0) {
      score += mentionedTypes.includes(a.type) ? 5 : -5;
    }
    if (score > 0) ranked.push({ account: a, score });
  }
  // Stable: accounts with the same score keep their registration order.
  return ranked.sort((x, y) => y.score - x.score);
}

export async function findAccountByMention(mention: string, workspaceId: string): Promise<Account | undefined> {
  return (await rankAccounts(mention, workspaceId))[0]?.account;
}

/**
 * Every account that matches the mention equally well. More than one means the mention is
 * ambiguous (two savings accounts and the person just said "poupança"): callers where a wrong
 * pick is costly, like a transfer, should ask instead of taking the first.
 */
export async function findAccountsTiedAtTop(mention: string, workspaceId: string): Promise<Account[]> {
  const ranked = await rankAccounts(mention, workspaceId);
  return ranked.length === 0 ? [] : ranked.filter((r) => r.score === ranked[0].score).map((r) => r.account);
}

export async function setDefaultAccount(accountId: string, workspaceId: string) {
  await prisma.$transaction([
    prisma.account.updateMany({ where: { workspaceId, isDefault: true }, data: { isDefault: false } }),
    prisma.account.update({ where: { id: accountId }, data: { isDefault: true } }),
  ]);
}
