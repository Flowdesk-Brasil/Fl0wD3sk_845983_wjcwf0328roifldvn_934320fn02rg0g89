import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  applySalesCartDiscount,
  createSalesCartPixPayment,
  resolveActiveMercadoPagoConfig,
  syncSalesCartPayment,
} from "@/lib/sales/checkoutRuntime";
import {
  createSalesMercadoPagoPixPayment,
  fetchSalesMercadoPagoPaymentById,
  resolveSalesMercadoPagoStatus,
  toSalesQrDataUri,
} from "@/lib/sales/mercadoPago";
import { extractAuditErrorMessage } from "@/lib/security/errors";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { hasSecureInternalTokenAuth } from "@/lib/security/internalTokens";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

const INTERNAL_SALES_ACTIONS = [
  "create_pix_payment",
  "sync_payment",
  "apply_discount",
  "create_ticket_pix_payment",
  "sync_ticket_payment",
] as const;

function resolveInternalSalesToken() {
  return (
    process.env.SALES_INTERNAL_API_TOKEN ||
    process.env.FLOWAI_INTERNAL_API_TOKEN ||
    process.env.CRON_SECRET ||
    ""
  ).trim();
}

function isAuthorized(request: Request) {
  return hasSecureInternalTokenAuth({
    request,
    expectedTokens: [resolveInternalSalesToken()],
    headerNames: ["x-flowdesk-internal-token", "x-sales-internal-token"],
    allowDevWithoutToken: true,
  });
}

const SAFE_CHECKOUT_ERROR_FRAGMENTS = [
  "carrinho",
  "compra",
  "login",
  "flowdesk",
  "email valido",
  "produto",
  "estoque",
  "valor",
  "pix",
  "mercado pago",
  "credenciais",
  "pagamento",
  "metodo",
  "servidor",
  "cupom",
  "gift",
  "desconto",
];

function resolveCheckoutErrorMessage(error: unknown) {
  const message = extractAuditErrorMessage(error, "Erro interno no checkout de vendas.");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("schema cache") ||
    normalized.includes("column") ||
    normalized.includes("does not exist")
  ) {
    return "Checkout de vendas em atualizacao. Rode a migration 116 e tente novamente.";
  }

  if (SAFE_CHECKOUT_ERROR_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
    return message;
  }

  return "Erro interno no checkout de vendas.";
}

function normalizeGuildId(value: unknown) {
  if (typeof value !== "string") return null;
  const guildId = value.trim();
  return /^\d{10,25}$/.test(guildId) ? guildId : null;
}

function normalizeSnowflake(value: unknown) {
  if (typeof value !== "string") return null;
  const snowflake = value.trim();
  return /^\d{10,25}$/.test(snowflake) ? snowflake : null;
}

function normalizeTicketText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeTicketPaymentAmount(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(/\./g, "").replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric * 100) / 100;
  if (rounded < 1) return null;
  if (rounded > 50000) return null;
  return rounded;
}

async function loadSalesLogChannels(guildId: string) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("guild_sales_settings")
    .select(
      "payment_approved_log_channel_id, payment_pending_log_channel_id, payment_rejected_log_channel_id",
    )
    .eq("guild_id", guildId)
    .maybeSingle<{
      payment_approved_log_channel_id: string | null;
      payment_pending_log_channel_id: string | null;
      payment_rejected_log_channel_id: string | null;
    }>();

  if (result.error) throw new Error(result.error.message);

  return {
    approvedLogChannelId: result.data?.payment_approved_log_channel_id || null,
    pendingLogChannelId: result.data?.payment_pending_log_channel_id || null,
    rejectedLogChannelId: result.data?.payment_rejected_log_channel_id || null,
  };
}

function toTicketPaymentApiPayload(payment: Awaited<ReturnType<typeof createSalesMercadoPagoPixPayment>>) {
  const transactionData = payment.point_of_interaction?.transaction_data || null;
  return {
    providerPaymentId: String(payment.id),
    status: resolveSalesMercadoPagoStatus(payment.status),
    providerStatus: payment.status || null,
    providerStatusDetail: payment.status_detail || null,
    amount: Number(payment.transaction_amount || 0),
    qrCode: transactionData?.qr_code || null,
    qrBase64: transactionData?.qr_code_base64 || null,
    qrDataUri: toSalesQrDataUri(transactionData?.qr_code_base64),
    ticketUrl: transactionData?.ticket_url || null,
    externalReference: payment.external_reference || null,
    expiresAt: payment.date_of_expiration || null,
    approvedAt: payment.date_approved || null,
  };
}

async function createTicketPixPayment(payload: Record<string, unknown>) {
  const guildId = normalizeGuildId(payload.guildId);
  const amount = normalizeTicketPaymentAmount(payload.amount);
  const ticketId = normalizeTicketText(payload.ticketId, 64);
  const protocol = normalizeTicketText(payload.protocol, 80);
  const discordUserId = normalizeSnowflake(payload.discordUserId);
  const requestedBy = normalizeSnowflake(payload.requestedBy);
  const payerName =
    normalizeTicketText(payload.payerName, 120) ||
    (discordUserId ? `Discord ${discordUserId}` : "Cliente Flowdesk");

  if (!guildId) throw new Error("Guild ID invalido para pagamento de ticket.");
  if (!amount) throw new Error("Valor invalido. Informe R$ 1,00 ou mais.");
  if (!ticketId || !protocol || !discordUserId || !requestedBy) {
    throw new Error("Dados do ticket incompletos para gerar pagamento.");
  }

  const mercadoPagoConfig = await resolveActiveMercadoPagoConfig(guildId);
  const externalReference = `flowdesk-ticket-${ticketId}-${crypto.randomBytes(6).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const payment = await createSalesMercadoPagoPixPayment({
    accessToken: mercadoPagoConfig.accessToken,
    environment: mercadoPagoConfig.environment,
    amount,
    description: `Flowdesk ticket ${protocol}`,
    payerEmail: `discord-${discordUserId}@flowdeskbot.app`,
    payerName,
    externalReference,
    expiresAt,
    metadata: {
      flowdesk_source: "ticket",
      flowdesk_guild_id: guildId,
      flowdesk_ticket_id: ticketId,
      flowdesk_protocol: protocol,
      flowdesk_discord_user_id: discordUserId,
      flowdesk_requested_by: requestedBy,
    },
    idempotencyKey: crypto
      .createHash("sha256")
      .update(["flowdesk-ticket-pix", guildId, ticketId, externalReference, amount].join(":"))
      .digest("hex"),
  });

  return {
    payment: toTicketPaymentApiPayload(payment),
    logs: await loadSalesLogChannels(guildId),
  };
}

async function syncTicketPixPayment(payload: Record<string, unknown>) {
  const guildId = normalizeGuildId(payload.guildId);
  const paymentId = normalizeTicketText(payload.paymentId, 80);
  if (!guildId || !paymentId) {
    throw new Error("Dados incompletos para sincronizar pagamento do ticket.");
  }

  const mercadoPagoConfig = await resolveActiveMercadoPagoConfig(guildId);
  const payment = await fetchSalesMercadoPagoPaymentById({
    accessToken: mercadoPagoConfig.accessToken,
    paymentId,
  });

  return {
    payment: toTicketPaymentApiPayload(payment),
    logs: await loadSalesLogChannels(guildId),
  };
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 }),
      );
    }

    const rawPayload = await request.json().catch(() => ({}));
    let payload: {
      action: (typeof INTERNAL_SALES_ACTIONS)[number];
      cartId?: string | undefined;
      code?: string | undefined;
    } & Record<string, unknown>;
    try {
      const parsedPayload = parseFlowSecureDto(
        rawPayload,
        {
          action: flowSecureDto.enum(INTERNAL_SALES_ACTIONS),
          cartId: flowSecureDto.optional(
            flowSecureDto.string({
              maxLength: 64,
              pattern:
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
              disallowAngleBrackets: true,
            }),
          ),
          code: flowSecureDto.optional(
            flowSecureDto.string({
              maxLength: 80,
              normalizeWhitespace: true,
              disallowAngleBrackets: true,
            }),
          ),
        },
        { rejectUnknown: false },
      );
      payload = {
        ...(rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
          ? rawPayload
          : {}),
        ...parsedPayload,
      };
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) {
        throw error;
      }

      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    if (payload.action === "create_pix_payment") {
      if (!payload.cartId) {
        return applyNoStoreHeaders(
          NextResponse.json({ ok: false, message: "Carrinho obrigatorio." }, { status: 400 }),
        );
      }
      const result = await createSalesCartPixPayment(payload.cartId);
      return applyNoStoreHeaders(NextResponse.json({ ok: true, ...result }));
    }

    if (payload.action === "sync_payment") {
      if (!payload.cartId) {
        return applyNoStoreHeaders(
          NextResponse.json({ ok: false, message: "Carrinho obrigatorio." }, { status: 400 }),
        );
      }
      const result = await syncSalesCartPayment(payload.cartId);
      return applyNoStoreHeaders(NextResponse.json({ ok: true, ...result }));
    }

    if (payload.action === "create_ticket_pix_payment") {
      const result = await createTicketPixPayment(payload);
      return applyNoStoreHeaders(NextResponse.json({ ok: true, ...result }));
    }

    if (payload.action === "sync_ticket_payment") {
      const result = await syncTicketPixPayment(payload);
      return applyNoStoreHeaders(NextResponse.json({ ok: true, ...result }));
    }

    if (!payload.cartId) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Carrinho obrigatorio." }, { status: 400 }),
      );
    }
    const result = await applySalesCartDiscount({
      cartId: payload.cartId,
      code: payload.code || "",
    });
    return applyNoStoreHeaders(NextResponse.json({ ok: true, ...result }));
  } catch (error) {
    console.error("[internal-sales-discord] checkout failed", error);
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: resolveCheckoutErrorMessage(error),
        },
        { status: 500 },
      ),
    );
  }
}
