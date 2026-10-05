import { NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { forwardedFor } from "../../../lib/clientIp";

// Behind the platform's proxy the request URL is the internal one: the public address comes from the forwarded headers.
function publicOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Portal -> browser -> here: trades the portal's 60-second token for a local session and goes on to `next`. */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  const url = new URL(req.url);
  const fail = (message: string) => NextResponse.redirect(new URL(`/login?sso_error=${encodeURIComponent(message)}`, origin));

  const token = url.searchParams.get("token");
  if (!token) return fail("Token ausente.");

  const apiRes = await fetch(`${API_URL}/api/auth/sso`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...forwardedFor(req) },
    body: JSON.stringify({ token }),
  }).catch(() => null);
  if (!apiRes) return fail("Não foi possível falar com o servidor. Tente de novo.");

  const data = await apiRes.json().catch(() => ({}));
  if (!apiRes.ok || !data.token) return fail(data.error ?? "Não foi possível entrar pela conta Heeca.");

  // Only a path on this site: never an address that would send the person somewhere else.
  const next = url.searchParams.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

  const res = NextResponse.redirect(new URL(destination, origin));
  res.cookies.set(SESSION_COOKIE, data.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}
