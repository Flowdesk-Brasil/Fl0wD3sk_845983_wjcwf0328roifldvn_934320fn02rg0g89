/**
 * Redirecionador de link de afiliado.
 *
 * Esta rota nao existia: os links gerados apontavam para flwdesk.com/r/... e
 * para /register, e ambos davam 404. Sem ela, nenhum clique era contado e
 * nenhuma venda podia ser atribuida.
 *
 * Formatos aceitos:
 *   /r/AFF-8KD2M1                 -> home, com atribuicao
 *   /r/AFF-8KD2M1/pro-monthly     -> checkout do plano Pro mensal
 *   /r/AFF-8KD2M1/flow-pro/mensal -> mesma coisa, em slug
 *
 * Sempre redireciona, mesmo com codigo invalido: um visitante nunca deve ver
 * erro por causa de um link mal divulgado.
 */

import { NextResponse, after, type NextRequest } from "next/server";
import { resolvePlanSlug, resolvePlanBillingPeriodSlug } from "@/lib/plans/catalog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findAffiliateByCode } from "@/lib/affiliates/account";
import {
  applyAttributionCookie,
  createVisitorId,
  readAttributionFromRequest,
} from "@/lib/affiliates/attribution";
import {
  CLICK_DEDUPE_WINDOW_MINUTES,
  CLICK_MAX_PER_VISITOR_PER_DAY,
  isAffiliatePeriodCode,
  isAffiliatePlanCode,
  type AffiliatePeriodCode,
  type AffiliatePlanCode,
} from "@/lib/affiliates/programRules";

export const dynamic = "force-dynamic";

type ParsedTarget = {
  plan: AffiliatePlanCode | null;
  period: AffiliatePeriodCode | null;
};

// Map em vez de objeto literal: com objeto, "/r/CODE/__proto__" devolveria
// Object.prototype, que e truthy, e o plano viraria um objeto em vez de null.
const PERIOD_BY_SLUG = new Map<string, AffiliatePeriodCode>([
  ["mensal", "monthly"],
  ["trimestral", "quarterly"],
  ["semestral", "semiannual"],
  ["anual", "annual"],
]);

const PLAN_BY_SLUG = new Map<string, AffiliatePlanCode>([
  ["flow-basic", "basic"],
  ["flow-pro", "pro"],
  ["flow-ultra", "ultra"],
  ["flow-master", "master"],
]);

function parseTarget(segments: string[]): ParsedTarget {
  const rest = segments.slice(1).filter(Boolean).map((part) => part.toLowerCase());

  if (rest.length === 0) {
    return { plan: null, period: null };
  }

  // /r/CODE/flow-pro/mensal
  if (rest.length >= 2) {
    const plan = PLAN_BY_SLUG.get(rest[0]) ?? (isAffiliatePlanCode(rest[0]) ? rest[0] : null);
    const period =
      PERIOD_BY_SLUG.get(rest[1]) ?? (isAffiliatePeriodCode(rest[1]) ? rest[1] : null);
    return { plan, period };
  }

  // /r/CODE/pro-monthly
  const [planPart, periodPart] = rest[0].split("-").length >= 2
    ? [rest[0].slice(0, rest[0].lastIndexOf("-")), rest[0].slice(rest[0].lastIndexOf("-") + 1)]
    : [rest[0], ""];

  const plan = PLAN_BY_SLUG.get(planPart) ?? (isAffiliatePlanCode(planPart) ? planPart : null);
  const period =
    PERIOD_BY_SLUG.get(periodPart) ?? (isAffiliatePeriodCode(periodPart) ? periodPart : null);

  return { plan, period };
}

function buildDestination(origin: string, target: ParsedTarget) {
  if (target.plan && target.period) {
    const planSlug = resolvePlanSlug(target.plan);
    const periodSlug = resolvePlanBillingPeriodSlug(target.period);
    return new URL(`/payment/${planSlug}/${periodSlug}`, origin);
  }

  if (target.plan) {
    return new URL(`/payment/${resolvePlanSlug(target.plan)}/mensal`, origin);
  }

  return new URL("/", origin);
}

/** Fingerprint do IP, para antifraude sem guardar o IP em claro. */
async function fingerprintIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";

  if (!ip) return null;

  const crypto = await import("node:crypto");
  const salt = String(process.env.AUTH_AUDIT_HASH_SALT || "flowdesk-affiliates");
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await context.params;
  const origin = request.nextUrl.origin;

  const affiliateCode = String(segments?.[0] ?? "").trim().toUpperCase();
  const target = parseTarget(segments || []);
  const destination = buildDestination(origin, target);

  // Preserva utm_* e afins para o time de marketing nao perder o rastro.
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key.toLowerCase().startsWith("utm_") || key === "src") {
      destination.searchParams.set(key, value);
    }
  });

  if (!affiliateCode) {
    return NextResponse.redirect(destination, { status: 302 });
  }

  const affiliate = await findAffiliateByCode(affiliateCode);

  // Codigo inexistente ou suspenso: o visitante segue para o destino, mas sem
  // atribuicao e sem clique contabilizado.
  if (!affiliate || affiliate.suspended_at || !affiliate.is_active) {
    return NextResponse.redirect(destination, { status: 302 });
  }

  const existing = readAttributionFromRequest(request);
  const visitorId = existing?.visitorId || createVisitorId();

  const response = NextResponse.redirect(destination, { status: 302 });

  const linkId = await resolveLinkId(affiliate.id, target);

  const attributionResult = applyAttributionCookie(
    request,
    response,
    {
      affiliateCode: affiliate.affiliate_id,
      linkId,
      visitorId,
      issuedAt: Math.floor(Date.now() / 1000),
    },
    existing,
  );

  // Registra o clique sem segurar o redirecionamento do visitante. after()
  // garante que a gravacao termina mesmo em serverless, onde a funcao pode ser
  // encerrada assim que a resposta sai: com "void" solto, o clique se perdia.
  after(
    recordClickSafe({
      request,
      affiliateId: affiliate.id,
      linkId,
      visitorId,
      attributionApplied: attributionResult.applied,
    }),
  );

  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}

async function resolveLinkId(affiliateId: string, target: ParsedTarget) {
  if (!target.plan || !target.period) return null;

  const { data } = await supabaseAdmin
    .from("affiliate_links")
    .select("id")
    .eq("affiliate_id", affiliateId)
    .eq("plan_slug", target.plan)
    .eq("period", target.period)
    .maybeSingle();

  return (data?.id as string) ?? null;
}

async function recordClickSafe(input: {
  request: NextRequest;
  affiliateId: string;
  linkId: string | null;
  visitorId: string;
  attributionApplied: boolean;
}) {
  try {
    const ipFingerprint = await fingerprintIp(input.request);
    const userAgent = input.request.headers.get("user-agent") || "";
    const referer = input.request.headers.get("referer") || "";

    const rejection = await resolveClickRejection({
      affiliateId: input.affiliateId,
      linkId: input.linkId,
      visitorId: input.visitorId,
      userAgent,
    });

    await supabaseAdmin.from("affiliate_clicks").insert([
      {
        affiliate_id: input.affiliateId,
        link_id: input.linkId,
        visitor_id: input.visitorId,
        ip_fingerprint: ipFingerprint,
        user_agent: userAgent.slice(0, 400) || null,
        referer: referer.slice(0, 500) || null,
        country: input.request.headers.get("x-vercel-ip-country") || null,
        is_counted: rejection === null,
        reject_reason: rejection,
      },
    ]);

    // clicks_count e cache do que foi contado; o historico fica em affiliate_clicks.
    if (rejection === null && input.linkId) {
      await incrementLinkClicks(input.linkId);
    }
  } catch (error) {
    console.error("[affiliates] falha ao registrar clique:", error);
  }
}

/** Devolve o motivo da rejeicao, ou null se o clique conta. */
async function resolveClickRejection(input: {
  affiliateId: string;
  linkId: string | null;
  visitorId: string;
  userAgent: string;
}): Promise<string | null> {
  if (isLikelyBot(input.userAgent)) {
    return "bot";
  }

  const dedupeSince = new Date(
    Date.now() - CLICK_DEDUPE_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  let dedupeQuery = supabaseAdmin
    .from("affiliate_clicks")
    .select("id", { count: "exact", head: true })
    .eq("visitor_id", input.visitorId)
    .eq("is_counted", true)
    .gte("clicked_at", dedupeSince);

  dedupeQuery = input.linkId
    ? dedupeQuery.eq("link_id", input.linkId)
    : dedupeQuery.eq("affiliate_id", input.affiliateId);

  const { count: recentCount } = await dedupeQuery;
  if ((recentCount ?? 0) > 0) {
    return "duplicate";
  }

  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: dailyCount } = await supabaseAdmin
    .from("affiliate_clicks")
    .select("id", { count: "exact", head: true })
    .eq("visitor_id", input.visitorId)
    .eq("affiliate_id", input.affiliateId)
    .eq("is_counted", true)
    .gte("clicked_at", dayStart);

  if ((dailyCount ?? 0) >= CLICK_MAX_PER_VISITOR_PER_DAY) {
    return "daily_cap";
  }

  return null;
}

const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discordbot|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom|semrush|ahrefs/i;

function isLikelyBot(userAgent: string) {
  if (!userAgent.trim()) return true;
  return BOT_PATTERN.test(userAgent);
}

async function incrementLinkClicks(linkId: string) {
  const { data } = await supabaseAdmin
    .from("affiliate_links")
    .select("clicks_count")
    .eq("id", linkId)
    .maybeSingle();

  if (!data) return;

  const current = Number.parseInt(String(data.clicks_count ?? 0), 10);
  await supabaseAdmin
    .from("affiliate_links")
    .update({ clicks_count: (Number.isFinite(current) ? Math.max(0, current) : 0) + 1 })
    .eq("id", linkId);
}
