import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/client";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export type AuthTokenPayload = {
  sub: string;
  role: "ADMIN" | "USER";
  workspaceId: string;
};

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.passwordHash || user.status !== "ACTIVE") return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  const token = jwt.sign(
    { sub: user.id, role: user.role, workspaceId: user.workspaceId } satisfies AuthTokenPayload,
    JWT_SECRET!,
    { expiresIn: "7d" },
  );

  return { token, user: { id: user.id, name: user.name, role: user.role } };
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
