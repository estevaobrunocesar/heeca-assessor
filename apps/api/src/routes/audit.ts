import { Router } from "express";
import { prisma } from "../db/client";
import { requireAdmin } from "../auth/middleware";
import { parseDay } from "../financial/bills";
import { endOfDay, subDays } from "date-fns";
import { isFailure, reasonFor } from "../gateway/deliveries";

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

// How the WhatsApp messages the system sent on its own fared: counts for the last 7 days and the latest ones.
auditRouter.get("/deliveries", requireAdmin, async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const since = subDays(new Date(), 7);
  const [recent, grouped] = await Promise.all([
    prisma.whatsappDelivery.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.whatsappDelivery.groupBy({ by: ["status"], where: { workspaceId, createdAt: { gte: since } }, _count: true }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  res.json({
    last7Days: {
      total: grouped.reduce((s, g) => s + g._count, 0),
      delivered: (counts.delivered ?? 0) + (counts.read ?? 0),
      failed: grouped.filter((g) => isFailure(g.status)).reduce((s, g) => s + g._count, 0),
    },
    items: recent.map((d) => ({
      id: d.id,
      at: d.createdAt,
      status: d.status,
      phone: maskPhone(d.toPhone),
      failed: isFailure(d.status),
      reason: reasonFor(d.errorCode),
    })),
  });
});

/** "+5511999998888" -> "+55 11 *****-8888": enough to recognise the person, not to copy the number. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length < 8 ? "***" : `+${digits.slice(0, 2)} ${digits.slice(2, 4)} *****-${digits.slice(-4)}`;
}
