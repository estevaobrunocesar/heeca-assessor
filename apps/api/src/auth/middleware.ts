import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthTokenPayload } from "./service";
import { accessOf, portalUrl } from "../heeca/service";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

/** The only call a blocked workspace may still make: the panel needs it to explain what happened. */
const ALLOWED_WHEN_BLOCKED = new Set(["GET /api/auth/me"]);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // The portal owns the subscription; when it marks access as blocked, nothing works but the explanation.
    const access = await accessOf(payload.workspaceId);
    if (access.blocked && !ALLOWED_WHEN_BLOCKED.has(`${req.method} ${req.originalUrl.split("?")[0]}`)) {
      return res.status(403).json({ error: "access_blocked", portalUrl: `${portalUrl()}/conta` });
    }
  } catch (err) {
    console.error("Could not check the workspace access:", err);
    return res.status(503).json({ error: "unavailable" });
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
