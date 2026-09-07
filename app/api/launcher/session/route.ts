import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import {
  bindLauncherGuild,
  buildLauncherSyncPayload,
  markLauncherHeartbeat,
  refreshLauncherSession,
  resolveLauncherBearer,
  revokeLauncherSession,
} from "@/lib/launcher/auth";

async function requireLauncher(request: Request) {
  const session = await resolveLauncherBearer(request.headers.get("authorization"));
  if (!session) {
    return {
      session: null,
      response: applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Sessao do launcher expirada." }, { status: 401 }),
      ),
    };
  }
  return { session, response: null };
}

export async function GET(request: Request) {
  const auth = await requireLauncher(request);
  if (!auth.session) return auth.response;
  await markLauncherHeartbeat(auth.session, {}).catch(() => null);
  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      user: { displayName: auth.session.displayName, email: auth.session.email },
      device: {
        publicId: auth.session.devicePublicId,
        hostname: auth.session.hostname,
        status: auth.session.connectionStatus,
        guildId: auth.session.guildId,
      },
      servers: auth.session.servers,
    }),
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "sync");

    if (action === "refresh") {
      const refreshed = await refreshLauncherSession(String(body.refreshToken || ""));
      if (!refreshed) {
        return applyNoStoreHeaders(
          NextResponse.json({ ok: false, message: "Sessao expirada. Entre novamente." }, { status: 401 }),
        );
      }
      return applyNoStoreHeaders(NextResponse.json({ ok: true, ...refreshed }));
    }

    const auth = await requireLauncher(request);
    if (!auth.session) return auth.response;

    if (action === "logout") {
      await revokeLauncherSession(auth.session);
      return applyNoStoreHeaders(NextResponse.json({ ok: true }));
    }

    if (action === "bind") {
      await bindLauncherGuild(auth.session, String(body.guildId || ""), {
        observedIp: typeof body.observedIp === "string" ? body.observedIp : null,
      });
      return applyNoStoreHeaders(NextResponse.json({ ok: true, message: "Servidor conectado." }));
    }

    if (action === "heartbeat" || action === "sync") {
      await markLauncherHeartbeat(auth.session, {
        observedIp: typeof body.observedIp === "string" ? body.observedIp : null,
        appVersion: typeof body.appVersion === "string" ? body.appVersion : null,
        error: typeof body.error === "string" ? body.error : null,
      });
      if (action === "heartbeat") {
        return applyNoStoreHeaders(NextResponse.json({ ok: true, guildId: auth.session.guildId }));
      }
      const payload = await buildLauncherSyncPayload(auth.session, body);
      return applyNoStoreHeaders(NextResponse.json(payload));
    }

    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Acao invalida." }, { status: 400 }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Falha no launcher.",
        },
        { status: 400 },
      ),
    );
  }
}
