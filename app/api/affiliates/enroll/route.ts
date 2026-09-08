/**
 * Adesao ao programa de afiliados.
 *
 * A v1 nao tinha esta rota: o perfil nascia sozinho no GET /api/affiliates/me,
 * ou seja, qualquer usuario logado que abrisse a pagina virava afiliado sem
 * pedir e sem aceitar termos. Agora a entrada e um ato explicito, com aceite
 * registrado (versao, data, IP e user agent).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { enrollAffiliate, findAffiliateByUserId } from "@/lib/affiliates/account";
import { PROGRAM_TERMS_VERSION, getProgramRulesSummary } from "@/lib/affiliates/programRules";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) {
    return originGuard;
  }

  const requestContext = createSecurityRequestContext(request);

  const rateLimit = await enforceRequestRateLimit({
    action: "affiliate_enroll",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 10,
    context: requestContext,
  });

  if (!rateLimit.ok) {
    const response = applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: "Muitas tentativas seguidas. Aguarde alguns instantes." },
        { status: 429 },
      ),
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return attachRequestId(response, requestContext.requestId);
  }

  const user = await getCurrentUserFromSessionCookie();
  if (!user) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Faca login para continuar." }, { status: 401 }),
      ),
      requestContext.requestId,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const acceptedTerms = payload.acceptTerms === true;
  const acceptedVersion = String(payload.termsVersion ?? "").trim();

  if (!acceptedTerms) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: "E preciso aceitar os termos do programa para participar.",
            termsVersion: PROGRAM_TERMS_VERSION,
          },
          { status: 400 },
        ),
      ),
      requestContext.requestId,
    );
  }

  // A versao aceita precisa ser a vigente: aceitar uma versao antiga guardada
  // numa aba esquecida nao vale.
  if (acceptedVersion && acceptedVersion !== PROGRAM_TERMS_VERSION) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: "Os termos foram atualizados. Recarregue a pagina e revise a nova versao.",
            termsVersion: PROGRAM_TERMS_VERSION,
          },
          { status: 409 },
        ),
      ),
      requestContext.requestId,
    );
  }

  const result = await enrollAffiliate(user.id, {
    ipFingerprint: requestContext.ipFingerprint,
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "affiliate_enroll",
      outcome: "failed",
      metadata: { reason: result.reason },
    });

    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: result.reason }, { status: result.status }),
      ),
      requestContext.requestId,
    );
  }

  await logSecurityAuditEventSafe(requestContext, {
    action: "affiliate_enroll",
    outcome: "succeeded",
    metadata: {
      affiliateId: result.affiliate.affiliate_id,
      created: result.created,
      termsVersion: PROGRAM_TERMS_VERSION,
    },
  });

  return attachRequestId(
    applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        created: result.created,
        affiliate: {
          affiliateId: result.affiliate.affiliate_id,
          level: result.affiliate.level,
          couponCode: result.affiliate.coupon_code,
          termsVersion: result.affiliate.terms_version,
          enrolledAt: result.affiliate.enrolled_at,
        },
      }),
    ),
    requestContext.requestId,
  );
}

/** Estado da adesao: usado pelo painel para decidir o que mostrar. */
export async function GET() {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Faca login para continuar." }, { status: 401 }),
    );
  }

  const affiliate = await findAffiliateByUserId(user.id);
  const rules = getProgramRulesSummary();

  if (!affiliate) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        enrolled: false,
        status: "not_enrolled",
        termsVersion: PROGRAM_TERMS_VERSION,
        rules,
      }),
    );
  }

  const status = affiliate.suspended_at
    ? "suspended"
    : !affiliate.is_active
      ? "inactive"
      : affiliate.terms_version !== PROGRAM_TERMS_VERSION
        ? "terms_outdated"
        : "active";

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      enrolled: true,
      status,
      termsVersion: PROGRAM_TERMS_VERSION,
      acceptedTermsVersion: affiliate.terms_version,
      suspensionReason: affiliate.suspension_reason,
      rules,
    }),
  );
}
