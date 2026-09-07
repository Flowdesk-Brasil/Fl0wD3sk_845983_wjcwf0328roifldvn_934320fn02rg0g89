import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { getEffectiveDashboardPermissions, type TeamRolePermission } from "@/lib/teams/userTeams";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import {
  readPanelResponseCache,
  writePanelResponseCache,
} from "@/lib/servers/panelResponseCache";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type CartRow = {
  id: string;
  status: string | null;
  total_amount: string | number | null;
  currency: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string | null;
  paid_at: string | null;
  payment_expires_at: string | null;
  provider_status: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  selected_payment_method_key: string | null;
  discount_code: string | null;
};

type TicketRow = {
  id: string | number;
  status: string | null;
  created_at: string | null;
  user_id?: string | null;
};

type EventRow = {
  event_type: string | null;
  created_at: string | null;
  discord_user_id: string | null;
};

type OverviewPayload = {
  ok: true;
  stats: {
    receivable: number;
    receivableCount: number;
    received: number;
    receivedCount: number;
    receivedThisMonth: number;
    overdue: number;
    overdueCount: number;
    cancelledCount: number;
    openTickets: number;
  };
  chart: Array<{ key: string; label: string; received: number; forecast: number }>;
  charges: Array<Record<string, unknown>>;
  upcoming: Array<{ id: string; name: string; detail: string; initials: string }>;
  tickets: Array<{ id: string; title: string; meta: string }>;
  activity: Array<{ title: string; meta: string; at: string | null }>;
};

const OVERVIEW_CACHE_TTL_MS = 18_000;

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function isReceived(status: string) {
  return ["paid", "delivered", "approved", "completed", "success"].includes(status);
}

function isCancelled(status: string) {
  return [
    "cancelled",
    "canceled",
    "expired",
    "refunded",
    "failed",
    "rejected",
    "delivery_failed",
    "charged_back",
  ].includes(status);
}

function isOpen(status: string) {
  return Boolean(status) && !isReceived(status) && !isCancelled(status);
}

function invoiceCode(id: string, createdAt: string | null) {
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const suffix = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "000000";
  return `INV-${year}-${suffix.padStart(6, "0")}`;
}

function paymentMethodLabel(key: string | null | undefined) {
  const labels: Record<string, string> = {
    mercado_pago: "Mercado Pago",
    flowpay: "FlowPay",
    card: "Cartao de credito",
    boleto: "Boleto bancario",
    paypal: "PayPal",
    nupay: "NuPay",
  };
  if (!key) return "Nao informado";
  return labels[key] || key.replace(/_/g, " ");
}

function rawStatusLabel(status: string) {
  const labels: Record<string, string> = {
    paid: "Pagamento confirmado",
    delivered: "Pedido entregue",
    payment_pending: "Aguardando pagamento",
    open: "Carrinho aberto",
    link_required: "Aguardando vinculo da conta",
    cancelled: "Cancelado",
    expired: "Expirado",
    refunded: "Reembolsado",
    rejected: "Pagamento recusado",
    delivery_failed: "Falha na entrega",
    charged_back: "Chargeback",
  };
  return labels[status] || status.replace(/_/g, " ");
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthSeries() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
    return {
      key: monthKey(date),
      label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      received: 0,
      forecast: 0,
    };
  });
}

function jsonError(message: string, status: number) {
  return applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status }));
}

async function isGuildPlanOwner(
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>,
  authUserId: number,
  guildId: string,
) {
  try {
    const planOwner = await supabase
      .from("auth_user_plan_guilds")
      .select("user_id")
      .eq("guild_id", guildId)
      .maybeSingle();

    if (planOwner.data?.user_id === authUserId) return true;

    const legacyOwner = await supabase
      .from("payment_orders")
      .select("user_id")
      .eq("guild_id", guildId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return legacyOwner.data?.user_id === authUserId;
  } catch {
    return false;
  }
}

async function loadGuildCarts(
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>,
  guildId: string,
) {
  const extendedSelect =
    "id, status, total_amount, currency, customer_name, customer_email, created_at, paid_at, payment_expires_at, provider_status, provider, provider_payment_id, selected_payment_method_key, discount_code";
  const baseSelect =
    "id, status, total_amount, customer_name, customer_email, created_at, paid_at, payment_expires_at, provider_status";

  try {
    const extended = await supabase
      .from("guild_sales_carts")
      .select(extendedSelect)
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })
      .limit(240);

    if (!extended.error) {
      return (extended.data || []) as CartRow[];
    }

    const base = await supabase
      .from("guild_sales_carts")
      .select(baseSelect)
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })
      .limit(240);

    return (base.error ? [] : base.data || []) as CartRow[];
  } catch {
    return [];
  }
}

async function loadTickets(
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>,
  guildId: string,
) {
  try {
    const result = await supabase
      .from("tickets")
      .select("id, status, created_at, user_id")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })
      .limit(80);

    return (result.error ? [] : result.data || []) as TicketRow[];
  } catch {
    return [];
  }
}

async function loadEvents(
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>,
  guildId: string,
) {
  try {
    const result = await supabase
      .from("guild_sales_order_events")
      .select("event_type, created_at, discord_user_id")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })
      .limit(12);

    return (result.error ? [] : result.data || []) as EventRow[];
  } catch {
    return [];
  }
}

function buildOverviewPayload(
  carts: CartRow[],
  tickets: TicketRow[],
  events: EventRow[],
): OverviewPayload {
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const receivableCarts = carts.filter((cart) => isOpen(String(cart.status || "").toLowerCase()));
  const receivedCarts = carts.filter((cart) => isReceived(String(cart.status || "").toLowerCase()));
  const cancelledCarts = carts.filter((cart) => isCancelled(String(cart.status || "").toLowerCase()));
  const overdueCarts = receivableCarts.filter((cart) => {
    if (!cart.payment_expires_at) return false;
    const expires = new Date(cart.payment_expires_at).getTime();
    return Number.isFinite(expires) && expires < now;
  });
  const receivedThisMonth = receivedCarts.filter((cart) => {
    const paidAt = cart.paid_at || cart.created_at;
    return paidAt ? new Date(paidAt).getTime() >= monthStart.getTime() : false;
  });
  const openTickets = tickets.filter((ticket) => String(ticket.status || "").toLowerCase() === "open");

  const months = buildMonthSeries();
  const monthMap = new Map(months.map((item) => [item.key, item]));
  for (const cart of carts) {
    const source = cart.paid_at || cart.created_at;
    if (!source) continue;
    const bucket = monthMap.get(monthKey(new Date(source)));
    if (!bucket) continue;
    const amount = money(cart.total_amount);
    const status = String(cart.status || "").toLowerCase();
    if (isReceived(status)) bucket.received += amount;
    if (isOpen(status) || isReceived(status)) bucket.forecast += amount;
  }

  const upcoming = receivableCarts
    .filter((cart) => cart.payment_expires_at)
    .slice(0, 5)
    .map((cart) => ({
      id: cart.id,
      name: cart.customer_name || cart.customer_email || "Cliente",
      detail: invoiceCode(cart.id, cart.created_at),
      initials: (cart.customer_name || cart.customer_email || "CL").slice(0, 2).toUpperCase(),
    }));

  return {
    ok: true,
    stats: {
      receivable: receivableCarts.reduce((sum, cart) => sum + money(cart.total_amount), 0),
      receivableCount: receivableCarts.length,
      received: receivedCarts.reduce((sum, cart) => sum + money(cart.total_amount), 0),
      receivedCount: receivedCarts.length,
      receivedThisMonth: receivedThisMonth.reduce((sum, cart) => sum + money(cart.total_amount), 0),
      overdue: overdueCarts.reduce((sum, cart) => sum + money(cart.total_amount), 0),
      overdueCount: overdueCarts.length,
      cancelledCount: cancelledCarts.length,
      openTickets: openTickets.length,
    },
    chart: months,
    charges: carts.slice(0, 6).map((cart) => {
      const status = String(cart.status || "pending").toLowerCase();
      return {
        id: cart.id,
        code: invoiceCode(cart.id, cart.created_at),
        customer: cart.customer_name || cart.customer_email || "Cliente",
        customerEmail: cart.customer_email || null,
        status: isReceived(status) ? "Pago" : isCancelled(status) ? "Cancelado" : "Em aberto",
        statusDetail: rawStatusLabel(status),
        rawStatus: status,
        tone: isReceived(status) ? "success" : isCancelled(status) ? "muted" : "info",
        amount: money(cart.total_amount),
        currency: cart.currency || "BRL",
        createdAt: cart.created_at,
        paidAt: cart.paid_at,
        expiresAt: cart.payment_expires_at,
        paymentMethod: paymentMethodLabel(cart.selected_payment_method_key),
        paymentMethodKey: cart.selected_payment_method_key,
        provider: cart.provider,
        providerStatus: cart.provider_status,
        providerPaymentId: cart.provider_payment_id,
        discountCode: cart.discount_code,
      };
    }),
    upcoming,
    tickets: openTickets.slice(0, 5).map((ticket) => ({
      id: String(ticket.id),
      title: `Ticket #${ticket.id}`,
      meta: ticket.user_id ? `Membro ${ticket.user_id}` : "Ticket aberto",
    })),
    activity: (events.length
      ? events.slice(0, 6).map((event) => ({
          title: String(event.event_type || "evento").replace(/_/g, " "),
          meta: event.discord_user_id ? `Discord ${event.discord_user_id}` : "Sistema de vendas",
          at: event.created_at,
        }))
      : carts.slice(0, 6).map((cart) => ({
          title: `Pedido ${String(cart.status || "atualizado").toUpperCase()}`,
          meta: cart.customer_name || cart.customer_email || "Sistema de vendas",
          at: cart.paid_at || cart.created_at,
        }))),
  };
}

export async function GET(request: Request) {
  try {
    const guildId = new URL(request.url).searchParams.get("guildId")?.trim() || "";
    if (!isGuildId(guildId)) {
      return jsonError("Servidor invalido.", 400);
    }

    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession || !sessionData.accessToken) {
      return jsonError("Nao autenticado.", 401);
    }

    const authUserId = sessionData.authSession.user.id;
    const cacheKey = `workspace-overview:${guildId}:${authUserId}`;
    const cached = readPanelResponseCache<OverviewPayload>(cacheKey);
    if (cached) {
      return applyNoStoreHeaders(NextResponse.json(cached));
    }

    const { permissions, isTeamServer } = await getEffectiveDashboardPermissions({
      authUserId,
      guildId,
    }).catch(() => ({
      permissions: new Set<TeamRolePermission>(),
      isTeamServer: false,
    }));

    const supabase = getSupabaseAdminClientOrThrow();
    const [isOwner, accessibleGuild] = await Promise.all([
      isGuildPlanOwner(supabase, authUserId, guildId),
      assertUserAdminInGuildOrNull(
        {
          authSession: sessionData.authSession,
          accessToken: sessionData.accessToken,
        },
        guildId,
      ).catch(() => null),
    ]);

    const canAccess =
      isOwner ||
      permissions === "full" ||
      (permissions instanceof Set && permissions.size > 0) ||
      (!isTeamServer && accessibleGuild);

    if (!canAccess) {
      return jsonError("Voce nao possui permissao para ver este painel.", 403);
    }

    const [carts, tickets, events] = await Promise.all([
      loadGuildCarts(supabase, guildId),
      loadTickets(supabase, guildId),
      loadEvents(supabase, guildId),
    ]);

    const payload = buildOverviewPayload(carts, tickets, events);
    writePanelResponseCache(cacheKey, payload, OVERVIEW_CACHE_TTL_MS);

    return applyNoStoreHeaders(NextResponse.json(payload));
  } catch (error) {
    console.error("[workspace-overview]", error);
    return jsonError(
      sanitizeErrorMessage(error, "Nao foi possivel carregar a visao geral."),
      500,
    );
  }
}
