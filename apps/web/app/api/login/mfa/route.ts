import { NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../../lib/api";
import { forwardedFor } from "../../../../lib/clientIp";

export async function POST(req: Request) {
  const { mfaToken, code } = await req.json();

  const apiRes = await fetch(`${API_URL}/api/auth/mfa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...forwardedFor(req) },
    body: JSON.stringify({ mfaToken, code }),
  });
  const data = await apiRes.json().catch(() => ({}));

  if (!apiRes.ok) {
    if (apiRes.status === 429) {
      const minutes = data.retryAfterMinutes ?? 15;
      return NextResponse.json(
        { error: `Muitas tentativas. Tente de novo em ${minutes} minuto${minutes === 1 ? "" : "s"}.` },
        { status: 429 },
      );
    }
    if (data.error === "expired") {
      return NextResponse.json({ error: "A verificação expirou. Entre de novo.", expired: true }, { status: 401 });
    }
    return NextResponse.json({ error: "Código inválido." }, { status: 401 });
  }

  const res = NextResponse.json({ user: data.user, recoveryCodesLeft: data.recoveryCodesLeft });
  res.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
