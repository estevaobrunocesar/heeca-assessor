import { NextResponse } from "next/server";
import { apiFetch } from "../../../lib/api";

export async function POST(req: Request) {
  const body = await req.json();
  const res = await apiFetch("/api/auth/phone", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
