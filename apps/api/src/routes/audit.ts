import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { parseDay } from "../financial/bills";
import { endOfDay } from "date-fns";

export const auditRouter = Router();

// The trail of this workspace: who did what and when. Admins only; never crosses workspaces.
auditRouter.get("/", requireAdmin, async (req, res) => {
  const { userId, from, to, page = "1" } = req.query as Record<string, string>;
  const take = 50;
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const fromDay = from ? parseDay(from) : null;
  const toDay = to ? parseDay(to) : null;
  const where = {
    workspaceId: req.auth!.workspaceId,
    ...(userId ? { userId } : {}),
    ...(fromDay || toDay ? { createdAt: { ...(fromDay ? { gte: fromDay } : {}), ...(toDay ? { lte: endOfDay(toDay) } : {}) } } : {}),
  };

  const [rows, total, users] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ where: { workspaceId: req.auth!.workspaceId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));

  res.json({
    total,
    page: Number(page) || 1,
    pageSize: take,
    items: rows.map((r) => ({
      id: r.id,
      at: r.createdAt,
      user: r.userId ? (names.get(r.userId) ?? "Usuário removido") : null,
      label: r.label,
      action: r.action,
      entityId: r.entityId,
      detail: r.detail,
      ip: r.ip,
      status: r.status,
    })),
  });
});
