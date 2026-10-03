import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/client";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

// The "password was right, now the code" token is signed with a DIFFERENT key
// from sessions, so it can never be presented as a session — that would be a
// login without the second factor.
const MFA_CHALLENGE_SECRET = JWT_SECRET + ":mfa-challenge";

export type AuthTokenPayload = {
  sub: string;
  role: "ADMIN" | "USER";
  workspaceId: string;
};

export type LoginResult =
  | { kind: "ok"; token: string; user: { id: string; name: string; role: "ADMIN" | "USER" } }
  | { kind: "mfa"; mfaToken: string };

export function issueSessionToken(user: { id: string; role: "ADMIN" | "USER"; workspaceId: string }) {
  return jwt.sign(
    { sub: user.id, role: user.role, workspaceId: user.workspaceId } satisfies AuthTokenPayload,
    JWT_SECRET!,
    { expiresIn: "7d" },
  );
}

export function issueMfaChallenge(userId: string) {
  return jwt.sign({ sub: userId, purpose: "mfa" }, MFA_CHALLENGE_SECRET, { expiresIn: "5m" });
}

/** The user a still-valid MFA challenge belongs to, or null. */
export function verifyMfaChallenge(token: string): string | null {
  try {
    const payload = jwt.verify(token, MFA_CHALLENGE_SECRET) as { sub?: string; purpose?: string };
    return payload.purpose === "mfa" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<LoginResult | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.passwordHash || user.status !== "ACTIVE") return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  // A correct password is only the first factor when MFA is on.
  if (user.mfaEnabled) return { kind: "mfa", mfaToken: issueMfaChallenge(user.id) };

  return { kind: "ok", token: issueSessionToken(user), user: { id: user.id, name: user.name, role: user.role } };
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as Partial<AuthTokenPayload> & { purpose?: string };
    // Every route scopes its queries by workspaceId, so a token missing it (or
    // meant for something else) must never count as a session.
    if (!payload.sub || !payload.workspaceId || !payload.role || payload.purpose) return null;
    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
