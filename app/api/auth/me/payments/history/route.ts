import { NextResponse } from "next/server";
import { resolveSessionAccessToken } from "@/lib/auth/discordGuildAccess";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type PaymentOrderStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "failed";

type PaymentMethod = "pix" | "card";

type PaymentOrderRecord = {
  id: number;
  order_number: number;
  guild_id: string;
  payment_method: PaymentMethod;
  status: PaymentOrderStatus;
  amount: string | number;
  currency: string;
  provider_status: string | null;
  provider_status_detail: string | null;
  provider_payload: unknown;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type CardSnapshot = {
  brand: string | null;
  firstSix: string | null;
  lastFour: string | null;
  expMonth: number | null;
  expYear: number | null;
};

const PAYMENT_HISTORY_SELECT_COLUMNS =
  "id, order_number, guild_id, payment_method, status, amount, currency, provider_status, provider_status_detail, provider_payload, paid_at, expires_at, created_at, updated_at";

function toFiniteAmount(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumericString(value: unknown, maxLength = 20) {
  const text = asString(value);
  if (!text) return null;
  if (!new RegExp(`^\\d{1,${maxLength}}$`).test(text)) return null;
  return text;
}

function asNumberOrNull(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCardBrand(rawBrand: string | null) {
  if (!rawBrand) return null;
  const normalized = rawBrand.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("visa")) return "visa";
  if (normalized.includes("master")) return "mastercard";
  if (normalized.includes("amex") || normalized.includes("american")) return "amex";
  if (normalized.includes("elo")) return "elo";
  return normalized;
}

function extractCardSnapshot(providerPayload: unknown): CardSnapshot {
  const root = asRecord(providerPayload);
  const mercadoPago = asRecord(root?.mercado_pago);
  const card = asRecord(mercadoPago?.card);

  const rawBrand =
    asString(mercadoPago?.payment_method_id) ||
    asString(card?.payment_method_id) ||
    asString(card?.brand);

  const firstSix = asNumericString(card?.first_six_digits, 6);
  const lastFour = asNumericString(card?.last_four_digits, 4);
  const expMonth = asNumberOrNull(card?.expiration_month);
  const expYear = asNumberOrNull(card?.expiration_year);

  return {
    brand: normalizeCardBrand(rawBrand),
    firstSix,
    lastFour,
    expMonth,
    expYear,
  };
}

function toHistoryOrder(order: PaymentOrderRecord) {
  const card = order.payment_method === "card" ? extractCardSnapshot(order.provider_payload) : null;

  return {
    id: order.id,
    orderNumber: order.order_number,
    guildId: order.guild_id,
    method: order.payment_method,
    status: order.status,
    amount: toFiniteAmount(order.amount),
    currency: order.currency,
    providerStatus: order.provider_status,
    providerStatusDetail: order.provider_status_detail,
    card,
    paidAt: order.paid_at,
    expiresAt: order.expires_at,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

function buildSavedMethods(orders: ReturnType<typeof toHistoryOrder>[]) {
  const methodMap = new Map<
    string,
    {
      brand: string | null;
      firstSix: string;
      lastFour: string;
      expMonth: number | null;
      expYear: number | null;
      lastUsedAt: string;
      timesUsed: number;
    }
  >();

  for (const order of orders) {
    if (order.method !== "card" || !order.card) continue;
    if (!order.card.firstSix || !order.card.lastFour) continue;

    const key = [
      order.card.brand || "card",
      order.card.firstSix,
      order.card.lastFour,
      order.card.expMonth ?? "",
      order.card.expYear ?? "",
    ].join(":");

    const current = methodMap.get(key);
    if (!current) {
      methodMap.set(key, {
        brand: order.card.brand,
        firstSix: order.card.firstSix,
        lastFour: order.card.lastFour,
        expMonth: order.card.expMonth,
        expYear: order.card.expYear,
        lastUsedAt: order.createdAt,
        timesUsed: 1,
      });
      continue;
    }

    const nextLastUsedAt =
      Date.parse(order.createdAt) > Date.parse(current.lastUsedAt)
        ? order.createdAt
        : current.lastUsedAt;

    methodMap.set(key, {
      ...current,
      lastUsedAt: nextLastUsedAt,
      timesUsed: current.timesUsed + 1,
    });
  }

  return Array.from(methodMap.entries())
    .map(([id, value]) => ({
      id,
      brand: value.brand,
      firstSix: value.firstSix,
      lastFour: value.lastFour,
      expMonth: value.expMonth,
      expYear: value.expYear,
      lastUsedAt: value.lastUsedAt,
      timesUsed: value.timesUsed,
    }))
    .sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
}

export async function GET() {
  try {
    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession) {
      return NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const result = await supabase
      .from("payment_orders")
      .select(PAYMENT_HISTORY_SELECT_COLUMNS)
      .eq("user_id", sessionData.authSession.user.id)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<PaymentOrderRecord[]>();

    if (result.error) {
      throw new Error(result.error.message);
    }

    const orders = (result.data || []).map(toHistoryOrder);
    const methods = buildSavedMethods(orders);

    return NextResponse.json({
      ok: true,
      orders,
      methods,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao carregar historico de pagamentos.",
      },
      { status: 500 },
    );
  }
}

