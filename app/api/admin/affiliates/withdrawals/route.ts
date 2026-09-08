/**
 * Fila de saques.
 *
 * Sem esta rota o saque ficava preso: o afiliado solicitava e ninguem
 * conseguia marcar como pago. Aqui o operador ve a fila, a chave PIX completa
 * (unico lugar do sistema onde ela aparece inteira, porque e quem transfere) e
 * decide.
 */

import {
  adminError,
  adminJson,
  guardAdminJsonMutation,
  readJsonObject,
  requireAdminApiPermission,
} from "@/lib/admin/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  markWithdrawalPaid,
  markWithdrawalProcessing,
  rejectWithdrawal,
} from "@/lib/affiliates/withdrawals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireAdminApiPermission("affiliates.payout");
    if (!access.ok) {
      return access.response;
    }

    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") ?? "pending").trim();

    let query = supabaseAdmin
      .from("affiliate_withdrawals")
      .select(
        "id, affiliate_id, amount, fee_amount, net_amount, pix_key, pix_key_type, status, notes, rejection_reason, receipt_url, reviewed_by, reviewed_at, processed_at, created_at, affiliate:affiliates(affiliate_id, level, user_id)",
      )
      .order("created_at", { ascending: true })
      .limit(200);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return adminError(error, "Erro ao carregar a fila de saques.");
    }

    return adminJson({ ok: true, withdrawals: data || [] });
  } catch (error) {
    return adminError(error, "Erro ao carregar a fila de saques.");
  }
}

export async function POST(request: Request) {
  try {
    const guard = guardAdminJsonMutation(request);
    if (guard) {
      return guard;
    }

    const access = await requireAdminApiPermission("affiliates.payout");
    if (!access.ok) {
      return access.response;
    }

    const body = await readJsonObject(request);
    const withdrawalId = String(body.withdrawalId ?? "").trim();
    const action = String(body.action ?? "").trim();

    if (!withdrawalId) {
      return adminJson({ ok: false, message: "Informe o saque." }, 400);
    }

    const reviewedBy = `staff:${access.profile.staffProfile.id}`;

    if (action === "processing") {
      const result = await markWithdrawalProcessing({ withdrawalId, reviewedBy });
      return result.ok
        ? adminJson({ ok: true })
        : adminJson({ ok: false, message: result.message }, result.status);
    }

    if (action === "paid") {
      const result = await markWithdrawalPaid({
        withdrawalId,
        reviewedBy,
        receiptUrl: body.receiptUrl ? String(body.receiptUrl).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
      });

      return result.ok
        ? adminJson({ ok: true })
        : adminJson({ ok: false, message: result.message }, result.status);
    }

    if (action === "rejected") {
      const reason = String(body.reason ?? "").trim();
      if (!reason) {
        return adminJson(
          { ok: false, message: "Explique o motivo da rejeicao: o afiliado vera essa mensagem." },
          400,
        );
      }

      const result = await rejectWithdrawal({ withdrawalId, reviewedBy, reason });
      return result.ok
        ? adminJson({ ok: true })
        : adminJson({ ok: false, message: result.message }, result.status);
    }

    return adminJson(
      { ok: false, message: "Acao invalida. Use processing, paid ou rejected." },
      400,
    );
  } catch (error) {
    return adminError(error, "Erro ao processar o saque.");
  }
}
