import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import {
  checkTotp,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSetup,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "./mfa";
import { issueSessionToken, verifyMfaChallenge } from "./service";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export type SecondFactorResult =
  | { ok: true; recoveryCodesLeft: number | null }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; retryAfterMinutes: number };

/**
 * Checks the second factor — an authenticator code or a recovery code — with
 * the protections that make a 6-digit secret hold up: five misses lock the
 * account for 15 minutes, a code that was already used is refused, and a
 * recovery code works exactly once.
 */
export async function checkSecondFactor(userId: string, rawCode: string): Promise<SecondFactorResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaEnabled || !user.mfaSecretEnc) return { ok: false, reason: "invalid" };

  if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) {
    return { ok: false, reason: "locked", retryAfterMinutes: Math.ceil((user.mfaLockedUntil.getTime() - Date.now()) / 60000) };
  }

  const code = rawCode.trim();

  const step = checkTotp(decryptSecret(user.mfaSecretEnc), code, user.mfaLastStep);
  if (step !== null) {
    // Conditional update: two requests racing with the same code can't both win.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
      data: { mfaLastStep: step, mfaFailedAttempts: 0, mfaLockedUntil: null },
    });
    if (claimed.count === 1) return { ok: true, recoveryCodesLeft: null };
  } else if (normalizeRecoveryCode(code).length === 10) {
    const hash = hashRecoveryCode(code);
    if (user.mfaRecoveryHashes.includes(hash)) {
      const remaining = user.mfaRecoveryHashes.filter((h) => h !== hash);
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaRecoveryHashes: remaining, mfaFailedAttempts: 0, mfaLockedUntil: null },
      });
      return { ok: true, recoveryCodesLeft: remaining.length };
    }
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data: { mfaFailedAttempts: { increment: 1 } } });
  if (updated.mfaFailedAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaFailedAttempts: 0, mfaLockedUntil: new Date(Date.now() + LOCK_MS) },
    });
  }
  return { ok: false, reason: "invalid" };
}

/** Second step of a login: the challenge from the password step plus the code. */
export async function completeMfaLogin(mfaToken: string, code: string) {
  const userId = verifyMfaChallenge(mfaToken);
  if (!userId) return { ok: false as const, reason: "expired" as const };

  const result = await checkSecondFactor(userId, code);
  if (!result.ok) return result;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") return { ok: false as const, reason: "invalid" as const };

  return {
    ok: true as const,
    token: issueSessionToken(user),
    user: { id: user.id, name: user.name, role: user.role },
    recoveryCodesLeft: result.recoveryCodesLeft,
  };
}

export async function mfaStatus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { enabled: user.mfaEnabled, recoveryCodesLeft: user.mfaEnabled ? user.mfaRecoveryHashes.length : 0 };
}

/** Starts enrollment: a fresh secret, saved but inactive until a code from the app confirms it. */
export async function beginMfaSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabled) return null;

  const setup = await generateSetup(user.email);
  await prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: encryptSecret(setup.secret) } });
  return setup;
}

/** Confirms enrollment with a code from the app and hands out the recovery codes — the only time they are shown. */
export async function enableMfa(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabled || !user.mfaSecretEnc) return null;

  const step = checkTotp(decryptSecret(user.mfaSecretEnc), code.trim(), null);
  if (step === null) return null;

  const { codes, hashes } = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaLastStep: step, mfaRecoveryHashes: hashes, mfaFailedAttempts: 0, mfaLockedUntil: null },
  });
  return codes;
}

const WIPE: Prisma.UserUpdateInput = {
  mfaEnabled: false,
  mfaSecretEnc: null,
  mfaLastStep: null,
  mfaRecoveryHashes: [],
  mfaFailedAttempts: 0,
  mfaLockedUntil: null,
};

/** Turning MFA off takes the password AND a current code: a stolen session alone can't weaken the account. */
export async function disableMfa(userId: string, password: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabled) return { ok: true as const };
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return { ok: false as const, reason: "password" as const };

  const result = await checkSecondFactor(userId, code);
  if (!result.ok) return result;

  await prisma.user.update({ where: { id: userId }, data: WIPE });
  return { ok: true as const };
}

/** Admin / CLI escape hatch for a lost device with no recovery codes left. */
export async function resetMfa(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: WIPE });
}
