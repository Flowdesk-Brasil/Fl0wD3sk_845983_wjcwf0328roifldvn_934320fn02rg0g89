import { NextResponse } from "next/server";
import {
  checkDiscordBotStatus,
  stabilizeStatusCheckResult,
} from "../../../../lib/status/monitors";
import { PUBLIC_STATUS_CACHE_HEADER } from "@/lib/http/publicCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = stabilizeStatusCheckResult("discord", await checkDiscordBotStatus());
    return NextResponse.json(payload, {
      status: payload.ok ? 200 : 503,
      headers: { "Cache-Control": PUBLIC_STATUS_CACHE_HEADER },
    });
  } catch (error) {
    console.error("Discord bot status check failed:", error);

    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        status: "partial_outage",
        message: "Falha ao verificar o Discord Bot com confianca suficiente.",
        source: "discord",
        ready: false,
        wsStatus: null,
        guildCount: null,
        uptimeMs: null,
        url: null,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
