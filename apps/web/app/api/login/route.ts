import { NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { forwardedFor } from "../../../lib/clientIp";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  const apiRes = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...forwardedFor(req) },
    body: JSON.stringify({ email, password }),
  });

  if (!apiRes.ok) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: apiRes.status === 429 ? 429 : 401 });
  }

  const data = await apiRes.json();

  // Password was right but the account has a second factor: no session cookie
  // yet, only the short-lived challenge the browser must answer with a code.
  if (data.mfaRequired) {
    return NextResponse.json({ mfaRequired: true, mfaToken: data.mfaToken });
  }

  const res = NextResponse.json({ user: data.user });
  res.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
