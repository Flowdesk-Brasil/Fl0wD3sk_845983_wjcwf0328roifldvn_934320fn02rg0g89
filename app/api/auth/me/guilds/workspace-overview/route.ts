import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { getEffectiveDashboardPermissions } from "@/lib/teams/userTeams";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type CartRow = {
  id: string;
  status: string | null;
  total_amount: string | number | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string | null;
  paid_at: string | null;
  payment_expires_at: string | null;
  provider_status: string | null;
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

export async function GET(request: Request) {
  try {
    const guildId = new URL(request.url).searchParams.get("guildId")?.trim() || "";
    if (!isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Servidor invalido." }, { status: 400 }),
      );
    }

    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession || !sessionData.accessToken) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
      );
    }

    const { permissions, isTeamServer } = await getEffectiveDashboardPermissions({
      authUserId: sessionData.authSession.user.id,
      guildId,
    });
    const accessibleGuild = await assertUserAdminInGuildOrNull(
      {
        authSession: sessionData.authSession,
        accessToken: sessionData.accessToken,
      },
      guildId,
    );
    const canAccess =
      permissions === "full" ||
      (permissions instanceof Set && permissions.size > 0) ||
      (!isTeamServer && accessibleGuild);

    if (!canAccess) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Voce nao possui permissao para ver este painel." },
          { status: 403 },
        ),
      );
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const [cartsResult, ticketsResult, eventsResult] = await Promise.all([
      supabase
        .from("guild_sales_carts")
        .select(
          "id, status, total_amount, customer_name, customer_email, created_at, paid_at, payment_expires_at, provider_status",
        )
        .eq("guild_id", guildId)
        .order("created_at", { ascending: false })
        .limit(240),
      supabase
        .from("tickets")
        .select("id, status, created_at")
        .eq("guild_id", guildId)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("guild_sales_order_events")
        .select("event_type, created_at, discord_user_id")
        .eq("guild_id", guildId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const carts = (cartsResult.error ? [] : cartsResult.data || []) as CartRow[];
    const tickets = (ticketsResult.error ? [] : ticketsResult.data || []) as TicketRow[];
    const events = (eventsResult.error ? [] : eventsResult.data || []) as EventRow[];

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

    return applyNoStoreHeaders(
      NextResponse.json({
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
            status: isReceived(status) ? "Pago" : isCancelled(status) ? "Cancelado" : "Em aberto",
            tone: isReceived(status) ? "success" : isCancelled(status) ? "muted" : "info",
            amount: money(cart.total_amount),
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
            }))
        ),
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Nao foi possivel carregar a visao geral."),
        },
        { status: 500 },
      ),
    );
  }
}
