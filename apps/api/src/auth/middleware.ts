import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthTokenPayload } from "./service";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.auth = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
