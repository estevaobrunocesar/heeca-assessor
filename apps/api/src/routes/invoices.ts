import { Router } from "express";
import { prisma } from "../db/client";
import { getCardInvoices } from "../financial/invoices";

export const invoicesRouter = Router();

// One entry per credit card in the workspace. Cards without closing/due
// days configured come back with `configured: false` and no invoices, so
// the UI can ask for those days instead of guessing a cycle.
invoicesRouter.get("/", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const cards = await prisma.account.findMany({
    where: { workspaceId, type: "CREDIT_CARD" },
    orderBy: { createdAt: "asc" },
  });

  const result = await Promise.all(
    cards.map(async (card) => {
      const base = {
        account: { id: card.id, name: card.name, bank: card.bank },
        closingDay: card.closingDay,
        dueDay: card.dueDay,
      };
      if (card.closingDay === null || card.dueDay === null) return { ...base, configured: false, invoices: [] };
      const invoices = await getCardInvoices({ id: card.id, closingDay: card.closingDay, dueDay: card.dueDay }, workspaceId);
      return { ...base, configured: true, invoices };
    }),
  );

  res.json(result);
});
