/**
 * Links de afiliado.
 *
 * Mudancas em relacao a v1:
 *   - planSlug e period agora sao validados na aplicacao. Antes iam direto ao
 *     banco e a rejeicao voltava como 500 generico.
 *   - Os valores aceitos passaram a ser os reais do produto: basic, pro, ultra
 *     e master, nos quatro periodos. A v1 aceitava "enterprise", que nao existe.
 *   - A URL curta era, nas palavras do proprio codigo, "uma string
 *     demonstrativa". Agora aponta para /r/<codigo>/<plano>-<periodo>, que
 *     existe, conta o clique e redireciona.
 *   - Ganhou rate limit e exige afiliado ativo com termos aceitos.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireActiveAffiliate } from "@/lib/affiliates/account";
import {
  AFFILIATE_PERIOD_CODES,
  AFFILIATE_PLAN_CODES,
  isAffiliatePeriodCode,
  isAffiliatePlanCode,
} from "@/lib/affiliates/programRules";
import { resolvePlanSlug, resolvePlanBillingPeriodSlug } from "@/lib/plans/catalog";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
} from "@/lib/security/requestSecurity";

export const dynamic = "force-dynamic";

/** Base publica dos links divulgados pelo afiliado. */
function resolvePublicOrigin(request: NextRequest) {
  const configured = String(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "",
  ).trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return request.nextUrl.origin;
}

function json(status: number, body: Record<string, unknown>) {
  return applyNoStoreHeaders(NextResponse.json(body, { status }));
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) {
    return originGuard;
  }

  const requestContext = createSecurityRequestContext(request);

  const rateLimit = await enforceRequestRateLimit({
    action: "affiliate_link_create",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 30,
    context: requestContext,
  });

  if (!rateLimit.ok) {
    const response = json(429, {
      ok: false,
      message: "Muitos links criados em sequencia. Aguarde um instante.",
    });
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return attachRequestId(response, requestContext.requestId);
  }

  const user = await getCurrentUserFromSessionCookie();
  if (!user) {
    return attachRequestId(
      json(401, { ok: false, message: "Faca login para continuar." }),
      requestContext.requestId,
    );
  }

  const gate = await requireActiveAffiliate(user.id);
  if (!gate.ok) {
    return attachRequestId(
      json(gate.status, { ok: false, code: gate.code, message: gate.message }),
      requestContext.requestId,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attachRequestId(
      json(400, { ok: false, message: "Requisicao invalida." }),
      requestContext.requestId,
    );
  }

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const planSlug = String(payload.planSlug ?? "").trim().toLowerCase();
  const period = String(payload.period ?? "").trim().toLowerCase();

  if (!isAffiliatePlanCode(planSlug)) {
    return attachRequestId(
      json(400, {
        ok: false,
        message: `Plano invalido. Use um destes: ${AFFILIATE_PLAN_CODES.join(", ")}.`,
      }),
      requestContext.requestId,
    );
  }

  if (!isAffiliatePeriodCode(period)) {
    return attachRequestId(
      json(400, {
        ok: false,
        message: `Periodo invalido. Use um destes: ${AFFILIATE_PERIOD_CODES.join(", ")}.`,
      }),
      requestContext.requestId,
    );
  }

  const origin = resolvePublicOrigin(request);
  const affiliateCode = gate.affiliate.affiliate_id;

  // Curto e ditavel: o afiliado le esse link em video e story.
  const shortUrl = `${origin}/r/${affiliateCode}/${planSlug}-${period}`;

  // Destino final: o checkout real do plano. A v1 apontava para /register, que
  // nunca existiu no projeto.
  const targetUrl = `${origin}/payment/${resolvePlanSlug(planSlug)}/${resolvePlanBillingPeriodSlug(period)}`;

  const { data: newLink, error } = await supabaseAdmin
    .from("affiliate_links")
    .insert([
      {
        affiliate_id: gate.affiliate.id,
        plan_slug: planSlug,
        period,
        short_url: shortUrl,
        target_url: targetUrl,
      },
    ])
    .select()
    .single();

  if (error) {
    // Ja existe link para esse par plano+periodo: devolve o que existe, em vez
    // de erro. O afiliado so quer o link.
    if (error.code === "23505") {
      const { data: existing } = await supabaseAdmin
        .from("affiliate_links")
        .select("*")
        .eq("affiliate_id", gate.affiliate.id)
        .eq("plan_slug", planSlug)
        .eq("period", period)
        .maybeSingle();

      if (existing) {
        return attachRequestId(
          json(200, { ok: true, link: existing, alreadyExisted: true }),
          requestContext.requestId,
        );
      }
    }

    console.error("[affiliates] falha ao criar link:", error);
    return attachRequestId(
      json(500, { ok: false, message: "Nao foi possivel criar o link agora." }),
      requestContext.requestId,
    );
  }

  return attachRequestId(
    json(200, { ok: true, link: newLink, alreadyExisted: false }),
    requestContext.requestId,
  );
}

/** Lista os links do afiliado. */
export async function GET() {
  const user = await getCurrentUserFromSessionCookie();
  if (!user) {
    return json(401, { ok: false, message: "Faca login para continuar." });
  }

  const gate = await requireActiveAffiliate(user.id);
  if (!gate.ok) {
    return json(gate.status, { ok: false, code: gate.code, message: gate.message });
  }

  const { data, error } = await supabaseAdmin
    .from("affiliate_links")
    .select("*")
    .eq("affiliate_id", gate.affiliate.id)
    .order("created_at", { ascending: false });

  if (error) {
    return json(500, { ok: false, message: "Nao foi possivel carregar seus links." });
  }

  return json(200, { ok: true, links: data || [] });
}

/** Remove um link. As conversoes ja registradas continuam validas. */
export async function DELETE(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) {
    return originGuard;
  }

  const user = await getCurrentUserFromSessionCookie();
  if (!user) {
    return json(401, { ok: false, message: "Faca login para continuar." });
  }

  const gate = await requireActiveAffiliate(user.id);
  if (!gate.ok) {
    return json(gate.status, { ok: false, code: gate.code, message: gate.message });
  }

  const linkId = String(request.nextUrl.searchParams.get("linkId") ?? "").trim();
  if (!linkId) {
    return json(400, { ok: false, message: "Informe o link a remover." });
  }

  const { error } = await supabaseAdmin
    .from("affiliate_links")
    .delete()
    .eq("id", linkId)
    .eq("affiliate_id", gate.affiliate.id);

  if (error) {
    return json(500, { ok: false, message: "Nao foi possivel remover o link." });
  }

  return json(200, { ok: true });
}
