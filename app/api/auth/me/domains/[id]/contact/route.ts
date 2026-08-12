import { NextResponse } from "next/server";
import type { DomainContact } from "@/lib/domains/adapter";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import {
  getDomainRegistrantProfile,
  updateDomainRegistrantProfile,
} from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const contactDto = {
  fullName: flowSecureDto.personName(),
  email: flowSecureDto.email(),
  phone: flowSecureDto.string({ minLength: 8, maxLength: 32 }),
  street: flowSecureDto.string({ minLength: 3, maxLength: 180 }),
  city: flowSecureDto.string({ minLength: 2, maxLength: 100 }),
  state: flowSecureDto.string({ minLength: 2, maxLength: 64 }),
  postalCode: flowSecureDto.string({ minLength: 3, maxLength: 24 }),
  country: flowSecureDto.string({ minLength: 2, maxLength: 2 }),
  documentType: flowSecureDto.enum(["cpf", "cnpj", "passport", "none"] as const),
  documentNumber: flowSecureDto.optional(
    flowSecureDto.string({ allowEmpty: true, maxLength: 40 }),
  ),
};

export async function GET(_request: Request, context: Context) {
  try {
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await context.params;
    const profile = await getDomainRegistrantProfile({ authUserId: user.id, domainId: id });
    return NextResponse.json({
      ok: true,
      domain: profile.domain,
      contact: profile.contact,
      needsSetup: profile.needsSetup,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao carregar titular do dominio." },
      { status: 400 },
    );
  }
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
      { contact: flowSecureDto.record() },
      { rejectUnknown: true },
    );
    const contact = parseFlowSecureDto<DomainContact>(body.contact, contactDto, {
      rejectUnknown: true,
    });
    const result = await updateDomainRegistrantProfile({
      authUserId: user.id,
      domainId: id,
      contact,
    });
    return NextResponse.json({ ok: true, domain: result.domain, contact: result.contact });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao atualizar titular do dominio." },
      { status: 400 },
    );
  }
}
