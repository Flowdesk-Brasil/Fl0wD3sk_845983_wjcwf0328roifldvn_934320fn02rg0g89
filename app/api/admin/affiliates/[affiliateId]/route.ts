/**
 * Acoes sobre um afiliado: detalhe, suspensao, nivel e ajuste de saldo.
 *
 * Ajuste de saldo entra como lancamento no ledger, nunca como escrita direta no
 * campo: dinheiro que aparece sem historico e dinheiro que ninguem consegue
 * auditar depois.
 */

import {
  adminError,
  adminJson,
  guardAdminJsonMutation,
  readJsonObject,
  requireAdminApiPermission,
} from "@/lib/admin/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { auditAffiliateBalances, listLedgerEntries, postLedgerEntry } from "@/lib/affiliates/ledger";
import type { AffiliateLevel } from "@/lib/affiliates/affiliateTypes";
import { deactivateAffiliateCoupon } from "@/lib/affiliates/coupons";

export const dynamic = "force-dynamic";

const VALID_LEVELS: AffiliateLevel[] = ["bronze", "silver", "gold", "diamond"];

export async function GET(
  _request: Request,
  context: { params: Promise<{ affiliateId: string }> },
) {
  try {
    const access = await requireAdminApiPermission("affiliates.read");
    if (!access.ok) {
      return access.response;
    }

    const { affiliateId } = await context.params;

    const [profileResult, conversionsResult, withdrawalsResult, ledger, audit] =
      await Promise.all([
        supabaseAdmin
          .from("affiliates")
          .select("*, user:auth_users(username, display_name, email)")
          .eq("id", affiliateId)
          .maybeSingle(),
        supabaseAdmin
          .from("affiliate_conversions")
          .select("*")
          .eq("affiliate_id", affiliateId)
          .order("conversion_date", { ascending: false })
          .limit(100),
        supabaseAdmin
          .from("affiliate_withdrawals")
          .select("*")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false })
          .limit(50),
        listLedgerEntries(affiliateId, { limit: 200 }),
        auditAffiliateBalances(affiliateId),
      ]);

    if (!profileResult.data) {
      return adminJson({ ok: false, message: "Afiliado nao encontrado." }, 404);
    }

    const profile = profileResult.data;

    // Divergencia entre o cache e a soma do ledger indica lancamento perdido.
    const drift = audit.ok
      ? {
          pending: Number(profile.balance_pending ?? 0) - audit.pending,
          available: Number(profile.balance_available ?? 0) - audit.available,
        }
      : null;

    return adminJson({
      ok: true,
      affiliate: profile,
      conversions: conversionsResult.data || [],
      withdrawals: withdrawalsResult.data || [],
      ledger,
      balanceAudit: audit.ok ? audit : null,
      balanceDrift: drift,
    });
  } catch (error) {
    return adminError(error, "Erro ao carregar o afiliado.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ affiliateId: string }> },
) {
  try {
    const guard = guardAdminJsonMutation(request);
    if (guard) {
      return guard;
    }

    const { affiliateId } = await context.params;
    const body = await readJsonObject(request);
    const action = String(body.action ?? "").trim();

    if (action === "suspend" || action === "reactivate") {
      const access = await requireAdminApiPermission("affiliates.suspend");
      if (!access.ok) {
        return access.response;
      }

      const suspending = action === "suspend";
      const reason = String(body.reason ?? "").trim();

      if (suspending && !reason) {
        return adminJson(
          { ok: false, message: "Explique o motivo da suspensao: o afiliado vera essa mensagem." },
          400,
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from("affiliates")
        .update({
          suspended_at: suspending ? new Date().toISOString() : null,
          suspension_reason: suspending ? reason : null,
          is_active: !suspending,
        })
        .eq("id", affiliateId)
        .select("coupon_code")
        .maybeSingle();

      if (error) {
        return adminError(error, "Erro ao atualizar a situacao do afiliado.");
      }

      // O cupom acompanha a suspensao: manter ativo daria desconto em nome de
      // quem nao pode mais receber comissao.
      const couponCode = (updated?.coupon_code as string | null) ?? null;
      if (suspending) {
        await deactivateAffiliateCoupon(couponCode);
      } else if (couponCode) {
        await supabaseAdmin
          .from("payment_coupons")
          .update({ status: "active" })
          .eq("code", couponCode.trim().toUpperCase())
          .contains("metadata", { source: "affiliate_program" });
      }

      return adminJson({ ok: true });
    }

    if (action === "set_level") {
      const access = await requireAdminApiPermission("affiliates.update");
      if (!access.ok) {
        return access.response;
      }

      const level = String(body.level ?? "").trim() as AffiliateLevel;
      if (!VALID_LEVELS.includes(level)) {
        return adminJson(
          { ok: false, message: `Nivel invalido. Use: ${VALID_LEVELS.join(", ")}.` },
          400,
        );
      }

      const { error } = await supabaseAdmin
        .from("affiliates")
        .update({ level, highest_level: level, level_evaluated_at: new Date().toISOString() })
        .eq("id", affiliateId);

      if (error) {
        return adminError(error, "Erro ao ajustar o nivel.");
      }

      return adminJson({ ok: true });
    }

    if (action === "adjust_balance") {
      const access = await requireAdminApiPermission("affiliates.adjust_balance");
      if (!access.ok) {
        return access.response;
      }

      const amountRaw = body.amount;
      const amount =
        typeof amountRaw === "number"
          ? amountRaw
          : Number.parseFloat(String(amountRaw ?? "").replace(",", "."));

      const description = String(body.description ?? "").trim();

      if (!Number.isFinite(amount) || amount === 0) {
        return adminJson({ ok: false, message: "Informe um valor diferente de zero." }, 400);
      }

      if (!description) {
        return adminJson(
          { ok: false, message: "Descreva o ajuste: ele fica permanente no extrato." },
          400,
        );
      }

      const target = String(body.target ?? "available").trim();
      if (target !== "available" && target !== "pending") {
        return adminJson({ ok: false, message: "Alvo invalido: use available ou pending." }, 400);
      }

      const result = await postLedgerEntry({
        affiliateId,
        entryType: "adjustment",
        availableDelta: target === "available" ? amount : 0,
        pendingDelta: target === "pending" ? amount : 0,
        // Ajuste conta no total ganho nos dois sentidos: um estorno manual
        // precisa abater o acumulado, senao o total ganho so cresce.
        earnedDelta: amount,
        description,
        createdBy: `staff:${access.profile.staffProfile.id}`,
      });

      if (!result.ok) {
        return adminJson(
          {
            ok: false,
            message:
              "Nao foi possivel lancar o ajuste. Saldo negativo e recusado pelo banco.",
            detail: result.reason,
          },
          400,
        );
      }

      return adminJson({ ok: true, entryId: result.duplicate ? null : result.entryId });
    }

    if (action === "recompute_balance") {
      const access = await requireAdminApiPermission("affiliates.read");
      if (!access.ok) {
        return access.response;
      }

      const { error } = await supabaseAdmin.rpc("affiliate_recompute_balances", {
        target_affiliate_id: affiliateId,
      });

      if (error) {
        return adminError(error, "Erro ao recalcular o saldo.");
      }

      return adminJson({ ok: true });
    }

    return adminJson({ ok: false, message: "Acao invalida." }, 400);
  } catch (error) {
    return adminError(error, "Erro ao executar a acao.");
  }
}
