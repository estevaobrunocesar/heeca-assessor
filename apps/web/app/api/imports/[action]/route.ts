import { NextResponse } from "next/server";
import { apiFetch } from "../../../../lib/api";

const ALLOWED = new Set(["preview", "commit", "undo"]);

// Sends the file (preview) or the confirmed lines (commit/undo) to the API with the session's credentials.
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ALLOWED.has(action)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { search } = new URL(req.url);
  const isFile = action === "preview";
  const res = await apiFetch(`/api/imports/${action}${isFile ? search : ""}`, {
    method: "POST",
    headers: isFile ? { "Content-Type": req.headers.get("content-type") ?? "application/octet-stream" } : undefined,
    body: isFile ? Buffer.from(await req.arrayBuffer()) : await req.text(),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
