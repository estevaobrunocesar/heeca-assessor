import { NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  const apiRes = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!apiRes.ok) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }

  const { token, user } = await apiRes.json();

  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
