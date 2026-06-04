import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import {
  getUserDomain,
  setDomainAutoRenew,
  setDomainTransferLock,
} from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUserFromSessionCookie();
  if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
  const { id } = await context.params;
  const domain = await getUserDomain(user.id, id);
  return domain
    ? NextResponse.json({ ok: true, domain })
    : NextResponse.json({ ok: false, message: "Dominio nao encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) return originGuard;
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await context.params;
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        action: flowSecureDto.enum(["auto_renew", "transfer_lock"] as const),
        enabled: flowSecureDto.optional(flowSecureDto.boolean()),
        locked: flowSecureDto.optional(flowSecureDto.boolean()),
      },
      { rejectUnknown: true },
    );
    if (body.action === "auto_renew") {
      await setDomainAutoRenew({ authUserId: user.id, domainId: id, autoRenew: body.enabled === true });
    } else if (body.action === "transfer_lock") {
      await setDomainTransferLock({ authUserId: user.id, domainId: id, locked: body.locked === true });
    } else {
      return NextResponse.json({ ok: false, message: "Acao de dominio invalida." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao atualizar dominio." }, { status: 400 });
  }
}
