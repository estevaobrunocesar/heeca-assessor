import { NextResponse } from "next/server";
import { API_URL } from "../../../lib/api";
import { forwardedFor } from "../../../lib/clientIp";

export async function POST(req: Request) {
  const { token, password } = await req.json();

  const apiRes = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...forwardedFor(req) },
    body: JSON.stringify({ token, password }),
  });

  const data = await apiRes.json();
  return NextResponse.json(data, { status: apiRes.status });
}
