import { NextResponse } from "next/server";
import { getUSDToBRLRate } from "@/lib/currency";
import { PUBLIC_STATUS_CACHE_HEADER } from "@/lib/http/publicCache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rate = await getUSDToBRLRate();
    return NextResponse.json(
      {
        ok: true,
        base: "USD",
        target: "BRL",
        rate,
        timestamp: new Date().toISOString(),
        source: "exchangerate-api.com (through FlowAPI caching)",
      },
      { headers: { "Cache-Control": PUBLIC_STATUS_CACHE_HEADER } },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Falha ao obter taxa de cambio em tempo real.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
