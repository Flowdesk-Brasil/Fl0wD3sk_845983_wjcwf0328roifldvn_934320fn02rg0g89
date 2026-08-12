import { NextResponse } from "next/server";
import {
  checkFlowAiStatus,
  stabilizeFlowAiStatusResponse,
} from "../../../../lib/status/monitors";
import { PUBLIC_STATUS_CACHE_HEADER } from "@/lib/http/publicCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = stabilizeFlowAiStatusResponse(await checkFlowAiStatus());
    return NextResponse.json(payload, {
      headers: { "Cache-Control": PUBLIC_STATUS_CACHE_HEADER },
    });
  } catch (error) {
    console.error("Flow AI status check failed:", error);

    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        error: "Falha ao verificar o status do Flow AI.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
