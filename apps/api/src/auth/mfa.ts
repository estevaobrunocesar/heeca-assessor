import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";

// ±1 step of 30s so a phone whose clock is slightly off still works; replays
// are blocked separately by remembering the last accepted step.
authenticator.options = { window: 1 };

const STEP_SECONDS = 30;
const ISSUER = "Heeca Assist";

// The TOTP secret is as good as the second factor itself, so it never sits in
// the database in the clear: AES-256-GCM with a key derived from the server's
// own secret (MFA_ENCRYPTION_KEY if set, else the JWT secret).
function encryptionKey(): Buffer {
  const material = process.env.MFA_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!material) throw new Error("MFA_ENCRYPTION_KEY or JWT_SECRET is required");
  return createHash("sha256").update(material).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const raw = Buffer.from(blob, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export async function generateSetup(accountLabel: string) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(accountLabel, ISSUER, secret);
  return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) };
}

/**
 * Checks a 6-digit code and returns the time step it belongs to, or null when
 * it is wrong or was already used (a code accepted once can't be replayed
 * within its validity window).
 */
export function checkTotp(secret: string, code: string, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = authenticator.checkDelta(code, secret);
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 1000 / STEP_SECONDS) + delta;
  return lastStep !== null && step <= lastStep ? null : step;
}

// No 0/O/1/I/L: recovery codes get read off a piece of paper.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryCode = (code: string) => createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");

export function generateRecoveryCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}
