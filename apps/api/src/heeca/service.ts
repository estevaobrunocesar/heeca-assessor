import { randomUUID } from "node:crypto";
import { prisma } from "../db/client";
import { hashPassword } from "../auth/service";
import { seedDefaultCategories } from "../financial/seedCategories";
import { recordAudit } from "../audit/audit";
import { HeecaError, type SsoClaims } from "./signature";

/**
 * Integration with the Heeca portal (contract: heeca_site/docs/ENTITLEMENT.md). The portal owns the
 * account, the plan and the billing. Here a workspace is the tenant, and we only:
 *  - create it when the portal asks (provision);
 *  - mirror plan, status and access on it (entitlement), which the access gate reads;
 *  - turn a portal sign-in token into a local session (SSO).
 */
export const portalUrl = () => (process.env.HEECA_PORTAL_URL ?? "https://heeca.com.br").replace(/\/+$/, "");

export type Entitlement = {
  subscriptionId: string;
  accountId: string;
  product: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
  access: "ok" | "warning" | "blocked";
  plan: { code: string; name: string; features?: string[]; limits?: Record<string, unknown> };
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  account: { name: string; tradeName: string | null; document: string | null; email: string; phone: string | null };
  owner?: { name: string; email: string };
  segment?: string | null;
};

const STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"];
const ACCESS = ["ok", "warning", "blocked"];

/** Fallback when the portal sends a plan without explicit limits: pessoal = 1 person, familia = up to 5. */
const DEFAULT_MAX_USERS: Record<string, number> = { pessoal: 1, familia: 5 };

/** The user cap of a plan: an explicit limit from the portal wins, then the plan's default; null = unlimited. */
export function maxUsersFor(plan: Entitlement["plan"]): number | null {
  const limits = plan.limits ?? {};
  for (const key of ["maxUsers", "users", "maxMembers", "seats"]) {
    const value = limits[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  }
  return DEFAULT_MAX_USERS[plan.code] ?? null;
}

/** Rejects a payload that is not shaped like an entitlement, before anything is written. */
export function validateEntitlement(body: unknown): Entitlement {
  const e = body as Partial<Entitlement> | null;
  const bad = (what: string) => new HeecaError(`Payload inválido: ${what}.`, 400);
  if (!e || typeof e !== "object") throw bad("corpo ausente");
  if (typeof e.subscriptionId !== "string" || !e.subscriptionId) throw bad("subscriptionId");
  if (typeof e.accountId !== "string" || !e.accountId) throw bad("accountId");
  if (!e.status || !STATUSES.includes(e.status)) throw bad("status");
  if (!e.access || !ACCESS.includes(e.access)) throw bad("access");
  if (!e.plan || typeof e.plan.code !== "string" || !e.plan.code) throw bad("plan.code");
  if (!e.account || typeof e.account.name !== "string") throw bad("account.name");
  return e as Entitlement;
}

const mirror = (e: Entitlement) => ({
  heecaAccountId: e.accountId,
  heecaPlan: e.plan.code,
  heecaStatus: e.status,
  heecaBlocked: e.access === "blocked",
  heecaWarning: e.access === "warning",
  heecaMaxUsers: maxUsersFor(e.plan),
  heecaTrialEndsAt: e.trialEndsAt ? new Date(e.trialEndsAt) : null,
  heecaPeriodEnd: e.currentPeriodEnd ? new Date(e.currentPeriodEnd) : null,
  heecaSyncedAt: new Date(),
});

const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "assist";

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    if (!(await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  return `${root}-${randomUUID().slice(0, 6)}`;
}

/** Drops cached access decisions for a workspace right away (the gate caches for a few seconds). */
export const accessCache = new Map<string, { at: number; blocked: boolean; warning: boolean }>();

/**
 * Creates the workspace and its owner for a subscription. Idempotent by subscriptionId: a second call returns
 * the same workspace and just re-applies the entitlement. The owner is created with a random password
 * (they sign in through the portal; "esqueci a senha" lets them set one).
 */
export async function provision(e: Entitlement): Promise<{ id: string; slug: string }> {
  const existing = await prisma.workspace.findUnique({ where: { heecaSubscriptionId: e.subscriptionId }, select: { id: true, slug: true } });
  if (existing) {
    await applyEntitlement(e);
    return { id: existing.id, slug: existing.slug ?? "" };
  }
  if (!e.owner?.email) throw new HeecaError("owner obrigatório no provision.", 400);
  const email = e.owner.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HeecaError(`O e-mail ${email} já é usuário do Heeca Assist em outro ambiente.`, 409);
  }

  const name = e.account.tradeName || e.account.name;
  const slug = await uniqueSlug(name);
  const passwordHash = await hashPassword(randomUUID());
  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      heecaSubscriptionId: e.subscriptionId,
      ...mirror(e),
      users: { create: { name: e.owner.name, email, passwordHash, role: "ADMIN", whatsappPhone: null } },
    },
  });
  await seedDefaultCategories(workspace.id);
  await recordAudit({ workspaceId: workspace.id, action: "HEECA_PROVISION", detail: e.plan.code });
  return { id: workspace.id, slug };
}

/** Mirrors plan, status and access from the portal. It never charges or schedules anything. */
export async function applyEntitlement(e: Entitlement): Promise<void> {
  const workspace = await prisma.workspace.findUnique({ where: { heecaSubscriptionId: e.subscriptionId }, select: { id: true } });
  if (!workspace) throw new HeecaError("Ambiente não provisionado para esta assinatura.", 404);
  await prisma.workspace.update({ where: { id: workspace.id }, data: mirror(e) });
  accessCache.delete(workspace.id);
  await recordAudit({ workspaceId: workspace.id, action: "HEECA_ENTITLEMENT", detail: `${e.status}/${e.access}/${e.plan.code}` });
}

/**
 * Turns the portal token's claims into the local user: finds the workspace by subscription (or tenant id),
 * then the user by e-mail, creating them when new (portal OWNER/ADMIN become admins, everyone else a basic
 * user, within the plan's user limit). An e-mail that belongs to another workspace is refused.
 */
export async function resolveSsoUser(claims: SsoClaims): Promise<{ userId: string; workspaceId: string; role: "ADMIN" | "USER" }> {
  const workspace = claims.subscriptionId
    ? await prisma.workspace.findUnique({ where: { heecaSubscriptionId: claims.subscriptionId } })
    : claims.tenantId
      ? await prisma.workspace.findUnique({ where: { id: claims.tenantId } })
      : null;
  if (!workspace) throw new HeecaError("Ambiente não encontrado para esta assinatura.", 404);

  let user = await prisma.user.findUnique({ where: { email: claims.email } });
  if (user && user.workspaceId !== workspace.id) throw new HeecaError("Este e-mail já é usuário de outro ambiente do Heeca Assist.", 409);
  if (user && user.status !== "ACTIVE") throw new HeecaError("Este usuário está inativo.", 403);

  if (!user) {
    if (workspace.heecaMaxUsers !== null && (await prisma.user.count({ where: { workspaceId: workspace.id } })) >= workspace.heecaMaxUsers) {
      throw new HeecaError(`O plano atual permite até ${workspace.heecaMaxUsers} usuário(s). Fale com o responsável pela conta.`, 403);
    }
    const role = claims.role === "OWNER" || claims.role === "ADMIN" ? "ADMIN" : "USER";
    user = await prisma.user.create({
      data: { workspaceId: workspace.id, name: claims.name, email: claims.email, passwordHash: await hashPassword(randomUUID()), role },
    });
  }
  return { userId: user.id, workspaceId: workspace.id, role: user.role };
}

const CACHE_MS = 15_000;

/** Whether a workspace's access is blocked or on warning. Cached for a few seconds so the gate costs no query per request. */
export async function accessOf(workspaceId: string, now = Date.now()): Promise<{ blocked: boolean; warning: boolean }> {
  const hit = accessCache.get(workspaceId);
  if (hit && now - hit.at < CACHE_MS) return hit;
  const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { heecaBlocked: true, heecaWarning: true } });
  const value = { at: now, blocked: w?.heecaBlocked ?? false, warning: w?.heecaWarning ?? false };
  accessCache.set(workspaceId, value);
  return value;
}
