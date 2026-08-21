import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  fetchMercadoPagoPaymentById,
  type MercadoPagoPaymentResponse,
} from "@/lib/payments/mercadoPago";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type PaymentReceiptOrderRow = {
  id: number;
  user_id: number;
  payment_method: string | null;
  status: string | null;
  provider_payment_id: string | null;
  provider_ticket_url: string | null;
  provider_payload: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNestedString(source: unknown, path: string[]) {
  let cursor = source;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : null;
}

function normalizeMercadoPagoReceiptUrl(value: string | null | undefined) {
  if (!value?.trim()) return null;

  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase();
    const trusted =
      /(^|\.)mercadopago\.(com|com\.ar|com\.br|cl|co|com\.mx|com\.uy|com\.pe|com\.ec|com\.ve)$/i.test(hostname) ||
      /(^|\.)mercadolibre\.(com|com\.ar|com\.br|cl|co|com\.mx|com\.uy|com\.pe|com\.ec|com\.ve)$/i.test(hostname);

    if (parsed.protocol !== "https:" || !trusted) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractReceiptUrlFromPayment(payment: MercadoPagoPaymentResponse | null | undefined) {
  return (
    normalizeMercadoPagoReceiptUrl(
      payment?.point_of_interaction?.transaction_data?.ticket_url,
    ) ||
    normalizeMercadoPagoReceiptUrl(
      readNestedString(payment?.transaction_details, ["external_resource_url"]),
    )
  );
}

function extractReceiptUrlFromPayload(payload: unknown) {
  return (
    normalizeMercadoPagoReceiptUrl(
      readNestedString(payload, ["point_of_interaction", "transaction_data", "ticket_url"]),
    ) ||
    normalizeMercadoPagoReceiptUrl(
      readNestedString(payload, ["transaction_details", "external_resource_url"]),
    )
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  const { orderId } = await context.params;
  const numericOrderId = Number(orderId);
  if (!Number.isSafeInteger(numericOrderId) || numericOrderId <= 0) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Pedido invalido." }, { status: 400 }),
    );
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("payment_orders")
    .select("id, user_id, payment_method, status, provider_payment_id, provider_ticket_url, provider_payload")
    .eq("id", numericOrderId)
    .eq("user_id", session.user.id)
    .maybeSingle<PaymentReceiptOrderRow>();

  if (result.error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Falha ao localizar o comprovante." }, { status: 500 }),
    );
  }
  if (!result.data) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Comprovante nao encontrado." }, { status: 404 }),
    );
  }

  const order = result.data;
  const storedUrl =
    normalizeMercadoPagoReceiptUrl(order.provider_ticket_url) ||
    extractReceiptUrlFromPayload(order.provider_payload);
  if (storedUrl) {
    return applyNoStoreHeaders(NextResponse.redirect(storedUrl, 302));
  }

  if (!order.provider_payment_id) {
    return applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: "Mercado Pago ainda nao disponibilizou comprovante para este pedido." },
        { status: 404 },
      ),
    );
  }

  try {
    const payment = await fetchMercadoPagoPaymentById(order.provider_payment_id, {
      useCardToken: order.payment_method === "card",
      forceFresh: true,
    });
    const receiptUrl = extractReceiptUrlFromPayment(payment);
    if (!receiptUrl) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Mercado Pago ainda nao disponibilizou comprovante para este pedido." },
          { status: 404 },
        ),
      );
    }

    return applyNoStoreHeaders(NextResponse.redirect(receiptUrl, 302));
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Falha ao consultar o comprovante no Mercado Pago." }, { status: 502 }),
    );
  }
}
