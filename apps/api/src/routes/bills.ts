import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { billState, cancelBill, createBill, listPendingBills, parseDay, payBill } from "../financial/bills";

export const billsRouter = Router();

function present(bill: {
  id: string;
  description: string;
  amount: unknown;
  dueDate: Date;
  status: string;
  repeatMonthly: boolean;
  paidAt: Date | null;
  category?: { name: string } | null;
  account?: { name: string; bank: string | null } | null;
}) {
  return {
    id: bill.id,
    description: bill.description,
    amount: Number(bill.amount),
    dueDate: bill.dueDate,
    status: bill.status,
    state: bill.status === "PENDING" ? billState(bill.dueDate) : null,
    repeatMonthly: bill.repeatMonthly,
    paidAt: bill.paidAt,
    category: bill.category?.name ?? null,
    account: bill.account ? (bill.account.bank ?? bill.account.name) : null,
  };
}

// Pending bills (oldest due first, so overdue ones lead) plus the most
// recently paid ones, for the "recently paid" section of the screen.
billsRouter.get("/", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const [pending, paid] = await Promise.all([
    listPendingBills(workspaceId),
    prisma.bill.findMany({
      where: { workspaceId, status: "PAID" },
      include: { category: true, account: true },
      orderBy: { paidAt: "desc" },
      take: 10,
    }),
  ]);
  res.json({ pending: pending.map(present), paid: paid.map(present) });
});

billsRouter.post("/", requireAdmin, async (req, res) => {
  const { description, amount, dueDate, categoryId, accountId, repeatMonthly } = req.body as {
    description?: string;
    amount?: number;
    dueDate?: string;
    categoryId?: string;
    accountId?: string;
    repeatMonthly?: boolean;
  };
  const due = dueDate ? parseDay(dueDate) : null;
  if (!description?.trim() || typeof amount !== "number" || !(amount > 0) || !due) {
    return res.status(400).json({ error: "description, amount (> 0) and dueDate (YYYY-MM-DD) are required" });
  }

  const workspaceId = req.auth!.workspaceId;
  // Only accept category/account ids that belong to this workspace.
  const [category, account] = await Promise.all([
    categoryId ? prisma.category.findFirst({ where: { id: categoryId, workspaceId } }) : null,
    accountId ? prisma.account.findFirst({ where: { id: accountId, workspaceId } }) : null,
  ]);

  const bill = await createBill({
    workspaceId,
    userId: req.auth!.sub,
    description: description.trim(),
    amount,
    dueDate: due,
    categoryId: category?.id,
    accountId: account?.id,
    repeatMonthly: !!repeatMonthly,
  });
  res.status(201).json(present(bill));
});

billsRouter.post("/:id/pay", requireAdmin, async (req, res) => {
  const { amount } = req.body as { amount?: number };
  const result = await payBill({
    billId: req.params.id,
    workspaceId: req.auth!.workspaceId,
    userId: req.auth!.sub,
    origin: "DASHBOARD",
    amount: typeof amount === "number" && amount > 0 ? amount : undefined,
  });
  if (!result) return res.status(404).json({ error: "Bill not found or already paid" });
  res.json({ paid: true, transactionId: result.transactionId, nextDueDate: result.nextDueDate });
});

billsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const ok = await cancelBill(req.params.id, req.auth!.workspaceId);
  if (!ok) return res.status(404).json({ error: "Bill not found or not pending" });
  res.json({ canceled: true });
});
