/**
 * Notificacoes do afiliado.
 *
 * A v1 guardava webhook_url e as flags de e-mail/SMS e nunca disparava nada.
 * Aqui o evento entra numa fila (affiliate_webhook_deliveries) e e entregue com
 * assinatura HMAC e retry exponencial, para que uma indisponibilidade do
 * destino nao perca o evento nem trave o fluxo de pagamento.
 */

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AffiliateWebhookEvent =
  | "conversion.approved"
  | "conversion.reversed"
  | "commission.available"
  | "withdrawal.requested"
  | "withdrawal.paid"
  | "withdrawal.rejected"
  | "level.up"
  | "level.changed";

const MAX_ATTEMPTS = 6;
const RETRY_BACKOFF_SECONDS = [60, 300, 1800, 7200, 21600, 86400];
const DELIVERY_TIMEOUT_MS = 10_000;

type QueueInput = {
  affiliateId: string;
  eventType: AffiliateWebhookEvent;
  payload: Record<string, unknown>;
};

/**
 * Enfileira um evento, se o afiliado tiver webhook ativo e assinar o evento.
 * Nunca lanca: notificacao nao pode derrubar o fluxo que a originou.
 */
export async function queueAffiliateWebhook(input: QueueInput): Promise<void> {
  try {
    const { data: settings, error } = await supabaseAdmin
      .from("affiliate_settings")
      .select("webhook_url, webhook_enabled, webhook_events")
      .eq("affiliate_id", input.affiliateId)
      .maybeSingle();

    if (error || !settings) return;

    const url = String(settings.webhook_url ?? "").trim();
    if (!settings.webhook_enabled || !url) return;
    if (!isSafeWebhookTarget(url)) {
      console.warn("[affiliates] webhook recusado por destino inseguro:", url);
      return;
    }

    const subscribed = Array.isArray(settings.webhook_events)
      ? (settings.webhook_events as string[])
      : [];

    // Lista vazia significa "todos os eventos".
    if (subscribed.length > 0 && !subscribed.includes(input.eventType)) {
      return;
    }

    await supabaseAdmin.from("affiliate_webhook_deliveries").insert([
      {
        affiliate_id: input.affiliateId,
        event_type: input.eventType,
        payload: input.payload,
        target_url: url,
      },
    ]);
  } catch (caught) {
    console.error("[affiliates] falha ao enfileirar webhook:", caught);
  }
}

/**
 * Recusa destinos que apontem para a rede interna.
 *
 * Sem isso, um afiliado poderia cadastrar http://169.254.169.254/ e usar o
 * nosso servidor para ler metadados da infraestrutura (SSRF).
 */
export function isSafeWebhookTarget(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return false;
  }

  // Faixas privadas e link-local.
  if (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^127\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }

  return true;
}

export function signWebhookPayload(body: string, secret: string, timestamp: number) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/**
 * Entrega os webhooks pendentes. Deve ser chamada por um cron.
 * Retorna o que aconteceu para o job poder logar.
 */
export async function dispatchPendingWebhooks(limit = 50) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("affiliate_webhook_deliveries")
    .select("id, affiliate_id, event_type, payload, target_url, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[affiliates] falha ao ler fila de webhooks:", error);
    return { delivered: 0, failed: 0, abandoned: 0 };
  }

  let delivered = 0;
  let failed = 0;
  let abandoned = 0;

  for (const delivery of data || []) {
    const outcome = await attemptDelivery(delivery);
    if (outcome === "delivered") delivered += 1;
    else if (outcome === "abandoned") abandoned += 1;
    else failed += 1;
  }

  return { delivered, failed, abandoned };
}

type DeliveryRow = {
  id: string;
  affiliate_id: string;
  event_type: string;
  payload: unknown;
  target_url: string;
  attempts: number;
};

async function attemptDelivery(delivery: DeliveryRow): Promise<"delivered" | "failed" | "abandoned"> {
  const { data: settings } = await supabaseAdmin
    .from("affiliate_settings")
    .select("webhook_secret")
    .eq("affiliate_id", delivery.affiliate_id)
    .maybeSingle();

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event: delivery.event_type,
    sentAt: new Date(timestamp * 1000).toISOString(),
    data: delivery.payload ?? {},
  });

  const secret = String(settings?.webhook_secret ?? "").trim();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "Flowdesk-Affiliates/1.0",
    "x-flowdesk-event": delivery.event_type,
    "x-flowdesk-timestamp": String(timestamp),
  };

  if (secret) {
    headers["x-flowdesk-signature"] = `sha256=${signWebhookPayload(body, secret, timestamp)}`;
  }

  const attempts = delivery.attempts + 1;
  let statusCode: number | null = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const response = await fetch(delivery.target_url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "error",
    });

    clearTimeout(timeoutId);
    statusCode = response.status;

    if (response.ok) {
      await supabaseAdmin
        .from("affiliate_webhook_deliveries")
        .update({
          status: "delivered",
          attempts,
          last_status_code: statusCode,
          last_error: null,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      return "delivered";
    }

    errorMessage = `HTTP ${response.status}`;
  } catch (caught) {
    errorMessage = caught instanceof Error ? caught.message : "Falha de rede";
  }

  const exhausted = attempts >= MAX_ATTEMPTS;
  const backoffSeconds =
    RETRY_BACKOFF_SECONDS[Math.min(attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)];

  await supabaseAdmin
    .from("affiliate_webhook_deliveries")
    .update({
      status: exhausted ? "abandoned" : "pending",
      attempts,
      last_status_code: statusCode,
      last_error: errorMessage,
      next_attempt_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
    })
    .eq("id", delivery.id);

  return exhausted ? "abandoned" : "failed";
}

/** Gera um segredo de webhook para o afiliado assinar as entregas. */
export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}
