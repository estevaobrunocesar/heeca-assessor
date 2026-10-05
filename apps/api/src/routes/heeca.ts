import { Router, type Request, type Response } from "express";
import { HeecaError, verifySignature } from "../heeca/signature";
import { applyEntitlement, provision, validateEntitlement } from "../heeca/service";

export const heecaRouter = Router();

/** The exact bytes the portal signed (captured by express.json's `verify` hook in index.ts). */
const rawBodyOf = (req: Request) => (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? "";

const headersOf = (req: Request) => ({ get: (name: string) => req.get(name) });

function fail(res: Response, err: unknown, what: string) {
  if (err instanceof HeecaError) return res.status(err.status).json({ error: err.message });
  console.error(`[heeca] ${what} failed:`, err);
  return res.status(500).json({ error: "erro interno" });
}

// Portal -> product: creates the workspace of a subscription (idempotent by subscriptionId).
heecaRouter.post("/provision", async (req, res) => {
  try {
    verifySignature(rawBodyOf(req), headersOf(req));
    const workspace = await provision(validateEntitlement(req.body));
    const appUrl = (process.env.WEB_URL ?? "").replace(/\/+$/, "");
    res.json({ tenantId: workspace.id, slug: workspace.slug, appUrl });
  } catch (err) {
    fail(res, err, "provision");
  }
});

// Portal -> product: any change of plan or status.
heecaRouter.post("/entitlement", async (req, res) => {
  try {
    verifySignature(rawBodyOf(req), headersOf(req));
    await applyEntitlement(validateEntitlement(req.body));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "entitlement");
  }
});
