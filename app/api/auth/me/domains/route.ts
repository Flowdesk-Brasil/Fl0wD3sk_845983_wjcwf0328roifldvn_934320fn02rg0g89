import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { listUserDomains } from "@/lib/domains/domainService";
import { applyNoStoreHeaders } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecoverableDomainsReadError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("relation")
  );
}

export async function GET() {
  try {
    const user = await getCurrentUserFromSessionCookie();
    if (!user) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
      );
    }
    const domains = (await listUserDomains(user.id)).map((domain) => {
      const { provider, providerDomainId, ...publicDomain } = domain;
      void provider;
      void providerDomainId;
      return publicDomain;
    });
    return applyNoStoreHeaders(NextResponse.json({ ok: true, domains }));
  } catch (error) {
    if (isRecoverableDomainsReadError(error)) {
      console.warn("[auth/me/domains] safe empty fallback", {
        message: error instanceof Error ? error.message : String(error),
      });
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          domains: [],
          degraded: true,
          message: "Dominios temporariamente indisponiveis.",
        }),
      );
    }

    return applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: "Falha ao listar dominios." },
        { status: 500 },
      ),
    );
  }
}
