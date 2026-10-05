import { NextResponse } from "next/server";

// Public on purpose: the login page needs the portal address to offer "Entrar com conta Heeca".
export const dynamic = "force-dynamic";

export function GET() {
  const portal = (process.env.HEECA_PORTAL_URL ?? "").replace(/\/+$/, "");
  return NextResponse.json({ ssoUrl: portal ? `${portal}/sso/assist` : null });
}
