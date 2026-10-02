import { NextResponse } from "next/server";
import { apiFetch } from "../../../lib/api";

export async function GET() {
  const res = await apiFetch("/api/categories");
  if (!res.ok) return NextResponse.json([], { status: res.status });
  return NextResponse.json(await res.json());
}
