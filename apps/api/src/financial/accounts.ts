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

/**
 * Matches a free-text account mention against this workspace's registered
 * accounts by name/bank, accent- and case-insensitive. Checked both ways —
 * the mention is often a full phrase ("cartão do Itaú") that *contains* the
 * bank name, while a short mention ("Itaú") is instead contained *by* the
 * bank name — so neither direction alone catches both cases. Ambiguous or
 * unmatched mentions are the caller's responsibility (e.g. ask instead of
 * guessing).
 */
export async function findAccountByMention(mention: string, workspaceId: string) {
  const accounts = await prisma.account.findMany({ where: { workspaceId } });
  const needle = normalize(mention);

  return accounts.find((a) => {
    const name = normalize(a.name);
    const bank = a.bank ? normalize(a.bank) : null;
    return (
      needle.includes(name) ||
      name.includes(needle) ||
      (bank !== null && (needle.includes(bank) || bank.includes(needle)))
    );
  });
}

export async function setDefaultAccount(accountId: string, workspaceId: string) {
  await prisma.$transaction([
    prisma.account.updateMany({ where: { workspaceId, isDefault: true }, data: { isDefault: false } }),
    prisma.account.update({ where: { id: accountId }, data: { isDefault: true } }),
  ]);
}
