import {
  BarChart3,
  Bell,
  BookOpen,
  Code2,
  DollarSign,
  Globe,
  History,
  Link2,
  Settings2,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AffiliateTab =
  | "overview"
  | "links"
  | "commissions"
  | "withdrawals"
  | "ranking"
  | "notifications"
  | "components"
  | "training"
  | "templates";

export type AffiliateNavItem = {
  id: AffiliateTab;
  label: string;
  icon: LucideIcon;
};

export type AffiliateNavGroup = {
  category: string;
  icon: LucideIcon;
  items: AffiliateNavItem[];
};

export const AFFILIATE_TABS: AffiliateTab[] = [
  "overview",
  "links",
  "commissions",
  "withdrawals",
  "ranking",
  "notifications",
  "components",
  "training",
  "templates",
];

export const AFFILIATE_NAV_GROUPS: AffiliateNavGroup[] = [
  {
    category: "Visão Geral",
    icon: BarChart3,
    items: [
      { id: "overview", label: "Dashboard", icon: BarChart3 },
      { id: "links", label: "Meus Links", icon: Link2 },
      { id: "commissions", label: "Comissões", icon: DollarSign },
      { id: "withdrawals", label: "Histórico de Saques", icon: History },
    ],
  },
  {
    category: "Comunidade",
    icon: Users,
    items: [
      { id: "ranking", label: "Ranking", icon: Trophy },
      { id: "training", label: "Treinamento", icon: BookOpen },
    ],
  },
  {
    category: "Ferramentas",
    icon: Settings2,
    items: [
      { id: "notifications", label: "Notificações & Webhook", icon: Bell },
      { id: "components", label: "Componentes Prontos", icon: Code2 },
      { id: "templates", label: "Templates de Site", icon: Globe },
    ],
  },
];

export const AFFILIATE_PAGE_META: Record<
  AffiliateTab,
  { eyebrow: string; title: string; subtitle: string }
> = {
  overview: {
    eyebrow: "Afiliado",
    title: "Dashboard",
    subtitle: "Acompanhe suas métricas, conversões e ganhos em tempo real.",
  },
  links: {
    eyebrow: "Ferramentas",
    title: "Meus Links",
    subtitle: "Links exclusivos por plano e período para você divulgar.",
  },
  commissions: {
    eyebrow: "Financeiro",
    title: "Comissões",
    subtitle: "Histórico completo de pagamentos aprovados com seu link.",
  },
  withdrawals: {
    eyebrow: "Financeiro",
    title: "Histórico de Saques",
    subtitle: "Todos os saques realizados e seu status atual.",
  },
  ranking: {
    eyebrow: "Comunidade",
    title: "Ranking de Afiliados",
    subtitle: "Top afiliados do mês com bônus e benefícios especiais.",
  },
  notifications: {
    eyebrow: "Configurações",
    title: "Notificações & Webhook",
    subtitle: "Configure alertas por email, SMS, push e webhook personalizado.",
  },
  components: {
    eyebrow: "Ferramentas",
    title: "Componentes Prontos",
    subtitle: "Botões e cards em HTML e React para implantar no seu site.",
  },
  training: {
    eyebrow: "Comunidade",
    title: "Treinamento",
    subtitle: "Aprenda as melhores estratégias para vender mais.",
  },
  templates: {
    eyebrow: "Ferramentas",
    title: "Templates de Site",
    subtitle: "Sites prontos para afiliados com subdomínio personalizado.",
  },
};

export const AFFILIATE_SIDEBAR_COLLAPSE_KEY = "flowdesk_affiliate_sidebar_groups_v1";

export function buildAffiliateGroupKey(group: AffiliateNavGroup, groupIndex: number) {
  return `${group.category}-${groupIndex}`;
}

export function buildDefaultAffiliateCollapsedGroups() {
  return Object.fromEntries(
    AFFILIATE_NAV_GROUPS.map((group, groupIndex) => [
      buildAffiliateGroupKey(group, groupIndex),
      false,
    ]),
  ) as Record<string, boolean>;
}

export function readStoredAffiliateCollapsedGroups() {
  if (typeof window === "undefined") {
    return buildDefaultAffiliateCollapsedGroups();
  }

  const fallback = buildDefaultAffiliateCollapsedGroups();

  try {
    const raw = window.localStorage.getItem(AFFILIATE_SIDEBAR_COLLAPSE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(fallback).map((key) => [
        key,
        typeof parsed[key] === "boolean" ? parsed[key] : fallback[key],
      ]),
    ) as Record<string, boolean>;
  } catch {
    return fallback;
  }
}
