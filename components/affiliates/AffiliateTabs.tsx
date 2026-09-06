"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  DollarSign,
  Globe,
  History,
  Link2,
  MousePointerClick,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { formatCurrency, getLevelConfig } from "@/lib/affiliates/affiliateLevels";
import type {
  AffiliateAIInsightCard,
  AffiliateCommission,
  AffiliateLink,
  AffiliatePeriod,
  AffiliatePlan,
  AffiliateProfile,
  AffiliateRankEntry,
  AffiliateStats,
  AffiliateWithdrawal,
} from "@/lib/affiliates/affiliateTypes";
import type { AffiliateWorkspaceSettings } from "@/components/affiliates/useAffiliateData";
import {
  AFF_CARD,
  AFF_CARD_INNER,
  AFF_TABLE_HEAD,
  AFF_TABLE_ROW,
  AFF_TABLE_WRAP,
  AffEmptyState,
  AffPrimaryButton,
  AffSecondaryButton,
  AffToggle,
  CopyButton,
  LevelBadge,
  MetricCard,
  StatusBadge,
} from "@/components/affiliates/affiliateUi";

const tabMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
};

function TabSection({ children }: { children: ReactNode }) {
  return (
    <motion.div {...tabMotion} className="space-y-[16px]">
      {children}
    </motion.div>
  );
}

export function OverviewTab({
  profile,
  stats,
  insight,
}: {
  profile: AffiliateProfile | null;
  stats: AffiliateStats | null;
  insight: AffiliateAIInsightCard | null;
}) {
  const level = profile?.level ?? "bronze";
  const config = getLevelConfig(level);
  const insightType = insight?.insight.type ?? "tip";
  const insightConfidence = Math.round((insight?.insight.confidence ?? 0.5) * 100);
  const insightTone =
    insightType === "warning"
      ? {
          border: "#DB4646",
          badge: "border-[#DB4646]/30 bg-[#DB4646]/10 text-[#F0A0A0]",
          eyebrow: "Atenção da IA",
        }
      : insightType === "opportunity"
        ? {
            border: "#5B8DEF",
            badge: "border-[#5B8DEF]/30 bg-[#5B8DEF]/10 text-[#A8C4FF]",
            eyebrow: "Oportunidade com IA",
          }
        : {
            border: "#1C1C1C",
            badge: "border-[#1C1C1C] bg-[#141414] text-[#C4C4C8]",
            eyebrow: "Insight com IA",
          };

  return (
    <TabSection>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className={`relative overflow-hidden ${AFF_CARD} p-[24px]`}
        style={{
          borderColor: config.borderColor,
          background: `linear-gradient(135deg, #0D0D0D 0%, ${config.bgColor} 100%)`,
        }}
      >
        <div className="flex flex-col gap-[14px] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <LevelBadge level={level} size="lg" />
            <p className="mt-[10px] text-[22px] font-medium tracking-[-0.04em] text-[#ECECEE]">
              Comissão atual: <span style={{ color: config.color }}>{config.commissionPct}%</span>
            </p>
            {stats?.rankThisMonth ? (
              <p className="mt-[4px] text-[13px]" style={{ color: config.color }}>
                + {stats.rankThisMonth === 1 ? "5" : stats.rankThisMonth === 2 ? "3" : "2"}% bônus de ranking
              </p>
            ) : null}
          </div>
          {profile?.affiliateId ? (
            <div className="shrink-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">Seu ID de Afiliado</p>
              <div className="mt-[6px] flex items-center gap-[8px]">
                <code className={`rounded-[8px] px-[10px] py-[5px] font-mono text-[12px] text-[#C4C4C8] ${AFF_CARD_INNER}`}>
                  {profile.affiliateId}
                </code>
                <CopyButton text={profile.affiliateId} />
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>

      <div className="grid gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Cliques hoje"
          value={String(stats?.clicksToday ?? 0)}
          sub={`Total: ${stats?.totalClicks ?? 0} cliques`}
          icon={MousePointerClick}
          delay={40}
        />
        <MetricCard
          label="Vendas este mês"
          value={String(stats?.salesThisMonth ?? 0)}
          sub={`Total: ${stats?.totalSales ?? 0} vendas`}
          icon={TrendingUp}
          delay={80}
        />
        <MetricCard
          label="Comissão pendente"
          value={formatCurrency(stats?.totalCommissionPending ?? 0)}
          sub="Aguardando aprovação"
          icon={DollarSign}
          delay={120}
        />
        <MetricCard
          label="Saldo disponível"
          value={formatCurrency(stats?.availableBalance ?? 0)}
          sub="Disponível para saque"
          icon={Zap}
          delay={160}
        />
      </div>

      {profile?.couponCode ? (
        <div className={`${AFF_CARD} p-[20px]`}>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[#737373]">Cupom personalizado</p>
          <div className="mt-[10px] flex flex-wrap items-center gap-[12px]">
            <code className={`rounded-[12px] px-[16px] py-[10px] font-mono text-[20px] font-bold tracking-widest text-[#F2F2F3] ${AFF_CARD_INNER}`}>
              {profile.couponCode}
            </code>
            <CopyButton text={profile.couponCode} label="Copiar cupom" />
          </div>
          <p className="mt-[8px] text-[12px] text-[#737373]">
            Compartilhe este cupom para que compradores identifiquem sua indicação.
          </p>
        </div>
      ) : null}

      {profile?.whatsappGroupUrl ? (
        <div className={`${AFF_CARD} p-[20px]`}>
          <div className="flex flex-col gap-[14px] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-[12px]">
              <div className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-white">
                <Users className="h-[18px] w-[18px]" strokeWidth={1.9} />
              </div>
              <div>
                <p className="text-[14px] font-medium text-[#ECECEE]">Grupo Exclusivo de Afiliados</p>
                <p className="text-[12px] text-[#737373]">Treinamentos, dicas e suporte direto</p>
              </div>
            </div>
            <a
              href={profile.whatsappGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[6px] rounded-[12px] bg-[#F2F2F3] px-[14px] py-[8px] text-[13px] font-semibold text-[#0D0D0D] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              Entrar no grupo
              <ArrowRight className="h-[13px] w-[13px]" strokeWidth={2.2} />
            </a>
          </div>
        </div>
      ) : null}

      <div className={`${AFF_CARD} p-[20px]`} style={{ borderColor: insightTone.border }}>
        <div className="flex items-center justify-between gap-[12px]">
          <div className="flex items-center gap-[8px]">
            <Sparkles className="h-[16px] w-[16px] text-[#F2F2F3]" strokeWidth={1.8} />
            <p className="text-[12px] uppercase tracking-[0.16em] text-[#737373]">{insightTone.eyebrow}</p>
          </div>
          <span className={`inline-flex rounded-full border px-[9px] py-[4px] text-[10px] font-semibold uppercase tracking-[0.08em] ${insightTone.badge}`}>
            {insightConfidence}% conf.
          </span>
        </div>
        <p className="mt-[12px] text-[16px] font-medium tracking-[-0.03em] text-[#F2F2F3]">
          {insight?.insight.title || "Seu painel está aprendendo com seus dados"}
        </p>
        <p className="mt-[8px] text-[14px] leading-[1.65] text-[#8B8B90]">
          {insight?.insight.body ||
            "Assim que houver mais dados reais de performance, a IA vai destacar o melhor próximo passo para você converter mais."}
        </p>
        <p className="mt-[8px] text-[12px] text-[#737373]">
          {insight?.periodLabel || "Baseado nos últimos 30 dias"}
        </p>
      </div>
    </TabSection>
  );
}

export function LinksTab({ links, reload }: { links: AffiliateLink[]; reload: () => void }) {
  const [isCreating, setIsCreating] = useState(false);
  const [plan, setPlan] = useState("pro");
  const [period, setPeriod] = useState("monthly");
  const [loading, setLoading] = useState(false);

  const PLAN_LABELS: Record<AffiliatePlan, string> = {
    basic: "Basic",
    pro: "Pro",
    enterprise: "Enterprise",
  };
  const PERIOD_LABELS: Record<AffiliatePeriod, string> = {
    monthly: "Mensal",
    annual: "Anual",
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/affiliates/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: plan, period }),
      });
      const json = await res.json();
      if (json.ok) {
        setIsCreating(false);
        reload();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TabSection>
      <div className={`${AFF_CARD} p-[20px]`}>
        {isCreating ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-[16px]"
          >
            <div className="grid grid-cols-2 gap-[12px]">
              <div className="space-y-[6px]">
                <p className="text-[12px] text-[#737373]">Plano</p>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="fd-field h-[40px] w-full rounded-[10px] px-[12px] text-[13px]"
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="space-y-[6px]">
                <p className="text-[12px] text-[#737373]">Período</p>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="fd-field h-[40px] w-full rounded-[10px] px-[12px] text-[13px]"
                >
                  <option value="monthly">Mensal</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
            </div>
            <div className="flex gap-[8px]">
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 rounded-[12px] bg-[#F2F2F3] py-[10px] text-[13px] font-semibold text-[#0D0D0D] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? <ButtonLoader size={16} colorClassName="text-[#0D0D0D]" /> : "Gerar Link de Afiliado"}
              </button>
              <AffSecondaryButton onClick={() => setIsCreating(false)}>Cancelar</AffSecondaryButton>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-[14px] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[14px] font-medium text-[#ECECEE]">Gerar novo link</p>
              <p className="mt-[2px] text-[12px] text-[#737373]">Crie links personalizados para planos específicos.</p>
            </div>
            <AffSecondaryButton onClick={() => setIsCreating(true)}>Novo Link</AffSecondaryButton>
          </div>
        )}
      </div>

      {links.length === 0 ? (
        <AffEmptyState
          icon={Link2}
          title="Nenhum link gerado"
          description="Crie seu primeiro link acima para começar a divulgar."
        />
      ) : (
        links.map((link, index) => (
          <motion.div
            key={link.linkId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.2 }}
            className={`${AFF_CARD} p-[20px] hover:border-[#2A2A2A]`}
          >
            <div className="flex flex-col gap-[16px]">
              <div className="space-y-[12px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span className={`rounded-full px-[9px] py-[3px] text-[11px] font-semibold text-[#ECECEE] ${AFF_CARD_INNER}`}>
                    {PLAN_LABELS[link.plan] || link.plan}
                  </span>
                  <span className={`rounded-full px-[9px] py-[3px] text-[11px] text-[#8B8B90] ${AFF_CARD_INNER}`}>
                    {PERIOD_LABELS[link.period] || link.period}
                  </span>
                </div>
                <div className="flex items-center gap-[8px]">
                  <code className={`min-w-0 flex-1 truncate rounded-[10px] px-[12px] py-[8px] font-mono text-[13px] text-[#C4C4C8] ${AFF_CARD_INNER}`}>
                    {link.shortUrl}
                  </code>
                  <CopyButton text={link.url} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-[10px] border-t border-[#1C1C1C] pt-[16px]">
                <div>
                  <p className="text-[12px] text-[#737373]">Cliques</p>
                  <p className="mt-[2px] text-[16px] font-semibold text-[#F2F2F3]">{link.clicks || 0}</p>
                </div>
                <div>
                  <p className="text-[12px] text-[#737373]">Conversões</p>
                  <p className="mt-[2px] text-[16px] font-semibold text-[#F2F2F3]">{link.conversions || 0}</p>
                </div>
                <div>
                  <p className="text-[12px] text-[#737373]">Taxa</p>
                  <p className="mt-[2px] text-[16px] font-semibold text-[#F2F2F3]">
                    {link.conversionRate?.toFixed(1) || "0.0"}%
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </TabSection>
  );
}

export function ComponentsTab({ profile }: { profile: AffiliateProfile | null }) {
  const demoAffId = profile?.affiliateId || "---";
  const [activeSnippet, setActiveSnippet] = useState<"html" | "react">("html");

  const htmlSnippet = `<!-- Botão Flowdesk — CDN: cdn.flwdesk.com/affiliate/v1.css -->
<link rel="stylesheet" href="https://cdn.flwdesk.com/affiliate/v1.css" />

<a
  href="https://flwdesk.com/r/${demoAffId}"
  class="flwdesk-btn flwdesk-btn-primary"
  data-affiliate-id="${demoAffId}"
>
  Assinar Flowdesk
</a>`;

  const reactSnippet = `import { FlowdeskButton } from '@flowdesk/affiliate-sdk';

export function MyPage() {
  return (
    <FlowdeskButton affiliateId="${demoAffId}" plan="pro" period="monthly">
      Assinar Flowdesk Pro
    </FlowdeskButton>
  );
}`;

  return (
    <TabSection>
      <div className={`${AFF_CARD} p-[24px]`}>
        <p className="text-[12px] uppercase tracking-[0.16em] text-[#737373]">Seu ID de afiliado</p>
        <div className="mt-[8px] flex items-center gap-[8px]">
          <code className={`rounded-[10px] px-[12px] py-[6px] font-mono text-[13px] text-[#C4C4C8] ${AFF_CARD_INNER}`}>
            {demoAffId}
          </code>
          <CopyButton text={demoAffId} />
        </div>
      </div>

      <div className={`${AFF_CARD} overflow-hidden`}>
        <div className="flex border-b border-[#1C1C1C]">
          {(["html", "react"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setActiveSnippet(lang)}
              className={`flex-1 py-[12px] text-[13px] font-medium transition-colors duration-150 ${
                activeSnippet === lang
                  ? "bg-[#141414] text-[#F2F2F3]"
                  : "text-[#737373] hover:text-[#C4C4C8]"
              }`}
            >
              {lang === "html" ? "HTML + CDN" : "React / Next.js"}
            </button>
          ))}
        </div>
        <div className="p-[20px]">
          <pre className="overflow-x-auto font-mono text-[12px] leading-[1.6] text-[#8B8B90]">
            <code>{activeSnippet === "html" ? htmlSnippet : reactSnippet}</code>
          </pre>
        </div>
      </div>
    </TabSection>
  );
}

const PODIUM_META = [
  { rank: 1, height: "h-[148px]", color: "#F2F2F3", icon: Trophy, delay: 0.08 },
  { rank: 2, height: "h-[124px]", color: "#C4C4C8", icon: Star, delay: 0.04 },
  { rank: 3, height: "h-[108px]", color: "#8B8B90", icon: Zap, delay: 0.12 },
] as const;

export function RankingTab({ ranking }: { ranking: AffiliateRankEntry[] }) {
  if (ranking.length === 0) {
    return (
      <TabSection>
        <AffEmptyState
          icon={Trophy}
          title="Ranking em processamento"
          description="Os dados de performance deste mês ainda estão sendo calculados."
        />
      </TabSection>
    );
  }

  const topThree = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <TabSection>
      <div className="grid items-end gap-[12px] sm:grid-cols-3">
        {[topThree[1], topThree[0], topThree[2]].filter(Boolean).map((entry) => {
          if (!entry) return null;
          const meta = PODIUM_META.find((item) => item.rank === entry.rank) ?? PODIUM_META[2];
          const RankIcon = meta.icon;

          return (
            <motion.div
              key={entry.affiliateId}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: meta.delay, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className={`relative flex flex-col items-center ${entry.rank === 1 ? "sm:order-2" : entry.rank === 2 ? "sm:order-1" : "sm:order-3"}`}
            >
              <div
                className={`relative w-full overflow-hidden rounded-t-[20px] border border-b-0 border-[#1C1C1C] bg-[#141414] px-[16px] pt-[18px] pb-[14px] ${meta.height}`}
                style={{ boxShadow: entry.rank === 1 ? "0 -8px 40px rgba(91,141,239,0.12)" : undefined }}
              >
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="flex items-start justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: meta.color }}>
                    {entry.rank}º
                  </span>
                  <RankIcon className="h-[16px] w-[16px]" style={{ color: meta.color }} strokeWidth={2} />
                </div>
                <div className="mt-[12px] flex flex-col items-center text-center">
                  <div className="flex h-[48px] w-[48px] items-center justify-center overflow-hidden rounded-full border border-[#1C1C1C] bg-[#0D0D0D] text-[18px] font-bold text-[#ECECEE]">
                    {entry.avatarUrl ? (
                      <Image src={entry.avatarUrl} alt={entry.displayName} width={48} height={48} className="h-full w-full object-cover" />
                    ) : (
                      entry.displayName[0]
                    )}
                  </div>
                  <p className="mt-[8px] max-w-full truncate text-[14px] font-medium text-[#F2F2F3]">{entry.displayName}</p>
                  <p className="mt-[6px] text-[18px] font-semibold tracking-[-0.03em]" style={{ color: meta.color }}>
                    {formatCurrency(entry.commissionThisMonth || 0)}
                  </p>
                  <p className="text-[11px] text-[#737373]">{entry.salesThisMonth || 0} vendas</p>
                </div>
              </div>
              <div className="h-[6px] w-full rounded-b-[6px] bg-[#0D0D0D] border border-[#1C1C1C]" />
            </motion.div>
          );
        })}
      </div>

      {rest.length > 0 ? (
        <div className={AFF_TABLE_WRAP}>
          {rest.map((entry, index) => (
            <motion.div
              key={entry.affiliateId}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + index * 0.04, duration: 0.2 }}
              className={`flex items-center gap-[14px] px-[20px] py-[16px] ${index > 0 ? "border-t border-[#1C1C1C]" : ""} ${AFF_TABLE_ROW}`}
            >
              <span className="w-[24px] text-center text-[14px] font-semibold text-[#737373]">{entry.rank}º</span>
              <div className="flex h-[36px] w-[36px] items-center justify-center overflow-hidden rounded-full border border-[#1C1C1C] bg-[#141414] text-[14px] font-bold text-[#C4C4C8]">
                {entry.avatarUrl ? (
                  <Image src={entry.avatarUrl} alt={entry.displayName} width={36} height={36} className="h-full w-full object-cover" />
                ) : (
                  entry.displayName[0]
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-[#ECECEE]">{entry.displayName}</p>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-semibold text-[#F2F2F3]">{formatCurrency(entry.commissionThisMonth || 0)}</p>
                <p className="text-[11px] text-[#737373]">{entry.salesThisMonth || 0} vendas</p>
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}
    </TabSection>
  );
}

export function CommissionsTab({ commissions }: { commissions: AffiliateCommission[] }) {
  if (commissions.length === 0) {
    return (
      <TabSection>
        <AffEmptyState
          icon={DollarSign}
          title="Nenhuma comissão registrada"
          description="Suas comissões aparecerão aqui assim que as vendas forem aprovadas."
        />
      </TabSection>
    );
  }

  return (
    <TabSection>
      <div className={AFF_TABLE_WRAP}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className={AFF_TABLE_HEAD}>
                <th className="px-[20px] py-[14px] font-medium">Data</th>
                <th className="px-[20px] py-[14px] font-medium">Pedido</th>
                <th className="px-[20px] py-[14px] font-medium">Valor Venda</th>
                <th className="px-[20px] py-[14px] font-medium">Comissão</th>
                <th className="px-[20px] py-[14px] font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C1C]">
              {commissions.map((c) => (
                <tr key={c.commissionId} className={AFF_TABLE_ROW}>
                  <td className="whitespace-nowrap px-[20px] py-[16px] text-[#8B8B90]">
                    {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="whitespace-nowrap px-[20px] py-[16px] font-mono text-[#ECECEE]">
                    #{c.commissionId.split("-")[0].toUpperCase()}
                  </td>
                  <td className="px-[20px] py-[16px] text-[#8B8B90]">{formatCurrency(c.saleAmount)}</td>
                  <td className="px-[20px] py-[16px] font-medium text-[#F2F2F3]">{formatCurrency(c.commissionAmount)}</td>
                  <td className="px-[20px] py-[16px]">
                    <StatusBadge
                      tone={c.status === "approved" ? "success" : c.status === "pending" ? "pending" : "danger"}
                      label={c.status === "approved" ? "Aprovado" : c.status === "pending" ? "Pendente" : "Cancelado"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </TabSection>
  );
}

export function WithdrawalsTab({ withdrawals }: { withdrawals: AffiliateWithdrawal[] }) {
  if (withdrawals.length === 0) {
    return (
      <TabSection>
        <AffEmptyState
          icon={History}
          title="Nenhum saque solicitado"
          description="Você poderá ver seu histórico completo de saques aqui."
        />
      </TabSection>
    );
  }

  return (
    <TabSection>
      <div className={AFF_TABLE_WRAP}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className={AFF_TABLE_HEAD}>
                <th className="px-[20px] py-[14px] font-medium">Data</th>
                <th className="px-[20px] py-[14px] font-medium">Valor</th>
                <th className="px-[20px] py-[14px] font-medium">Chave PIX</th>
                <th className="px-[20px] py-[14px] font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C1C]">
              {withdrawals.map((w) => (
                <tr key={w.withdrawalId} className={AFF_TABLE_ROW}>
                  <td className="px-[20px] py-[16px] text-[#8B8B90]">
                    {new Date(w.requestedAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-[20px] py-[16px] font-medium text-[#F2F2F3]">{formatCurrency(w.amount)}</td>
                  <td className="px-[20px] py-[16px] font-mono text-[#8B8B90]">{w.pixKey}</td>
                  <td className="px-[20px] py-[16px]">
                    <StatusBadge tone={w.status === "paid" ? "success" : "pending"} label={w.status === "paid" ? "Pago" : "Pendente"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </TabSection>
  );
}

export function NotificationsTab({
  settings,
  reload,
}: {
  settings: AffiliateWorkspaceSettings | null;
  reload: () => void;
}) {
  const [emailEnabled, setEmailEnabled] = useState(settings?.notify_email ?? true);
  const [smsEnabled, setSmsEnabled] = useState(settings?.notify_sms ?? false);
  const [webhookEnabled, setWebhookEnabled] = useState(!!settings?.webhook_url);
  const [webhookUrl, setWebhookUrl] = useState(settings?.webhook_url || "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.notify_email ?? true);
      setSmsEnabled(settings.notify_sms ?? false);
      setWebhookEnabled(!!settings.webhook_url);
      setWebhookUrl(settings.webhook_url || "");
    }
  }, [settings]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/affiliates/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: webhookEnabled ? webhookUrl : null,
          notifyEmail: emailEnabled,
          notifySms: smsEnabled,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSaved(true);
        reload();
        window.setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TabSection>
      {[
        {
          label: "Notificações por Email",
          desc: "Receba um email a cada venda aprovada, pendente ou cancelada.",
          enabled: emailEnabled,
          onToggle: () => setEmailEnabled(!emailEnabled),
        },
        {
          label: "Notificações por SMS",
          desc: "Alerta no celular a cada venda aprovada.",
          enabled: smsEnabled,
          onToggle: () => setSmsEnabled(!smsEnabled),
        },
      ].map((item) => (
        <div key={item.label} className={`flex items-center justify-between gap-[20px] ${AFF_CARD} p-[20px]`}>
          <div>
            <p className="text-[14px] font-medium text-[#ECECEE]">{item.label}</p>
            <p className="mt-[4px] text-[12px] leading-[1.55] text-[#737373]">{item.desc}</p>
          </div>
          <AffToggle enabled={item.enabled} onToggle={item.onToggle} />
        </div>
      ))}

      <div className={`${AFF_CARD} p-[20px]`}>
        <div className="flex items-center justify-between gap-[20px]">
          <div>
            <p className="text-[14px] font-medium text-[#ECECEE]">Webhook Personalizado</p>
            <p className="mt-[4px] text-[12px] leading-[1.55] text-[#737373]">
              Receba um POST em tempo real para vendas Pendentes, Aprovadas e Canceladas.
            </p>
          </div>
          <AffToggle enabled={webhookEnabled} onToggle={() => setWebhookEnabled(!webhookEnabled)} />
        </div>
        {webhookEnabled ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-[16px] space-y-[10px]"
          >
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://meusite.com/webhook/flowdesk"
              className="fd-field h-[44px] w-full rounded-[14px] px-[14px] text-[13px]"
            />
          </motion.div>
        ) : null}
      </div>

      <AffPrimaryButton onClick={handleSave} disabled={loading} loading={loading}>
        {loading ? <ButtonLoader size={16} colorClassName="text-[#111]" /> : saved ? (
          <>
            <Check className="h-[14px] w-[14px]" strokeWidth={2.5} /> Salvo!
          </>
        ) : (
          "Salvar configurações"
        )}
      </AffPrimaryButton>
    </TabSection>
  );
}

export function TrainingTab() {
  const modules = [
    { title: "Como divulgar no Instagram", duration: "12 min", icon: Globe, available: true },
    { title: "Estratégias no YouTube", duration: "19 min", icon: Zap, available: true },
    { title: "Email marketing para afiliados", duration: "24 min", icon: Bell, available: true },
    { title: "Criando conteúdo que converte", duration: "31 min", icon: Sparkles, available: false },
    { title: "Vendas com grupos de WhatsApp", duration: "15 min", icon: Users, available: true },
  ];

  return (
    <TabSection>
      {modules.map((mod, index) => (
        <motion.div
          key={mod.title}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.04, duration: 0.2 }}
          className={`flex items-center gap-[16px] ${AFF_CARD} p-[18px] ${
            mod.available ? "cursor-pointer hover:border-[#2A2A2A]" : "cursor-not-allowed opacity-50"
          }`}
        >
          <div className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#8B8B90]">
            <mod.icon className="h-[20px] w-[20px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-[#ECECEE]">{mod.title}</p>
            <p className="text-[12px] text-[#737373]">{mod.duration}</p>
          </div>
          {mod.available ? (
            <ArrowRight className="h-[15px] w-[15px] shrink-0 text-[#737373]" strokeWidth={1.8} />
          ) : (
            <span className={`rounded-full px-[8px] py-[3px] text-[10px] text-[#737373] ${AFF_CARD_INNER}`}>Bloqueado</span>
          )}
        </motion.div>
      ))}
    </TabSection>
  );
}

export function TemplatesTab({ profile }: { profile: AffiliateProfile | null }) {
  const templates = [
    { name: "Landing Minimalista", desc: "Design clean para conversão focada.", icon: BarChart3, status: "available", plan: "basic" },
    { name: "Landing Premium", desc: "Visual premium com seções completas.", icon: Zap, status: "available", plan: "pro" },
    { name: "Página de IA", desc: "Apresente recursos de automação.", icon: Sparkles, status: "available", plan: "pro-ai" },
    { name: "Blog de Afiliado", desc: "Conteúdo focado em SEO.", icon: BookOpen, status: "available", plan: "basic-blog" },
  ];

  const handleUseTemplate = (plan: string) => {
    if (!profile) return;
    const url = `https://flwdesk.com/register?aff=${profile.affiliateId}&template=${plan}`;
    window.open(url, "_blank");
  };

  return (
    <TabSection>
      <div className="grid gap-[14px] sm:grid-cols-2">
        {templates.map((tpl, index) => (
          <motion.div
            key={tpl.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.22 }}
            className={`${AFF_CARD} p-[22px] hover:border-[#2A2A2A]`}
          >
            <div className="inline-flex h-[48px] w-[48px] items-center justify-center rounded-[14px] border border-[#1C1C1C] bg-[#141414] text-[#8B8B90]">
              <tpl.icon className="h-[24px] w-[24px]" />
            </div>
            <h3 className="mt-[14px] text-[16px] font-medium text-[#ECECEE]">{tpl.name}</h3>
            <p className="mt-[6px] text-[13px] leading-[1.6] text-[#737373]">{tpl.desc}</p>
            <div className="mt-[18px]">
              {tpl.status === "available" ? (
                <button
                  type="button"
                  onClick={() => handleUseTemplate(tpl.plan)}
                  className="inline-flex items-center gap-[6px] rounded-[12px] border border-[#1C1C1C] bg-[#141414] px-[14px] py-[8px] text-[13px] font-medium text-[#C4C4C8] transition-all duration-150 hover:border-[#2A2A2A] hover:text-[#F2F2F3]"
                >
                  Usar template <ArrowRight className="h-[12px] w-[12px]" strokeWidth={2} />
                </button>
              ) : (
                <span className={`inline-flex rounded-full px-[10px] py-[5px] text-[11px] text-[#737373] ${AFF_CARD_INNER}`}>
                  Indisponível
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </TabSection>
  );
}

export function AffiliateTabContent({
  tab,
  profile,
  stats,
  insight,
  links,
  conversions,
  withdrawals,
  ranking,
  settings,
  reload,
}: {
  tab: import("@/components/affiliates/affiliateConfig").AffiliateTab;
  profile: AffiliateProfile | null;
  stats: AffiliateStats | null;
  insight: import("@/lib/affiliates/affiliateTypes").AffiliateAIInsightCard | null;
  links: AffiliateLink[];
  conversions: AffiliateCommission[];
  withdrawals: AffiliateWithdrawal[];
  ranking: AffiliateRankEntry[];
  settings: AffiliateWorkspaceSettings | null;
  reload: () => void;
}) {
  switch (tab) {
    case "overview":
      return <OverviewTab profile={profile} stats={stats} insight={insight} />;
    case "links":
      return <LinksTab links={links} reload={reload} />;
    case "commissions":
      return <CommissionsTab commissions={conversions} />;
    case "withdrawals":
      return <WithdrawalsTab withdrawals={withdrawals} />;
    case "ranking":
      return <RankingTab ranking={ranking} />;
    case "notifications":
      return <NotificationsTab settings={settings} reload={reload} />;
    case "components":
      return <ComponentsTab profile={profile} />;
    case "training":
      return <TrainingTab />;
    case "templates":
      return <TemplatesTab profile={profile} />;
    default:
      return null;
  }
}
