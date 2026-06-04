import { NextResponse } from "next/server";
import { isCloudflareDnsConfigured } from "@/lib/domains/cloudflare";
import { domainProviderOrchestrator } from "@/lib/domains/provider";
import { getJsonSecurityHeaders } from "@/lib/domains/requestGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = Math.random().toString(36).slice(2, 8);
  try {
    const startedAt = Date.now();
    const providers = await domainProviderOrchestrator.health();
    const healthy = providers.some((provider) => provider.ok);
    return NextResponse.json(
      {
        status: healthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startedAt,
        providers,
        cloudflareConfigured: isCloudflareDnsConfigured(),
        apiConnectivity: healthy ? "ok" : "failed",
        provider: "multi-provider",
        version: process.env.npm_package_version || "unknown",
      },
      { status: healthy ? 200 : 503, headers: getJsonSecurityHeaders(requestId) },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        provider: "multi-provider",
      },
      { status: 503, headers: getJsonSecurityHeaders(requestId) },
    );
  }
}
