import "server-only";

import crypto from "node:crypto";

export type MercadoPagoPayment = {
  id: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  date_approved?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

function accessToken() {
  const token = process.env.MERCADO_PAGO_PIX_ACCESS_TOKEN?.trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado.");
  return token;
}

async function requestMercadoPago<T>(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(payload.message || payload.error || `Mercado Pago respondeu com status ${response.status}.`);
  return payload;
}

export async function createMercadoPagoPix(input: {
  paymentId: string;
  amount: number;
  description: string;
  payerName: string;
  payerEmail: string;
  payerCpf: string;
  notificationUrl: string;
}) {
  const names = input.payerName.trim().split(/\s+/);
  return requestMercadoPago<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": `corpo-evolucao-${input.paymentId}` },
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.description.slice(0, 250),
      payment_method_id: "pix",
      external_reference: input.paymentId,
      notification_url: input.notificationUrl,
      date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: { studio: "corpo_evolucao", payment_id: input.paymentId },
      payer: {
        email: input.payerEmail,
        first_name: names[0] || "Aluno",
        last_name: names.slice(1).join(" ") || undefined,
        identification: { type: "CPF", number: input.payerCpf.replace(/\D/g, "") },
      },
    }),
  });
}

export function fetchMercadoPagoPayment(id: string) {
  return requestMercadoPago<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(id)}`);
}

function timingSafeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyMercadoPagoWebhook(request: Request, paymentId: string | null) {
  const url = new URL(request.url);
  const legacy = process.env.MERCADO_PAGO_WEBHOOK_TOKEN?.trim();
  const receivedLegacy = url.searchParams.get("token")?.trim() || request.headers.get("x-webhook-token")?.trim();
  if (legacy && receivedLegacy && timingSafeEqual(legacy, receivedLegacy)) return true;

  const secret = process.env.MERCADO_PAGO_WEBHOOK_SIGNATURE_SECRET?.trim() || process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=")));
  const timestamp = parts.ts;
  const received = parts.v1?.toLowerCase();
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || paymentId || "";
  if (!secret || !timestamp || !received || !requestId || !dataId) return process.env.NODE_ENV !== "production" && !legacy && !secret;
  const signatureTime = Number(timestamp);
  if (!Number.isFinite(signatureTime) || Date.now() - signatureTime * 1000 > 5 * 60 * 1000) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return timingSafeEqual(expected, received);
}
