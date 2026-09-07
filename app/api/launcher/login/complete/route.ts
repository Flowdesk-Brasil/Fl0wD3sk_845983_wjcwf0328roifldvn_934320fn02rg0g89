import { NextResponse } from "next/server";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import {
  completeLauncherLogin,
  parseLauncherBindGuildCookie,
} from "@/lib/launcher/auth";

export async function POST(request: Request) {
  const invalid = ensureSameOriginJsonMutationRequest(request);
  if (invalid) return applyNoStoreHeaders(invalid);
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const attemptToken = String(body.attemptToken || "").trim();
    const completed = await completeLauncherLogin(attemptToken, {
      preferredGuildId: parseLauncherBindGuildCookie(request.headers.get("cookie")),
    });
    if (!completed.ok) {
      const message =
        completed.code === "unauthenticated"
          ? "Entre na Flowdesk para autorizar este computador."
          : completed.code === "expired"
            ? "Este pedido de login expirou. Abra o launcher de novo."
            : "Pedido de login invalido.";
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, code: completed.code, message },
          { status: completed.code === "unauthenticated" ? 401 : 400 },
        ),
      );
    }
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        message: completed.bound
          ? `Launcher autorizado e vinculado${completed.guildName ? ` a ${completed.guildName}` : ""}.`
          : "Launcher autorizado. Voce ja pode voltar ao aplicativo.",
        displayName: completed.displayName,
        bound: completed.bound,
        guildName: completed.guildName,
      }),
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Nao foi possivel autorizar o launcher." }, { status: 400 }),
    );
  }
}
