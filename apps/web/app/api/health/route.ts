import { NextResponse } from "next/server";

// For the platform / Coolify. Public on purpose (the proxy skips it) and it reveals nothing.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
