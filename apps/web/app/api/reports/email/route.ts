import { NextResponse } from "next/server";
import { apiFetch } from "../../../../lib/api";

async function forward(path: string, method: "GET" | "PUT" | "POST", body?: string) {
  const res = await apiFetch(`/api/reports/email${path}`, { method, ...(body ? { body } : {}) });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function GET() {
  return forward("", "GET");
}

export async function PUT(req: Request) {
  return forward("", "PUT", await req.text());
}

// "Enviar agora": sends the latest closed period to the person's own e-mail.
export async function POST() {
  return forward("/test", "POST");
}
