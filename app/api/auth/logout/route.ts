import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { revokeCurrentSessionFromCookie } from "@/lib/auth/session";

export async function POST() {
  try {
    await revokeCurrentSessionFromCookie();

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(authConfig.sessionCookieName);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Erro ao encerrar sessao.",
      },
      { status: 500 },
    );
  }
}
