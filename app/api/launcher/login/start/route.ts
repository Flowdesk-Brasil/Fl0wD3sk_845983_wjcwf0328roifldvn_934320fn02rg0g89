import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { resolveLauncherWebOrigin, startLauncherLogin } from "@/lib/launcher/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestHost = request.headers.get("host") || "";
    const origin = /localhost|127\.0\.0\.1/i.test(requestHost)
      ? "http://localhost:3000"
      : resolveLauncherWebOrigin(request);
    const started = await startLauncherLogin({
      deviceLabel: String(body.deviceLabel || "Flowdesk Launcher"),
      hostname: String(body.hostname || ""),
      platform: String(body.platform || ""),
      installId: String(body.installId || ""),
      appVersion: String(body.appVersion || ""),
      origin,
    });
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        loginCode: started.loginCode,
        pollToken: started.pollToken,
        expiresAt: started.expiresAt,
        verificationUrl: started.verificationUrl,
        loginUrl: started.loginUrl,
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const message = /launcher_login|schema cache|does not exist/i.test(detail)
      ? "O login do launcher ainda nao esta ativo no banco. Rode o sql/155_flowdesk_launcher.sql."
      : "Nao foi possivel iniciar o login.";
    return applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status: 400 }));
  }
}
