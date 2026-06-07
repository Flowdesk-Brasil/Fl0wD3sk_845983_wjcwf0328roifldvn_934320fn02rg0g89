import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { listUserDomains } from "@/lib/domains/domainService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const domains = (await listUserDomains(user.id)).map((domain) => {
      const { provider, providerDomainId, ...publicDomain } = domain;
      void provider;
      void providerDomainId;
      return publicDomain;
    });
    return NextResponse.json({ ok: true, domains });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao listar dominios." },
      { status: 500 },
    );
  }
}
