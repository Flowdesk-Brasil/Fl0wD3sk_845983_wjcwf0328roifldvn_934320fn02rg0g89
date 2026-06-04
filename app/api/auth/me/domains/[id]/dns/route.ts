import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import {
  createDomainDnsRecord,
  deleteDomainDnsRecord,
  listDomainDnsRecords,
  updateDomainDnsRecord,
} from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await context.params;
    return NextResponse.json({ ok: true, records: await listDomainDnsRecords(user.id, id) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao listar DNS." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) return originGuard;
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await context.params;
    const body = parseFlowSecureDto(
      await request.json(),
      {
        type: flowSecureDto.enum(["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA", "PTR"] as const),
        name: flowSecureDto.string({ minLength: 1, maxLength: 253 }),
        content: flowSecureDto.string({
          minLength: 1,
          maxLength: 4096,
          rejectThreatPatterns: false,
          disallowAngleBrackets: false,
        }),
        ttl: flowSecureDto.optional(flowSecureDto.number({ integer: true, min: 1, max: 86400 })),
        proxied: flowSecureDto.optional(flowSecureDto.boolean({ defaultValue: false })),
        priority: flowSecureDto.optional(flowSecureDto.number({ integer: true, min: 0, max: 65535 })),
      },
      { rejectUnknown: true },
    );
    const record = await createDomainDnsRecord(user.id, id, {
      type: body.type,
      name: body.name,
      content: body.content,
      ttl: body.ttl || 1,
      proxied: body.proxied === true,
      priority: body.priority ?? null,
    });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao criar DNS." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) return originGuard;
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await context.params;
    const recordId = new URL(request.url).searchParams.get("recordId") || "";
    if (!recordId) return NextResponse.json({ ok: false, message: "Registro DNS invalido." }, { status: 400 });
    await deleteDomainDnsRecord(user.id, id, recordId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao excluir DNS." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) return originGuard;
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await context.params;
    const body = parseFlowSecureDto(
      await request.json(),
      {
        recordId: flowSecureDto.string({ minLength: 1, maxLength: 128, pattern: /^[A-Za-z0-9_-]+$/ }),
        type: flowSecureDto.enum(["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA", "PTR"] as const),
        name: flowSecureDto.string({ minLength: 1, maxLength: 253 }),
        content: flowSecureDto.string({
          minLength: 1,
          maxLength: 4096,
          rejectThreatPatterns: false,
          disallowAngleBrackets: false,
        }),
        ttl: flowSecureDto.optional(flowSecureDto.number({ integer: true, min: 1, max: 86400 })),
        proxied: flowSecureDto.optional(flowSecureDto.boolean({ defaultValue: false })),
        priority: flowSecureDto.optional(flowSecureDto.number({ integer: true, min: 0, max: 65535 })),
      },
      { rejectUnknown: true },
    );
    const record = await updateDomainDnsRecord(user.id, id, body.recordId, {
      type: body.type,
      name: body.name,
      content: body.content,
      ttl: body.ttl || 1,
      proxied: body.proxied === true,
      priority: body.priority ?? null,
    });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao atualizar DNS." }, { status: 400 });
  }
}
