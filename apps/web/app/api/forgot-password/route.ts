import { NextResponse } from "next/server";
import { API_URL } from "../../../lib/api";

export async function POST(req: Request) {
  const { email } = await req.json();

  const apiRes = await fetch(`${API_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await apiRes.json();
  return NextResponse.json(data, { status: apiRes.status });
}
