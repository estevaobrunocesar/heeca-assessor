import { prisma } from "../db/client";

/**
 * Normalizes a WhatsApp "from" address (e.g. "whatsapp:+5511999998888")
 * down to the bare E.164 phone number used as the user identity key.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/, "").trim();
}

export async function findUserByPhone(rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  return prisma.user.findUnique({ where: { whatsappPhone: phone } });
}
