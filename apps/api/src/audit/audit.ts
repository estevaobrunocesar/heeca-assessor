import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/client";

/** What each state-changing route means, in Portuguese. Anything not listed is still recorded under its raw path. */
const LABELS: Record<string, string> = {
  "POST /api/users": "Criou um usuário",
  "PATCH /api/users/:id": "Alterou um usuário",
  "POST /api/users/:id/mfa/reset": "Resetou o MFA de um usuário",
  "POST /api/auth/mfa/setup": "Iniciou a ativação do MFA",
  "POST /api/auth/mfa/enable": "Ativou o MFA",
  "POST /api/auth/mfa/disable": "Desativou o MFA",
  "POST /api/auth/phone": "Vinculou o número de WhatsApp",
  "DELETE /api/transactions/:id": "Apagou um lançamento",
  "PATCH /api/transactions/:id": "Alterou um lançamento",
  "POST /api/accounts": "Criou uma conta",
  "PATCH /api/accounts/:id": "Alterou uma conta",
  "POST /api/accounts/:id/adjust": "Ajustou o saldo de uma conta",
  "POST /api/budgets": "Definiu um orçamento",
  "DELETE /api/budgets/:id": "Removeu um orçamento",
  "POST /api/categories": "Criou uma categoria",
  "PATCH /api/categories/:id": "Alterou uma categoria",
  "DELETE /api/categories/:id": "Apagou uma categoria",
  "POST /api/category-keywords": "Criou uma regra de palavra-chave",
  "DELETE /api/category-keywords/:id": "Apagou uma regra de palavra-chave",
  "POST /api/category-keywords/:id/apply": "Aplicou uma regra aos lançamentos antigos",
  "POST /api/imports/commit": "Importou uma fatura ou extrato",
  "POST /api/imports/undo": "Desfez uma importação",
  "DELETE /api/workspace": "Excluiu o ambiente inteiro",
  "GET /api/workspace/export": "Exportou todos os dados",
  "POST /api/bills": "Criou uma conta a pagar",
  "POST /api/bills/:id/pay": "Pagou uma conta a pagar",
  "DELETE /api/bills/:id": "Apagou uma conta a pagar",
  "POST /api/people": "Criou uma pessoa",
  "PATCH /api/people/:id": "Alterou uma pessoa",
  "DELETE /api/people/:id": "Apagou uma pessoa",
  "POST /api/recurring": "Criou uma recorrência",
  "PATCH /api/recurring/:id": "Alterou uma recorrência",
  "DELETE /api/recurring/:id": "Apagou uma recorrência",
  "POST /api/goals": "Criou uma meta",
  "PATCH /api/goals/:id": "Alterou uma meta",
  "DELETE /api/goals/:id": "Apagou uma meta",
  "POST /api/goals/:id/contributions": "Movimentou uma meta",
  "PUT /api/reports/email": "Alterou o relatório por e-mail",
  "PUT /api/reports/whatsapp-summary": "Alterou o resumo semanal",
  "PUT /api/reports/monthly-review": "Alterou o fechamento do mês",
  LOGIN: "Entrou no sistema",
  LOGIN_SSO: "Entrou pela conta Heeca",
  HEECA_PROVISION: "Ambiente criado pelo portal Heeca",
  HEECA_ENTITLEMENT: "Plano ou status atualizado pelo portal Heeca",
  LOGIN_FAILED: "Tentativa de login recusada",
  LOGIN_MFA: "Concluiu a verificação em duas etapas",
  LOGIN_MFA_FAILED: "Código de duas etapas recusado",
};

/** Routes that only read or are too chatty to be worth a row. */
const IGNORED = new Set(["POST /api/imports/preview"]);

export const auditLabel = (action: string) => LABELS[action] ?? action;

type Entry = { workspaceId?: string | null; userId?: string | null; action: string; entityId?: string | null; status?: number | null; detail?: string | null; ip?: string | null };

/** Writes one row. Never throws: losing an audit row must not break the action being audited. */
export async function recordAudit(entry: Entry): Promise<void> {
  try {
    // A sign-in knows the person but not the workspace: find it, so the right admin sees the event.
    if (!entry.workspaceId && entry.userId) {
      entry.workspaceId = (await prisma.user.findUnique({ where: { id: entry.userId }, select: { workspaceId: true } }))?.workspaceId ?? null;
    }
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        label: auditLabel(entry.action),
        entityId: entry.entityId ?? null,
        status: entry.status ?? null,
        detail: entry.detail?.slice(0, 200) ?? null,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    console.error("Could not write the audit log:", err);
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** "DELETE /api/transactions/<uuid>" -> { action: "DELETE /api/transactions/:id", id }. Query strings are dropped. */
export function describeRequest(method: string, originalUrl: string) {
  const path = originalUrl.split("?")[0].replace(/\/+$/, "");
  const ids = path.match(UUID);
  return { action: `${method} ${path.replace(UUID, ":id")}`, entityId: ids?.[0] ?? null };
}

/**
 * Records every successful change made through the API, plus the full data export, once the response
 * has been sent (so it adds no latency). It stores who, what route and which id, never the body.
 * Mount it before the routers: by the time the response finishes, authentication has filled req.auth.
 */
export function auditChanges(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const auth = req.auth;
    const { action, entityId } = describeRequest(req.method, req.originalUrl);
    const mutating = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
    const isExport = action === "GET /api/workspace/export";
    if (!auth || (!mutating && !isExport) || res.statusCode >= 400 || IGNORED.has(action)) return;
    void recordAudit({ workspaceId: auth.workspaceId, userId: auth.sub, action, entityId, status: res.statusCode, ip: req.ip });
  });
  next();
}
