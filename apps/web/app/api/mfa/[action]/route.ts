import { NextResponse } from "next/server";
import { apiFetch } from "../../../../lib/api";

// Only these MFA calls are exposed to the browser; everything goes out with the session's credentials.
const ALLOWED = new Set(["status", "setup", "enable", "disable"]);

async function forward(action: string, method: "GET" | "POST", body?: string) {
  if (!ALLOWED.has(action)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const res = await apiFetch(`/api/auth/mfa/${action}`, { method, ...(body ? { body } : {}) });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(_req: Request, { params }: { params: Promise<{ action: string }> }) {
  return forward((await params).action, "GET");
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  return forward((await params).action, "POST", await req.text());
}
