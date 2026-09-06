/**
 * Painel administrativo de afiliados.
 *
 * O admin tinha 21 secoes e nenhuma de afiliados: ninguem conseguia processar
 * um saque, e sem isso o programa nao fecha o ciclo do dinheiro.
 */

import { BadgeDollarSign, HandCoins, ShieldAlert, Users } from "lucide-react";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminAffiliateWithdrawalActions } from "@/components/admin/AdminAffiliateWithdrawalActions";
import { requirePermission } from "@/lib/admin/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProgramRulesSummary } from "@/lib/affiliates/programRules";

export const dynamic = "force-dynamic";

function formatMoney(value: unknown) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Mapeia a situacao do saque para o vocabulario do AdminStatusBadge. */
const WITHDRAWAL_BADGE_STATUS: Record<string, string> = {
  paid: "approved",
  processed: "approved",
  pending: "pending",
  processing: "review",
  rejected: "rejected",
};

const WITHDRAWAL_LABEL: Record<string, string> = {
  paid: "Pago",
  processed: "Pago",
  pending: "Em analise",
  processing: "Processando",
  rejected: "Recusado",
};

type WithdrawalRow = {
  id: string;
  amount: number | string | null;
  fee_amount: number | string | null;
  net_amount: number | string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  created_at: string;
  processed_at: string | null;
  affiliate: { affiliate_id: string; level: string } | { affiliate_id: string; level: string }[] | null;
};

function pickAffiliate(value: WithdrawalRow["affiliate"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function AdminAffiliatesPage() {
  await requirePermission("affiliates.read");
  const rules = getProgramRulesSummary();

  const [withdrawalsResult, affiliatesResult, pendingCommissionResult] = await Promise.all([
    supabaseAdmin
      .from("affiliate_withdrawals")
      .select(
        "id, amount, fee_amount, net_amount, pix_key, pix_key_type, status, rejection_reason, reviewed_by, created_at, processed_at, affiliate:affiliates(affiliate_id, level)",
      )
      .order("created_at", { ascending: true })
      .limit(100),
    supabaseAdmin
      .from("affiliates")
      .select(
        "id, affiliate_id, level, balance_available, balance_pending, total_earned, is_active, suspended_at, enrolled_at",
      )
      .order("total_earned", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("affiliate_conversions")
      .select("commission_amount")
      .eq("status", "approved")
      .is("reversed_at", null),
  ]);

  const withdrawals = (withdrawalsResult.data || []) as unknown as WithdrawalRow[];
  const affiliates = affiliatesResult.data || [];

  const openWithdrawals = withdrawals.filter((row) =>
    ["pending", "processing"].includes(String(row.status)),
  );
  const openAmount = openWithdrawals.reduce(
    (total, row) => total + Number(row.amount ?? 0),
    0,
  );
  const suspendedCount = affiliates.filter((row) => row.suspended_at).length;
  const lifetimeCommission = (pendingCommissionResult.data || []).reduce(
    (total, row) => total + Number(row.commission_amount ?? 0),
    0,
  );

  return (
    <section className="min-w-0">
      <AdminPageHeader
        eyebrow="Financeiro"
        title="Afiliados"
        description={`Fila de saques e situacao dos afiliados. Carencia de ${rules.holdingPeriodDays} dias, saque minimo de ${formatMoney(rules.withdrawalMinimum)}, transferencia manual via PIX.`}
      />

      <div className="mt-[24px] grid gap-[14px] sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          icon={<HandCoins className="h-[20px] w-[20px]" strokeWidth={1.9} />}
          label="Saques na fila"
          value={String(openWithdrawals.length)}
          description={formatMoney(openAmount)}
        />
        <AdminStatCard
          icon={<Users className="h-[20px] w-[20px]" strokeWidth={1.9} />}
          label="Afiliados listados"
          value={String(affiliates.length)}
          description="Ordenados por total ganho"
        />
        <AdminStatCard
          icon={<BadgeDollarSign className="h-[20px] w-[20px]" strokeWidth={1.9} />}
          label="Comissao aprovada"
          value={formatMoney(lifetimeCommission)}
          description="Total nao estornado"
        />
        <AdminStatCard
          icon={<ShieldAlert className="h-[20px] w-[20px]" strokeWidth={1.9} />}
          label="Suspensos"
          value={String(suspendedCount)}
          description="Sem gerar comissao"
        />
      </div>

      <div className="mt-[24px]">
        <AdminDataTable
          title="Fila de saques"
          description="A chave PIX completa aparece aqui porque este e o unico lugar do sistema onde alguem transfere o dinheiro. No painel do afiliado ela vai mascarada."
          headers={[
            "Afiliado",
            "Valor",
            "Chave PIX",
            "Solicitado",
            "Situacao",
            "Acoes",
          ]}
          rows={withdrawals.map((row) => {
            const affiliate = pickAffiliate(row.affiliate);
            const status = String(row.status);

            return [
              <div key={`${row.id}-aff`} className="flex flex-col gap-[2px]">
                <span className="font-mono text-[12px] text-[#E5E5E5]">
                  {affiliate?.affiliate_id ?? "—"}
                </span>
                <span className="text-[11px] text-[#5A5A5A]">{affiliate?.level ?? ""}</span>
              </div>,
              <div key={`${row.id}-amount`} className="flex flex-col gap-[2px]">
                <span className="text-[13px] text-[#E5E5E5]">{formatMoney(row.amount)}</span>
                {Number(row.fee_amount ?? 0) > 0 ? (
                  <span className="text-[11px] text-[#5A5A5A]">
                    liquido {formatMoney(row.net_amount)}
                  </span>
                ) : null}
              </div>,
              <div key={`${row.id}-pix`} className="flex flex-col gap-[2px]">
                <span className="font-mono text-[12px] text-[#C4C4C8]">{row.pix_key ?? "—"}</span>
                <span className="text-[11px] uppercase text-[#5A5A5A]">
                  {row.pix_key_type ?? ""}
                </span>
              </div>,
              <span key={`${row.id}-date`} className="text-[12px] text-[#8B8B90]">
                {formatDateTime(row.created_at)}
              </span>,
              <div key={`${row.id}-status`} className="flex flex-col gap-[4px]">
                <AdminStatusBadge
                  status={WITHDRAWAL_BADGE_STATUS[status] ?? status}
                  label={WITHDRAWAL_LABEL[status] ?? status}
                />
                {row.rejection_reason ? (
                  <span className="text-[11px] text-[#5A5A5A]">{row.rejection_reason}</span>
                ) : null}
                {row.reviewed_by ? (
                  <span className="text-[11px] text-[#5A5A5A]">por {row.reviewed_by}</span>
                ) : null}
              </div>,
              <AdminAffiliateWithdrawalActions
                key={`${row.id}-actions`}
                withdrawalId={row.id}
                status={status}
              />,
            ];
          })}
          emptyState={
            <AdminEmptyState
              badgeLabel="Fila vazia"
              title="Nenhum saque solicitado"
              description="Assim que um afiliado pedir saque, o pedido aparece aqui para conferencia e pagamento."
            />
          }
        />
      </div>

      <div className="mt-[24px]">
        <AdminDataTable
          title="Afiliados"
          description="Saldos vindos da razao contabil. Divergencia entre o saldo e a soma dos lancamentos indica lancamento perdido."
          headers={["Codigo", "Nivel", "Disponivel", "Em carencia", "Total ganho", "Situacao"]}
          rows={affiliates.map((row) => [
            <span key={`${row.id}-code`} className="font-mono text-[12px] text-[#E5E5E5]">
              {row.affiliate_id}
            </span>,
            <span key={`${row.id}-level`} className="text-[12px] capitalize text-[#C4C4C8]">
              {row.level}
            </span>,
            <span key={`${row.id}-available`} className="text-[13px] text-[#E5E5E5]">
              {formatMoney(row.balance_available)}
            </span>,
            <span key={`${row.id}-pending`} className="text-[13px] text-[#8B8B90]">
              {formatMoney(row.balance_pending)}
            </span>,
            <span key={`${row.id}-earned`} className="text-[13px] text-[#C4C4C8]">
              {formatMoney(row.total_earned)}
            </span>,
            <AdminStatusBadge
              key={`${row.id}-status`}
              status={row.suspended_at ? "blocked" : row.is_active ? "active" : "disabled"}
              label={row.suspended_at ? "Suspenso" : row.is_active ? "Ativo" : "Inativo"}
            />,
          ])}
          emptyState={
            <AdminEmptyState
              badgeLabel="Sem afiliados"
              title="Nenhum afiliado inscrito"
              description="A lista aparece assim que alguem aderir ao programa."
            />
          }
        />
      </div>
    </section>
  );
}
