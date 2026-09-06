/**
 * Notificacoes e webhook do afiliado.
 *
 * Mudancas em relacao a v1:
 *   - O destino do webhook passa por validacao anti-SSRF: sem https ou
 *     apontando para rede interna, e recusado. Antes qualquer string era salva,
 *     inclusive http://169.254.169.254/.
 *   - Ganhou segredo de assinatura, selecao de eventos e os campos que os tipos
 *     do front ja prometiam e o banco nao tinha.
 *   - O upsert antigo apagava campos nao enviados; agora so mexe no que veio.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireActiveAffiliate } from "@/lib/affiliates/account";
import {
  generateWebhookSecret,
  isSafeWebhookTarget,
  type AffiliateWebhookEvent,
} from "@/lib/affiliates/notifications";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
} from "@/lib/security/requestSecurity";

export const dynamic = "force-dynamic";

const SUPPORTED_EVENTS: AffiliateWebhookEvent[] = [
  "conversion.approved",
  "conversion.reversed",
  "commission.available",
  "withdrawal.requested",
  "withdrawal.paid",
  "withdrawal.rejected",
  "level.up",
  // Emitido quando o nivel muda sem ser promocao (queda por volume menor no
  // mes). Faltava aqui, entao quem escolhia uma lista explicita de eventos nao
  // conseguia assinar e nunca receberia essa notificacao.
  "level.changed",
];

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
    action: "affiliate_settings_update",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 30,
    context: requestContext,
  });

  if (!rateLimit.ok) {
    const response = json(429, { ok: false, message: "Aguarde um instante e tente de novo." });
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

  // Estado atual: o POST e parcial, entao decisoes como "pode ativar?" dependem
  // do que ja estava gravado, nao so do que veio no corpo.
  const { data: currentSettings } = await supabaseAdmin
    .from("affiliate_settings")
    .select("webhook_url, webhook_secret")
    .eq("affiliate_id", gate.affiliate.id)
    .maybeSingle();

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("webhookUrl" in payload) {
    const url = String(payload.webhookUrl ?? "").trim();

    if (url) {
      if (!isSafeWebhookTarget(url)) {
        return attachRequestId(
          json(400, {
            ok: false,
            message:
              "Use um endereco https publico. Enderecos locais ou de rede interna nao sao aceitos.",
          }),
          requestContext.requestId,
        );
      }

      patch.webhook_url = url;
    } else {
      patch.webhook_url = null;
      patch.webhook_enabled = false;
    }
  }

  if ("webhookEnabled" in payload) {
    patch.webhook_enabled = payload.webhookEnabled === true;
  }

  // Ativar exige destino. Sem esta checagem, enviar webhookUrl vazio junto de
  // webhookEnabled true deixava o registro habilitado apontando para lugar
  // nenhum, e ainda gerava um segredo de assinatura para esse estado.
  const resolvedUrl =
    "webhook_url" in patch ? patch.webhook_url : currentSettings?.webhook_url;

  if (patch.webhook_enabled === true && !resolvedUrl) {
    return attachRequestId(
      json(400, {
        ok: false,
        message: "Informe o endereco do webhook antes de ativar as notificacoes.",
      }),
      requestContext.requestId,
    );
  }

  if ("webhookEvents" in payload) {
    const requested = Array.isArray(payload.webhookEvents)
      ? payload.webhookEvents.map((value) => String(value).trim())
      : [];

    const invalid = requested.filter(
      (event) => !SUPPORTED_EVENTS.includes(event as AffiliateWebhookEvent),
    );

    if (invalid.length > 0) {
      return attachRequestId(
        json(400, { ok: false, message: `Eventos desconhecidos: ${invalid.join(", ")}.` }),
        requestContext.requestId,
      );
    }

    patch.webhook_events = requested;
  }

  if ("notifyEmail" in payload) patch.notify_email = payload.notifyEmail === true;
  if ("notifySms" in payload) patch.notify_sms = payload.notifySms === true;
  if ("notifyPush" in payload) patch.notify_push = payload.notifyPush === true;

  if ("emailAddress" in payload) {
    const email = String(payload.emailAddress ?? "").trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return attachRequestId(
        json(400, { ok: false, message: "E-mail invalido." }),
        requestContext.requestId,
      );
    }
    patch.email_address = email || null;
  }

  if ("smsPhone" in payload) {
    const phone = String(payload.smsPhone ?? "").replace(/\D+/g, "");
    if (phone && (phone.length < 10 || phone.length > 13)) {
      return attachRequestId(
        json(400, { ok: false, message: "Telefone invalido. Use DDD + numero." }),
        requestContext.requestId,
      );
    }
    patch.sms_phone = phone || null;
  }

  const wantsRotation = payload.rotateWebhookSecret === true;
  // Gera o segredo na primeira vez que o webhook e ativado, ou quando pedido.
  const needsSecret = patch.webhook_enabled === true && !currentSettings?.webhook_secret;

  if (wantsRotation || needsSecret) {
    patch.webhook_secret = generateWebhookSecret();
  }

  const { data, error } = await supabaseAdmin
    .from("affiliate_settings")
    .upsert({ affiliate_id: gate.affiliate.id, ...patch }, { onConflict: "affiliate_id" })
    .select(
      "webhook_url, webhook_enabled, webhook_events, webhook_secret, notify_email, notify_sms, notify_push, email_address, sms_phone, updated_at",
    )
    .single();

  if (error) {
    console.error("[affiliates] falha ao salvar preferencias:", error);
    return attachRequestId(
      json(500, { ok: false, message: "Nao foi possivel salvar as preferencias." }),
      requestContext.requestId,
    );
  }

  return attachRequestId(
    json(200, {
      ok: true,
      settings: shapeSettings(data),
      // O segredo completo so aparece quando acabou de ser gerado, para o
      // afiliado copiar. Depois disso, so mascarado.
      revealedSecret: wantsRotation || needsSecret ? data.webhook_secret : undefined,
    }),
    requestContext.requestId,
  );
}

export async function GET() {
  const user = await getCurrentUserFromSessionCookie();
  if (!user) {
    return json(401, { ok: false, message: "Faca login para continuar." });
  }

  const gate = await requireActiveAffiliate(user.id);
  if (!gate.ok) {
    return json(gate.status, { ok: false, code: gate.code, message: gate.message });
  }

  const { data } = await supabaseAdmin
    .from("affiliate_settings")
    .select(
      "webhook_url, webhook_enabled, webhook_events, webhook_secret, notify_email, notify_sms, notify_push, email_address, sms_phone, updated_at",
    )
    .eq("affiliate_id", gate.affiliate.id)
    .maybeSingle();

  return json(200, {
    ok: true,
    settings: data ? shapeSettings(data) : null,
    supportedEvents: SUPPORTED_EVENTS,
  });
}

function shapeSettings(row: Record<string, unknown>) {
  const secret = String(row.webhook_secret ?? "");

  return {
    webhook_url: row.webhook_url ?? null,
    webhook_enabled: row.webhook_enabled === true,
    webhook_events: Array.isArray(row.webhook_events) ? row.webhook_events : [],
    webhook_secret_preview: secret ? `${secret.slice(0, 10)}...${secret.slice(-4)}` : null,
    notify_email: row.notify_email === true,
    notify_sms: row.notify_sms === true,
    notify_push: row.notify_push === true,
    email_address: row.email_address ?? null,
    sms_phone: row.sms_phone ?? null,
    updated_at: row.updated_at ?? null,
  };
}
