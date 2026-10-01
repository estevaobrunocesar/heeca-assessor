import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { getAccountBalance, setDefaultAccount } from "../financial/accounts";
import type { AccountType } from "@prisma/client";

export const accountsRouter = Router();

accountsRouter.get("/", async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: { createdAt: "asc" } });
  const withBalance = await Promise.all(
    accounts.map(async (a) => ({ ...a, balance: await getAccountBalance(a.id) })),
  );
  res.json(withBalance);
});

accountsRouter.post("/", requireAdmin, async (req, res) => {
  const { name, bank, type, isDefault } = req.body as {
    name?: string;
    bank?: string;
    type?: AccountType;
    isDefault?: boolean;
  };
  if (!name) return res.status(400).json({ error: "name is required" });

  const account = await prisma.account.create({
    data: { name, bank, type: type ?? "CHECKING" },
  });

  if (isDefault) await setDefaultAccount(account.id);

  res.status(201).json(account);
});

accountsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name, bank, type, isDefault } = req.body as {
    name?: string;
    bank?: string;
    type?: AccountType;
    isDefault?: boolean;
  };

  if (isDefault) await setDefaultAccount(req.params.id);

  const account = await prisma.account.update({
    where: { id: req.params.id },
    data: { name, bank, type },
  });

  res.json(account);
});

accountsRouter.post("/:id/adjust", requireAdmin, async (req, res) => {
  const { amount, note } = req.body as { amount?: number; note?: string };
  if (typeof amount !== "number" || amount === 0) {
    return res.status(400).json({ error: "amount (non-zero) is required" });
  }

  const account = await prisma.account.findUniqueOrThrow({ where: { id: req.params.id } });

  const transaction = await prisma.transaction.create({
    data: {
      userId: req.auth!.sub,
      type: "ADJUSTMENT",
      amount,
      description: note || "Ajuste manual de saldo",
      date: new Date(),
      accountId: account.id,
      origin: "DASHBOARD",
    },
  });

  res.status(201).json(transaction);
});
