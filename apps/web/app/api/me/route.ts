import { NextResponse } from "next/server";
import { apiFetch } from "../../../lib/api";

export async function GET() {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) return NextResponse.json(null, { status: res.status });
  return NextResponse.json(await res.json());
}
