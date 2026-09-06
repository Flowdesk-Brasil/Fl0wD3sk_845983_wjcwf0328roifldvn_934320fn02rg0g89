/**
 * Listagem administrativa de afiliados.
 *
 * O painel tinha 21 secoes e nenhuma de afiliados: ninguem conseguia aprovar
 * uma conversao, processar um saque ou suspender quem fraudasse.
 */

import { adminError, adminJson, requireAdminApiPermission } from "@/lib/admin/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  try {
    const access = await requireAdminApiPermission("affiliates.read");
    if (!access.ok) {
      return access.response;
    }

    const url = new URL(request.url);
    const search = String(url.searchParams.get("search") ?? "").trim();
    const status = String(url.searchParams.get("status") ?? "").trim();
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    let query = supabaseAdmin
      .from("affiliates")
      .select(
        "id, affiliate_id, user_id, level, highest_level, balance_available, balance_pending, total_earned, coupon_code, is_active, suspended_at, suspension_reason, terms_version, enrolled_at, created_at, user:auth_users(username, display_name, email)",
        { count: "exact" },
      )
      .order("total_earned", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      query = query.ilike("affiliate_id", `%${search.toUpperCase()}%`);
    }

    if (status === "suspended") {
      query = query.not("suspended_at", "is", null);
    } else if (status === "active") {
      query = query.is("suspended_at", null).eq("is_active", true);
    }

    const { data, error, count } = await query;

    if (error) {
      return adminError(error, "Erro ao carregar afiliados.");
    }

    return adminJson({
      ok: true,
      affiliates: data || [],
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
      },
    });
  } catch (error) {
    return adminError(error, "Erro ao carregar afiliados.");
  }
}
