import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { pollLauncherLogin } from "@/lib/launcher/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const pollToken = String(body.pollToken || "").trim();
    if (!pollToken) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Sessao de login invalida." }, { status: 400 }),
      );
    }
    const polled = await pollLauncherLogin(pollToken);
    return applyNoStoreHeaders(NextResponse.json({ ok: true, ...polled }));
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Falha ao verificar o login." }, { status: 400 }),
    );
  }
}
