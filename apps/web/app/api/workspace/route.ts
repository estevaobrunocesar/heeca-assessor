import { NextResponse } from "next/server";
import { apiFetch } from "../../../lib/api";

export async function DELETE(req: Request) {
  const body = await req.text();
  const apiRes = await apiFetch("/api/workspace", { method: "DELETE", body });
  if (apiRes.status === 204) return new NextResponse(null, { status: 204 });
  const data = await apiRes.json();
  return NextResponse.json(data, { status: apiRes.status });
}
