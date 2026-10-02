import { randomBytes } from "node:crypto";

type StoredFile = { buffer: Buffer; contentType: string; filename: string; expiresAt: number };

// WhatsApp attachments are delivered by Twilio fetching a public URL, so a
// generated file has to be reachable without a login. It lives only in
// memory, behind an unguessable 192-bit token, and expires quickly — long
// enough for Twilio to fetch it, short enough that a leaked link is useless.
const files = new Map<string, StoredFile>();
const TTL_MS = 15 * 60 * 1000;

function sweep(now: number) {
  for (const [token, file] of files) {
    if (file.expiresAt <= now) files.delete(token);
  }
}

export function putTemporaryFile(buffer: Buffer, contentType: string, filename: string): string {
  const now = Date.now();
  sweep(now);
  const token = randomBytes(24).toString("hex");
  files.set(token, { buffer, contentType, filename, expiresAt: now + TTL_MS });
  return token;
}

export function getTemporaryFile(token: string): StoredFile | undefined {
  const file = files.get(token);
  if (!file) return undefined;
  if (file.expiresAt <= Date.now()) {
    files.delete(token);
    return undefined;
  }
  return file;
}

export const PDF_TYPE = "application/pdf";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
