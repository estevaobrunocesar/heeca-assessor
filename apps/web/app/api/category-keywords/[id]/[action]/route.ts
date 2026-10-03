import { NextResponse } from "next/server";
import { apiFetch } from "../../../../../lib/api";

type Ctx = { params: Promise<{ id: string; action: string }> };

// Preview (GET matches) and apply (POST apply) of a keyword rule on existing entries.
export async function GET(_req: Request, { params }: Ctx) {
  const { id, action } = await params;
  if (action !== "matches") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const res = await apiFetch(`/api/category-keywords/${encodeURIComponent(id)}/matches`);
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id, action } = await params;
  if (action !== "apply") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const res = await apiFetch(`/api/category-keywords/${encodeURIComponent(id)}/apply`, { method: "POST", body: await req.text() });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
