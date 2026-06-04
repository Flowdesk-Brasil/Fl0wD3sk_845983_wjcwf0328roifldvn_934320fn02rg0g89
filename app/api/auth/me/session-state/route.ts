import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";

export async function GET() {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, authenticated: false }, { status: 401 }),
    );
  }

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      authenticated: true,
      sessionId: session.id,
    }),
  );
}
