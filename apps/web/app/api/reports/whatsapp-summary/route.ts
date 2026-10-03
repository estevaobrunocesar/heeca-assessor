import { NextResponse } from "next/server";
import { apiFetch } from "../../../../lib/api";

async function forward(method: "GET" | "PUT", body?: string) {
  const res = await apiFetch("/api/reports/whatsapp-summary", { method, ...(body ? { body } : {}) });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function GET() {
  return forward("GET");
}

export async function PUT(req: Request) {
  return forward("PUT", await req.text());
}
