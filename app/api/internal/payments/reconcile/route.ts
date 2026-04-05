import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  getPaymentOrderByOrderNumber,
  getPaymentOrderByProviderPaymentId,
  reconcilePaymentOrderRecord,
  reconcileRecentPaymentOrders,
} from "@/lib/payments/reconciliation";
import {
  sanitizeErrorMessage,
} from "@/lib/security/errors";
import { applyNoStoreHeaders } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
} from "@/lib/security/requestSecurity";

type ReconcileRequestPayload = {
  orderNumber?: unknown;
  limit?: unknown;
  providerPaymentId?: unknown;
  guildId?: unknown;
};

function resolveAllowedReconcileTokens() {
  return [process.env.PAYMENT_RECONCILE_TOKEN, process.env.CRON_SECRET]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function secureTokenEquals(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function allowInternalReconcileGet() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_INTERNAL_RECONCILE_GET === "1"
  );
}

function allowInternalReconcileQueryToken() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_INTERNAL_RECONCILE_QUERY_TOKEN === "1"
  );
}

function getCandidateTokens(request: Request, url: URL) {
  const authorization = request.headers.get("authorization") || "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  const bearerToken = bearerMatch?.[1]?.trim() || "";
  const headerToken = request.headers.get("x-reconcile-token")?.trim() || "";

  const tokens = [bearerToken, headerToken];

  if (allowInternalReconcileQueryToken()) {
    const queryToken = url.searchParams.get("token")?.trim() || "";
    tokens.push(queryToken);
  }

  return tokens.filter(Boolean);
}

function isAuthorized(request: Request, url: URL) {
  const expectedTokens = resolveAllowedReconcileTokens();
  if (expectedTokens.length === 0) return false;

  const candidates = getCandidateTokens(request, url);
  return candidates.some((candidate) =>
    expectedTokens.some((expectedToken) =>
      secureTokenEquals(expectedToken, candidate),
    ),
  );
}

function parsePositiveInt(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function parseNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

async function readPayload(request: Request) {
  if (request.method.toUpperCase() !== "POST") {
    return null;
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return (await request.json()) as ReconcileRequestPayload;
  } catch {
    return null;
  }
}

async function handleReconcile(request: Request, requestId: string) {
  const respond = (body: unknown, init?: ResponseInit) =>
    attachRequestId(
      applyNoStoreHeaders(NextResponse.json(body, init)),
      requestId,
    );
  const expectedTokens = resolveAllowedReconcileTokens();

  if (expectedTokens.length === 0) {
    return respond(
      {
        ok: false,
        message:
          "PAYMENT_RECONCILE_TOKEN/CRON_SECRET nao configurado no ambiente para reconciliacao protegida.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  if (!isAuthorized(request, url)) {
    return respond(
      { ok: false, message: "Reconciliacao nao autorizada." },
      { status: 401 },
    );
  }

  const body = await readPayload(request);
  const orderNumber =
    parsePositiveInt(body?.orderNumber) ||
    parsePositiveInt(url.searchParams.get("orderNumber"));
  const limit =
    parsePositiveInt(body?.limit) ||
    parsePositiveInt(url.searchParams.get("limit")) ||
    25;
  const providerPaymentId =
    parseNullableString(body?.providerPaymentId) ||
    parseNullableString(url.searchParams.get("providerPaymentId"));
  const guildId =
    parseNullableString(body?.guildId) ||
    parseNullableString(url.searchParams.get("guildId"));

  if (orderNumber) {
    const order = await getPaymentOrderByOrderNumber(orderNumber);
    if (!order) {
      return respond(
        { ok: false, message: "Pedido nao encontrado para reconciliacao." },
        { status: 404 },
      );
    }

    const result = await reconcilePaymentOrderRecord(order, {
      source: "internal_reconcile_order_number",
    });

    return respond({
      ok: true,
      mode: "single",
      by: "order_number",
      result,
    });
  }

  if (providerPaymentId) {
    const order = await getPaymentOrderByProviderPaymentId(providerPaymentId);
    if (!order) {
      return respond(
        { ok: false, message: "Pedido nao encontrado para provider_payment_id." },
        { status: 404 },
      );
    }

    const result = await reconcilePaymentOrderRecord(order, {
      source: "internal_reconcile_provider_payment",
    });

    return respond({
      ok: true,
      mode: "single",
      by: "provider_payment_id",
      result,
    });
  }

  const summary = await reconcileRecentPaymentOrders({
    limit,
    guildId,
    source: "internal_reconcile_batch",
  });

  return respond({
    ok: true,
    mode: "batch",
    summary,
  });
}

export async function GET(request: Request) {
  const requestContext = createSecurityRequestContext(request);

  if (!allowInternalReconcileGet()) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "GET desabilitado para reconciliacao interna. Use POST com token em cabecalho.",
          },
          { status: 405 },
        ),
      ),
      requestContext.requestId,
    );
  }

  try {
    return await handleReconcile(request, requestContext.requestId);
  } catch (error) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: sanitizeErrorMessage(
              error,
              "Erro ao executar reconciliacao de pagamentos.",
            ),
          },
          { status: 500 },
        ),
      ),
      requestContext.requestId,
    );
  }
}

export async function POST(request: Request) {
  const requestContext = createSecurityRequestContext(request);

  try {
    return await handleReconcile(request, requestContext.requestId);
  } catch (error) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: sanitizeErrorMessage(
              error,
              "Erro ao executar reconciliacao de pagamentos.",
            ),
            requestId: requestContext.requestId,
          },
          { status: 500 },
        ),
      ),
      requestContext.requestId,
    );
  }
}
