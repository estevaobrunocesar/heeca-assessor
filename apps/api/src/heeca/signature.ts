import { createHmac, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

// Pure module (no database), so the checks that guard the portal integration can be tested alone.
// Contract: heeca_site/docs/ENTITLEMENT.md in the platform repository.
const MAX_SKEW_MS = 5 * 60 * 1000;
const MIN_SECRET_LENGTH = 16;
export const PRODUCT_SLUG = "assist";
const SSO_ISSUER = "heeca-portal";

export class HeecaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const secretFromEnv = () => process.env.HEECA_PLATFORM_SECRET ?? "";
export const platformEnabled = (secret = secretFromEnv()) => secret.length >= MIN_SECRET_LENGTH;

/** HMAC-SHA256 of `${timestamp}.${rawBody}`, as the portal signs its server-to-server calls. */
export function signBody(rawBody: string, secret: string, timestamp: number | string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Verifies a call from the portal: signature over the exact raw body, timestamp within 5 minutes,
 * constant-time comparison. Throws HeecaError(401) on any failure.
 */
export function verifySignature(rawBody: string, headers: { get(name: string): string | null | undefined }, secret = secretFromEnv(), now = Date.now()): void {
  if (!platformEnabled(secret)) throw new HeecaError("Integração com o portal não configurada.", 503);
  const timestamp = headers.get("x-heeca-timestamp") ?? "";
  const signature = headers.get("x-heeca-signature") ?? "";
  if (!/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > MAX_SKEW_MS) throw new HeecaError("Assinatura expirada.", 401);

  const expected = Buffer.from(signBody(rawBody, secret, timestamp), "hex");
  const given = /^[0-9a-f]+$/i.test(signature) ? Buffer.from(signature, "hex") : Buffer.alloc(0);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HeecaError("Assinatura inválida.", 401);
}

export type SsoClaims = { email: string; name: string; tenantId: string | null; subscriptionId: string; role: string; jti: string | null };

/**
 * Validates the 60-second token the portal issues (HS256 with the shared secret, issuer "heeca-portal",
 * audience "assist"). The algorithm is pinned, so an "alg: none" or RS256 token is refused.
 */
export function verifySsoToken(token: string, secret = secretFromEnv()): SsoClaims {
  if (!platformEnabled(secret)) throw new HeecaError("Login pela conta Heeca não está ativado neste ambiente.", 503);
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer: SSO_ISSUER, audience: PRODUCT_SLUG, clockTolerance: 30 }) as jwt.JwtPayload;
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw new HeecaError(expired ? "O link de acesso expirou. Volte ao portal Heeca e abra o sistema de novo." : "Link de acesso inválido. Entre pela sua conta Heeca.", 401);
  }
  if (typeof payload.sub !== "string" || !payload.sub.includes("@")) throw new HeecaError("Link de acesso inválido.", 401);
  return {
    email: payload.sub.trim().toLowerCase(),
    name: String(payload.name ?? payload.sub),
    tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
    subscriptionId: typeof payload.subscriptionId === "string" ? payload.subscriptionId : "",
    role: String(payload.role ?? "MEMBER"),
    jti: typeof payload.jti === "string" ? payload.jti : null,
  };
}

// A token is single-use: it lives 60 s, so remembering the ids for a few minutes is enough.
const usedTokens = new Map<string, number>();
const REMEMBER_MS = 5 * 60 * 1000;

/** True the first time a token id is seen, false on a replay. Tokens without an id cannot be tracked and pass. */
export function claimTokenOnce(jti: string | null, now = Date.now()): boolean {
  for (const [id, at] of usedTokens) if (now - at > REMEMBER_MS) usedTokens.delete(id);
  if (!jti) return true;
  if (usedTokens.has(jti)) return false;
  usedTokens.set(jti, now);
  return true;
}
