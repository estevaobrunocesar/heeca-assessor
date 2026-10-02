import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { getAccountBalance, setDefaultAccount } from "../financial/accounts";
import type { AccountType } from "@prisma/client";

export const accountsRouter = Router();

// Day-of-month for a card's closing/due date; anything else is ignored.
function validDay(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31 ? value : undefined;
}

accountsRouter.get("/", async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { workspaceId: req.auth!.workspaceId },
    orderBy: { createdAt: "asc" },
  });
  const withBalance = await Promise.all(
    accounts.map(async (a) => {
      const balance = await getAccountBalance(a.id);
      const creditLimit = a.creditLimit !== null ? Number(a.creditLimit) : null;
      // For a credit card, "balance" (adjustments minus expenses, no income)
      // is exactly how much the limit has moved from its starting point —
      // adding it to the card's limit gives what the bank app calls
      // "disponível": the limit minus whatever's currently owed.
      const availableLimit = a.type === "CREDIT_CARD" && creditLimit !== null ? creditLimit + balance : null;
      return { ...a, creditLimit, balance, availableLimit };
    }),
  );
  res.json(withBalance);
});

accountsRouter.post("/", requireAdmin, async (req, res) => {
  const { name, bank, type, isDefault, creditLimit, closingDay, dueDay } = req.body as {
    name?: string;
    bank?: string;
    type?: AccountType;
    isDefault?: boolean;
    creditLimit?: number;
    closingDay?: number;
    dueDay?: number;
  };
  if (!name) return res.status(400).json({ error: "name is required" });

  const account = await prisma.account.create({
    data: {
      name,
      bank,
      type: type ?? "CHECKING",
      workspaceId: req.auth!.workspaceId,
      creditLimit: typeof creditLimit === "number" ? creditLimit : undefined,
      closingDay: validDay(closingDay),
      dueDay: validDay(dueDay),
    },
  });

  if (isDefault) await setDefaultAccount(account.id, req.auth!.workspaceId);

  res.status(201).json(account);
});

accountsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name, bank, type, isDefault, creditLimit, closingDay, dueDay } = req.body as {
    name?: string;
    bank?: string;
    type?: AccountType;
    isDefault?: boolean;
    creditLimit?: number;
    closingDay?: number;
    dueDay?: number;
  };

  if (isDefault) await setDefaultAccount(req.params.id, req.auth!.workspaceId);

  const result = await prisma.account.updateMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
    data: {
      name,
      bank,
      type,
      creditLimit: typeof creditLimit === "number" ? creditLimit : undefined,
      closingDay: validDay(closingDay),
      dueDay: validDay(dueDay),
    },
  });
  if (result.count === 0) return res.status(404).json({ error: "Account not found" });

  const account = await prisma.account.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json(account);
});

accountsRouter.post("/:id/adjust", requireAdmin, async (req, res) => {
  const { amount, note } = req.body as { amount?: number; note?: string };
  if (typeof amount !== "number" || amount === 0) {
    return res.status(400).json({ error: "amount (non-zero) is required" });
  }

  const found = await prisma.account.findFirst({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  if (!found) return res.status(404).json({ error: "Account not found" });

  const transaction = await prisma.transaction.create({
    data: {
      workspaceId: req.auth!.workspaceId,
      userId: req.auth!.sub,
      type: "ADJUSTMENT",
      amount,
      description: note || "Ajuste manual de saldo",
      date: new Date(),
      accountId: found.id,
      origin: "DASHBOARD",
    },
  });

  res.status(201).json(transaction);
});
