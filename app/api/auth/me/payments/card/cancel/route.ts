import { NextResponse } from "next/server";
import { cancelMercadoPagoCardPayment } from "@/lib/payments/mercadoPago";
import { ensureCheckoutAccessTokenForOrder } from "@/lib/payments/checkoutLinkSecurity";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  extendSecurityRequestContext,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";
import {
  resolveDatabaseFailureMessage,
  resolveDatabaseFailureStatus,
} from "@/lib/security/databaseAvailability";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  createPaymentOrderEventSafe,
  ensureGuildAccess,
  getOrderByCodeForUserAndGuild,
  invalidatePaymentReadCachesForOrder,
  normalizeGuildId,
  PAYMENT_ORDER_SELECT_COLUMNS,
  toApiOrder,
  type PaymentOrderRecord,
} from "../../pix/route";

type CancelCardCheckoutBody = {
  guildId?: unknown;
  orderNumber?: unknown;
};

function normalizeOrderNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d{1,12}$/.test(trimmed)) return null;
    const numeric = Number(trimmed);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }

  return null;
}

export async function POST(request: Request) {
  const requestContext = createSecurityRequestContext(request);
  let auditContext = requestContext;
  const respond = (body: unknown, init?: ResponseInit) =>
    attachRequestId(
      applyNoStoreHeaders(NextResponse.json(body, init)),
      requestContext.requestId,
    );

  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) {
      return attachRequestId(
        applyNoStoreHeaders(originGuard),
        requestContext.requestId,
      );
    }

    let body: CancelCardCheckoutBody = {};
    try {
      body = (await request.json()) as CancelCardCheckoutBody;
    } catch {
      return respond(
        { ok: false, message: "Payload JSON invalido." },
        { status: 400 },
      );
    }

    const guildId = normalizeGuildId(body.guildId);
    const orderNumber = normalizeOrderNumber(body.orderNumber);
    if (!orderNumber) {
      return respond(
        { ok: false, message: "Pedido invalido para cancelamento." },
        { status: 400 },
      );
    }

    const access = await ensureGuildAccess(guildId);
    if (!access.ok) {
      return attachRequestId(
        applyNoStoreHeaders(access.response),
        requestContext.requestId,
      );
    }

    auditContext = extendSecurityRequestContext(requestContext, {
      sessionId: access.context.sessionData.authSession.id,
      userId: access.context.sessionData.authSession.user.id,
      guildId,
    });

    const lookup = await getOrderByCodeForUserAndGuild(
      access.context.sessionData.authSession.user.id,
      guildId,
      orderNumber,
    );

    if (!lookup.order) {
      return respond(
        {
          ok: false,
          message: lookup.foreignOwner
            ? "Esse checkout pertence a outra conta autenticada."
            : "Pedido nao encontrado para cancelamento.",
        },
        { status: lookup.foreignOwner ? 403 : 404 },
      );
    }

    const order = lookup.order;
    if (order.payment_method !== "card") {
      return respond(
        {
          ok: false,
          message: "Apenas checkouts com cartao podem ser cancelados aqui.",
        },
        { status: 409 },
      );
    }

    if (order.status !== "pending") {
      const securedOrder = await ensureCheckoutAccessTokenForOrder({
        order,
        forceRotate: false,
        invalidateOtherOrders: false,
      });

      return respond({
        ok: true,
        order: toApiOrder(
          securedOrder.order,
          securedOrder.checkoutAccessToken,
        ),
      });
    }

    if (order.provider_payment_id) {
      try {
        await cancelMercadoPagoCardPayment(order.provider_payment_id);
      } catch {
        // melhor esforco; ainda encerramos o checkout local para o usuario sair do loop
      }
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const cancelledOrderResult = await supabase
      .from("payment_orders")
      .update({
        status: "cancelled",
        provider_status: "cancelled",
        provider_status_detail: "cancelled_by_user",
      })
      .eq("id", order.id)
      .eq("status", "pending")
      .select(PAYMENT_ORDER_SELECT_COLUMNS)
      .single<PaymentOrderRecord>();

    if (cancelledOrderResult.error || !cancelledOrderResult.data) {
      throw new Error(
        cancelledOrderResult.error?.message ||
          "Falha ao cancelar checkout com cartao.",
      );
    }

    invalidatePaymentReadCachesForOrder(cancelledOrderResult.data);
    await createPaymentOrderEventSafe(
      cancelledOrderResult.data.id,
      "hosted_card_checkout_cancelled",
      {
        orderNumber: cancelledOrderResult.data.order_number,
        providerPaymentId: cancelledOrderResult.data.provider_payment_id,
      },
    );

    const securedOrder = await ensureCheckoutAccessTokenForOrder({
      order: cancelledOrderResult.data,
      forceRotate: false,
      invalidateOtherOrders: false,
    });

    await logSecurityAuditEventSafe(auditContext, {
      action: "payment_card_cancel_post",
      outcome: "succeeded",
      metadata: {
        orderNumber: securedOrder.order.order_number,
      },
    });

    return respond({
      ok: true,
      order: toApiOrder(securedOrder.order, securedOrder.checkoutAccessToken),
    });
  } catch (error) {
    await logSecurityAuditEventSafe(auditContext, {
      action: "payment_card_cancel_post",
      outcome: "failed",
      metadata: {
        message: sanitizeErrorMessage(
          error,
          "Erro ao cancelar checkout com cartao.",
        ),
      },
    });

    return respond(
      {
        ok: false,
        message: resolveDatabaseFailureMessage(
          error,
          sanitizeErrorMessage(error, "Erro ao cancelar checkout com cartao."),
        ),
      },
      { status: resolveDatabaseFailureStatus(error) },
    );
  }
}
