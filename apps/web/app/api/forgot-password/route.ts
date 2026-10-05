import { NextResponse } from "next/server";
import { API_URL } from "../../../lib/api";
import { forwardedFor } from "../../../lib/clientIp";

export async function POST(req: Request) {
  const { email } = await req.json();

  const apiRes = await fetch(`${API_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...forwardedFor(req) },
    body: JSON.stringify({ email }),
  });

  const data = await apiRes.json();
  return NextResponse.json(data, { status: apiRes.status });
}
