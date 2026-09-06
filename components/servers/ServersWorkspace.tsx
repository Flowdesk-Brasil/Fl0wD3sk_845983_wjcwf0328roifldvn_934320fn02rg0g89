"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion } from "motion/react";
import type { RefObject } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRightLeft,
  BadgePercent,
  BarChart3,
  Check as CheckLucide,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  Cog,
  Copy as CopyLucide,
  Ellipsis,
  FolderKanban,
  Grid2x2,
  HardDrive,
  LayoutDashboard,
  LifeBuoy,
  List as ListLucide,
  Plus as PlusLucide,
  PlugZap,
  Search as SearchLucide,
  Settings2,
  Shield,
  ShieldCheck,
  Lightbulb,
  ShoppingBag,
  SlidersHorizontal,
  Ticket,
  Users,
  WalletCards,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { OFFICIAL_DISCORD_INVITE_URL } from "@/lib/discordLink/config";
import { LandingActionButton } from "@/components/landing/LandingActionButton";
import { LandingReveal } from "@/components/landing/LandingReveal";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { useNotificationEffect } from "@/components/notifications/NotificationsProvider";
import { ServerDiscordLinkModal } from "@/components/servers/ServerUi";
import { ServerHomeOverview } from "@/components/servers/ServerHomeOverview";
import { ServerSettingsEditor } from "@/components/servers/ServerSettingsEditor";
import { ServerSettingsEditorSkeleton } from "@/components/servers/ServerSettingsEditorSkeleton";
import { PermissionDeniedState } from "@/components/servers/PermissionDeniedState";
import { resolveAddServerTargetHref } from "@/lib/plans/addServerFlow";
import {
  buildAccountPathWithReturn,
  getCurrentBrowserPath,
} from "@/lib/account/navigation";
import {
  buildDiscordAuthStartHref,
  buildLoginHref,
  getCurrentBrowserInternalPath,
} from "@/lib/auth/paths";
import {
  DEFAULT_MANAGED_SERVERS_SYNC_STATE,
  type ManagedServer,
  type ManagedServerStatus,
  type ManagedServersSyncState,
} from "@/lib/servers/managedServersShared";
import {
  buildServerMetaLabel,
  buildServerStatusDescription,
} from "@/lib/servers/licensePresentation";
import { resolveServersWorkspaceAlertMessage } from "@/lib/servers/workspaceAlerts";
import { prefetchServerDashboardSettings } from "@/lib/servers/serverDashboardSettingsClient";
import {
  readCachedManagedServers,
  readManagedServersMemoryCache,
  readCachedTeamsSnapshot,
  readTeamsSnapshotMemoryCache,
  storeCachedManagedServers,
  storeCachedTeamsSnapshot,
} from "@/lib/servers/serversWorkspaceClientCache";
import type { PendingTeamInvite, UserTeam } from "@/lib/teams/userTeams";
import {
  readStoredSelectedTeamId,
  writeStoredSelectedTeamId,
} from "@/lib/teams/selectedTeamStorage";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import { buildBrowserRoutingTargetFromInternalPath } from "@/lib/routing/subdomains";
import {
  scheduleWarmBrowserRoutes,
  warmBrowserRoute,
} from "@/lib/routing/browserWarmup";
import { useLatchedPendingKey } from "@/lib/ui/useLatchedPendingKey";
import { fetchClientData } from "@/lib/performance/clientData";
import { useLiveAccountProfile } from "@/hooks/useLiveAccountProfile";
import {
  PanelShell,
  fdNavGroupClass,
  fdNavItemClass,
  type PanelQuickLink,
} from "@/components/panel-shell";

type ServersWorkspaceProps = {
  displayName: string;
  currentAccount: {
    authUserId: number;
    discordUserId: string | null;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  };
  initialGuildId?: string | null;
  initialTab?: "settings" | "payments" | "methods" | "plans";
  initialSettingsSection?: ServerSettingsSection;
  initialServers?: ManagedServer[] | null;
  initialServersSync?: ManagedServersSyncState | null;
  initialTeams?: UserTeam[] | null;
  initialPendingInvites?: PendingTeamInvite[] | null;
};

type ServerEditorTab = "settings" | "payments" | "methods" | "plans";
type ServerSettingsSection =
  | "home"
  | "overview"
  | "message"
  | "sales_overview"
  | "sales_categories"
  | "sales_category_create"
  | "sales_category_edit"
  | "sales_products"
  | "sales_product_create"
  | "sales_product_edit"
  | "sales_stock"
  | "sales_stock_edit"
  | "sales_payment_methods"
  | "sales_coupons_gifts"
  | "sales_coupons_gifts_create"
  | "sales_coupons_gifts_edit"
  | "entry_exit_overview"
  | "entry_exit_message"
  | "captcha_overview"
  | "captcha_message"
  | "suggestions_overview"
  | "suggestions_message"
  | "bate_ponto_overview"
  | "bate_ponto_message"
  | "bate_ponto_ranking"
  | "bate_ponto_history"
  | "security_antilink"
  | "security_autorole"
  | "security_logs"
  | "ticket_ai";
type FilterOption = "all" | ManagedServerStatus;
type ViewMode = "overview" | "list";
type CreateTeamStep = "name" | "servers" | "members";

type ServersApiResponse = {
  ok: boolean;
  message?: string;
  servers?: ManagedServer[];
  sync?: ManagedServersSyncState;
};

type TeamsApiResponse = {
  ok: boolean;
  conflict?: boolean;
  message?: string;
  teams?: UserTeam[];
  pendingInvites?: PendingTeamInvite[];
  createdTeamId?: number;
  conflictingGuildIds?: string[];
};

type SavedPanelAccount = {
  authUserId: number;
  discordUserId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  lastSeenAt: number;
};

type ServersSyncContent = {
  actionLabel: string;
  badgeLabel: string;
  description: string;
  title: string;
};

const FILTER_LABEL: Record<FilterOption, string> = {
  all: "Todos",
  paid: "Em dia",
  pending_payment: "Pendente",
  expired: "Expirada",
  off: "Desligados",
};

type SidebarItem = {
  label: string;
  kind: "home" | "overview" | "settings" | "sales" | "ticket" | "entry_exit" | "captcha" | "suggestions" | "bate_ponto" | "security" | "dashboard";
  tab?: ServerEditorTab | null;
  settingsSection?: ServerSettingsSection | null;
  disabled?: boolean;
  chevron?: boolean;
  searchAliases?: string[];
  requiredPermission?: string;
};

const PROJECTS_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Visão Geral",
    kind: "home",
    tab: "settings",
    settingsSection: "home",
    searchAliases: ["dashboard", "visao geral", "visão geral", "home", "inicio", "painel"],
  },
  {
    label: "Projetos",
    kind: "overview",
    tab: null,
    searchAliases: ["overview", "servidores", "projetos", "inicio"],
  },
];

const TICKET_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "configurando ticket",
    kind: "ticket",
    tab: "settings",
    settingsSection: "overview",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: [
      "ticket",
      "tickets",
      "config",
      "setup",
      "canais",
      "cargos",
      "staff",
      "visao geral",
      "painel",
    ],
  },
  {
    label: "Mensagem do ticket",
    kind: "ticket",
    tab: "settings",
    settingsSection: "message",
    requiredPermission: "server_manage_tickets_message",
    searchAliases: [
      "mensagem",
      "embed",
      "painel principal",
      "titulo",
      "descricao",
      "botao",
      "ticket",
    ],
  },
  {
    label: "Configurando FlowAI",
    kind: "ticket",
    tab: "settings",
    settingsSection: "ticket_ai",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: [
      "ia",
      "ai",
      "flowai",
      "inteligencia",
      "robo",
      "sugestao",
      "regras",
      "empresa",
    ],
  },
];

const SALES_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Configurando vendas",
    kind: "sales",
    tab: "settings",
    settingsSection: "sales_overview",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: ["vendas", "loja", "configuracao", "checkout", "pedidos"],
  },
  {
    label: "Categorias",
    kind: "sales",
    tab: "settings",
    settingsSection: "sales_categories",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: ["vendas", "categorias", "colecoes", "grupos"],
  },
  {
    label: "Produtos",
    kind: "sales",
    tab: "settings",
    settingsSection: "sales_products",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: ["vendas", "produtos", "itens", "estoque"],
  },
  {
    label: "Estoque",
    kind: "sales",
    tab: "settings",
    settingsSection: "sales_stock",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: ["vendas", "estoque", "inventario", "quantidade"],
  },
  {
    label: "Métodos de Pagamento",
    kind: "sales",
    tab: "settings",
    settingsSection: "sales_payment_methods",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: ["vendas", "pagamento", "metodos", "pix", "cartao"],
  },
  {
    label: "Cupons e Gifts",
    kind: "sales",
    tab: "settings",
    settingsSection: "sales_coupons_gifts",
    requiredPermission: "server_manage_tickets_overview",
    searchAliases: ["vendas", "cupons", "gifts", "descontos", "presentes"],
  },
];

const ENTRY_EXIT_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Canais e Logs",
    kind: "entry_exit",
    tab: "settings",
    settingsSection: "entry_exit_overview",
    requiredPermission: "server_manage_welcome_overview",
    searchAliases: [
      "entrada",
      "saida",
      "logs",
      "canal",
      "mensagem",
      "boas vindas",
      "entrada e saida",
    ],
  },
  {
    label: "Configurando Mensagem",
    kind: "entry_exit",
    tab: "settings",
    settingsSection: "entry_exit_message",
    requiredPermission: "server_manage_welcome_message",
    searchAliases: [
      "mensagem",
      "embed",
      "entrada",
      "saida",
      "configurar",
      "boas vindas",
    ],
  },
];

const CAPTCHA_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Configurando Captcha",
    kind: "captcha",
    tab: "settings",
    settingsSection: "captcha_overview",
    requiredPermission: "server_manage_captcha_overview",
    searchAliases: [
      "captcha",
      "verificacao",
      "config",
      "canais",
      "cargos",
      "logs",
      "painel",
    ],
  },
  {
    label: "Configurando Mensagem",
    kind: "captcha",
    tab: "settings",
    settingsSection: "captcha_message",
    requiredPermission: "server_manage_captcha_message",
    searchAliases: [
      "captcha",
      "mensagem",
      "embed",
      "painel",
      "botao",
      "verificacao",
    ],
  },
];

const SUGGESTIONS_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Configurando Sugestoes",
    kind: "suggestions",
    tab: "settings",
    settingsSection: "suggestions_overview",
    requiredPermission: "server_manage_suggestions_overview",
    searchAliases: [
      "sugestoes",
      "sugestao",
      "ideias",
      "votacao",
      "config",
      "canais",
      "logs",
      "painel",
    ],
  },
  {
    label: "Configurando Mensagem",
    kind: "suggestions",
    tab: "settings",
    settingsSection: "suggestions_message",
    requiredPermission: "server_manage_suggestions_message",
    searchAliases: [
      "sugestoes",
      "mensagem",
      "embed",
      "painel",
      "botao",
      "ideias",
    ],
  },
];

const BATE_PONTO_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Configurando Ponto",
    kind: "bate_ponto",
    tab: "settings",
    settingsSection: "bate_ponto_overview",
    requiredPermission: "server_manage_bate_ponto_overview",
    searchAliases: [
      "bate ponto",
      "ponto",
      "expediente",
      "config",
      "canais",
      "logs",
      "painel",
      "banco de horas",
    ],
  },
  {
    label: "Configurando Mensagem",
    kind: "bate_ponto",
    tab: "settings",
    settingsSection: "bate_ponto_message",
    requiredPermission: "server_manage_bate_ponto_message",
    searchAliases: [
      "bate ponto",
      "mensagem",
      "embed",
      "painel",
      "botao",
      "ponto",
    ],
  },
  {
    label: "Ranking",
    kind: "bate_ponto",
    tab: "settings",
    settingsSection: "bate_ponto_ranking",
    requiredPermission: "server_manage_bate_ponto_ranking",
    searchAliases: [
      "bate ponto",
      "ranking",
      "horas",
      "podiumio",
      "top",
      "expediente",
    ],
  },
  {
    label: "Historico",
    kind: "bate_ponto",
    tab: "settings",
    settingsSection: "bate_ponto_history",
    requiredPermission: "server_manage_bate_ponto_history",
    searchAliases: [
      "bate ponto",
      "historico",
      "eventos",
      "registros",
      "acoes",
      "logs",
    ],
  },
];

const SECURITY_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "AntiLink",
    kind: "security",
    tab: "settings",
    settingsSection: "security_antilink",
    requiredPermission: "server_manage_antilink",
    searchAliases: [
      "seguranca",
      "anti link",
      "antilink",
      "moderacao",
      "ban",
      "expulsar",
      "silenciar",
      "links",
      "discord.gg",
    ],
  },
  {
    label: "AutoRole",
    kind: "security",
    tab: "settings",
    settingsSection: "security_autorole",
    requiredPermission: "server_manage_autorole",
    searchAliases: [
      "seguranca",
      "autorole",
      "auto role",
      "cargo automatico",
      "cargos automaticos",
      "roles",
      "cargos",
    ],
  },
  {
    label: "Logs",
    kind: "security",
    tab: "settings",
    settingsSection: "security_logs",
    requiredPermission: "server_view_security_logs",
    searchAliases: [
      "seguranca",
      "logs",
      "nickname",
      "avatar",
      "voz",
      "mensagem deletada",
      "mensagem editada",
      "ban",
      "desban",
      "kick",
      "silenciar",
      "timeout",
      "move call",
    ],
  },
];
const shellClass =
  "rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D]";
const projectCardClass =
  "rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] transition-colors hover:border-[#2A2A2E] hover:bg-[#111111]";
const projectEase = [0.22, 1, 0.36, 1] as const;

const SAVED_PANEL_ACCOUNTS_KEY = "flowdesk_saved_panel_accounts_v1";
const editorPanelRevealClass =
  "origin-top transform-gpu transition-[opacity,transform,filter] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] data-[flowdesk-visible=false]:translate-y-[18px] data-[flowdesk-visible=false]:scale-[0.985] data-[flowdesk-visible=false]:opacity-0 data-[flowdesk-visible=true]:translate-y-0 data-[flowdesk-visible=true]:scale-100 data-[flowdesk-visible=true]:opacity-100";
const workspacePaneRevealClass =
  "transform-gpu transition-[opacity,transform,filter] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] data-[flowdesk-visible=false]:translate-y-[14px] data-[flowdesk-visible=false]:scale-[0.992] data-[flowdesk-visible=false]:opacity-0 data-[flowdesk-visible=true]:translate-y-0 data-[flowdesk-visible=true]:scale-100 data-[flowdesk-visible=true]:opacity-100";

const TEAM_ICON_OPTIONS = [
  {
    key: "aurora",
    label: "Aurora",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#91B6FF_0%,#245BFF_48%,#081A4E_100%)]",
  },
  {
    key: "ember",
    label: "Ember",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#FFC18F_0%,#FF7A1A_48%,#4A1805_100%)]",
  },
  {
    key: "ocean",
    label: "Ocean",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#8AF2FF_0%,#148EBC_48%,#052238_100%)]",
  },
  {
    key: "amethyst",
    label: "Amethyst",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#D9A8FF_0%,#7D3BFF_48%,#220842_100%)]",
  },
  {
    key: "forest",
    label: "Forest",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#A9FFB8_0%,#0E8E4E_48%,#062615_100%)]",
  },
  {
    key: "sunset",
    label: "Sunset",
    shell:
      "bg-[radial-gradient(circle_at_28%_18%,#FFD7A8_0%,#FF7A59_36%,#D83A7C_68%,#2D0718_100%)]",
  },
] as const;

function getTeamIconShell(iconKey: string) {
  return (
    TEAM_ICON_OPTIONS.find((option) => option.key === iconKey)?.shell ||
    TEAM_ICON_OPTIONS[0].shell
  );
}

function teamInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "E";
}

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isSubsequence(query: string, target: string) {
  if (!query) return true;
  let queryIndex = 0;
  for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
    if (target[targetIndex] === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex >= query.length) return true;
    }
  }
  return false;
}

function getSearchScore(guildName: string, query: string) {
  if (!query) return 1;
  const normalizedName = normalizeSearchText(guildName);
  const compactName = normalizedName.replace(/\s+/g, "");
  const compactQuery = query.replace(/\s+/g, "");
  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 90;
  if (normalizedName.includes(query)) return 80;
  if (compactQuery && isSubsequence(compactQuery, compactName)) return 50;
  return 0;
}

function parseWorkspaceRoute(pathname: string | null): {
  guildId: string | null;
  tab: ServerEditorTab;
  settingsSection: ServerSettingsSection;
} {
  const fallback = {
    guildId: null,
    tab: "settings" as const,
    settingsSection: "home" as const,
  };

  if (!pathname) return fallback;

  const normalizedPathname = (() => {
    if (pathname === "/") {
      return "/servers";
    }

    const comparablePathname =
      pathname !== "/" && pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;

    if (comparablePathname === "/plans") {
      return "/servers/plans";
    }

    if (comparablePathname.startsWith("/servers")) {
      return comparablePathname;
    }

    if (
      /^\/\d{10,25}(?:\/(?:overview|sales\/(?:overview|categories(?:\/create)?|products|stock(?:\/edit\/prd-[0-9]{8})?|payment-methods|coupons-gifts(?:\/(?:create|edit\/[^/]+))?)|tickets\/(?:overview|message|flowai)|entry-exit\/(?:overview|message)|captcha\/(?:overview|message)|suggestions\/(?:overview|message)|bate-ponto\/(?:overview|message|ranking|history)|security\/(?:antilink|autorole|logs))?)?$/.test(
        comparablePathname,
      )
    ) {
      return `/servers${comparablePathname}`;
    }

    return comparablePathname;
  })();

  const homeMatch = normalizedPathname.match(/^\/servers\/(\d{10,25})\/overview\/?$/);
  if (homeMatch) {
    return {
      guildId: homeMatch[1],
      tab: "settings",
      settingsSection: "home",
    };
  }

  const bareMatch = normalizedPathname.match(/^\/servers\/(\d{10,25})\/?$/);
  if (bareMatch) {
    return {
      guildId: bareMatch[1],
      tab: "settings",
      settingsSection: "home",
    };
  }

  const ticketSectionMatch = normalizedPathname.match(
    /^\/servers\/(\d{10,25})\/tickets?\/(overview|message|flowai)\/?$/,
  );
  if (ticketSectionMatch) {
    return {
      guildId: ticketSectionMatch[1],
      tab: "settings",
      settingsSection:
        ticketSectionMatch[2] === "flowai"
          ? "ticket_ai"
          : (ticketSectionMatch[2] as ServerSettingsSection),
    };
  }

  const salesSectionMatch = normalizedPathname.match(
    /^\/servers\/(\d{10,25})\/sales\/(overview|categories(?:\/create|\/edit\/flw-[0-9]{8})?|products(?:\/create|\/edit\/prd-[0-9]{8})?|stock(?:\/edit\/prd-[0-9]{8})?|payment-methods|coupons-gifts(?:\/create|\/edit\/[^/]+)?)\/?$/,
  );
  if (salesSectionMatch) {
    const salesSection = salesSectionMatch[2];
    return {
      guildId: salesSectionMatch[1],
      tab: "settings",
      settingsSection:
        salesSection === "categories"
          ? "sales_categories"
          : salesSection === "categories/create"
            ? "sales_category_create"
          : salesSection.startsWith("categories/edit/")
            ? "sales_category_edit"
          : salesSection === "products"
            ? "sales_products"
          : salesSection === "products/create"
            ? "sales_product_create"
          : salesSection.startsWith("products/edit/")
            ? "sales_product_edit"
          : salesSection === "stock"
            ? "sales_stock"
          : salesSection.startsWith("stock/edit/")
            ? "sales_stock_edit"
            : salesSection === "payment-methods"
              ? "sales_payment_methods"
              : salesSection === "coupons-gifts"
                ? "sales_coupons_gifts"
                : salesSection === "coupons-gifts/create"
                  ? "sales_coupons_gifts_create"
                : salesSection.startsWith("coupons-gifts/edit/")
                  ? "sales_coupons_gifts_edit"
                : "sales_overview",
    };
  }

  const entryExitSectionMatch = normalizedPathname.match(
    /^\/servers\/(\d{10,25})\/entry-exit\/(overview|message)\/?$/,
  );
  if (entryExitSectionMatch) {
    return {
      guildId: entryExitSectionMatch[1],
      tab: "settings",
      settingsSection:
        entryExitSectionMatch[2] === "overview"
          ? "entry_exit_overview"
          : "entry_exit_message",
    };
  }

  const captchaSectionMatch = normalizedPathname.match(
    /^\/servers\/(\d{10,25})\/captcha\/(overview|message)\/?$/,
  );
  if (captchaSectionMatch) {
    return {
      guildId: captchaSectionMatch[1],
      tab: "settings",
      settingsSection:
        captchaSectionMatch[2] === "overview"
          ? "captcha_overview"
          : "captcha_message",
    };
  }

  const suggestionsSectionMatch = normalizedPathname.match(
    /^\/servers\/(\d{10,25})\/suggestions\/(overview|message)\/?$/,
  );
  if (suggestionsSectionMatch) {
    return {
      guildId: suggestionsSectionMatch[1],
      tab: "settings",
      settingsSection:
        suggestionsSectionMatch[2] === "overview"
          ? "suggestions_overview"
          : "suggestions_message",
    };
  }

  const batePontoSectionMatch = normalizedPathname.match(
    /^\/servers\/(\d{10,25})\/bate-ponto\/(overview|message|ranking|history)\/?$/,
  );
  if (batePontoSectionMatch) {
    return {
      guildId: batePontoSectionMatch[1],
      tab: "settings",
      settingsSection:
        batePontoSectionMatch[2] === "overview"
          ? "bate_ponto_overview"
          : batePontoSectionMatch[2] === "message"
            ? "bate_ponto_message"
            : batePontoSectionMatch[2] === "ranking"
              ? "bate_ponto_ranking"
              : "bate_ponto_history",
    };
  }

  const securitySectionMatch = normalizedPathname.match(
    /^\/servers\/(\d{10,25})\/security\/(antilink|autorole|logs)\/?$/,
  );
  if (securitySectionMatch) {
    return {
      guildId: securitySectionMatch[1],
      tab: "settings",
      settingsSection:
        securitySectionMatch[2] === "logs"
          ? "security_logs"
          : securitySectionMatch[2] === "autorole"
            ? "security_autorole"
            : "security_antilink",
    };
  }

  return fallback;
}

function buildWorkspacePaneKey(
  guildId: string | null,
  tab: ServerEditorTab,
  settingsSection: ServerSettingsSection,
) {
  if (!guildId) {
    return "overview";
  }

  return `${guildId}:${tab}:${settingsSection}`;
}

function normalizeComparablePath(value: string) {
  if (!value) return "/";
  if (value === "/") return value;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isServersWorkspacePath(pathname: string) {
  if (pathname === "/servers" || pathname.startsWith("/servers/")) {
    return true;
  }

  if (pathname === "/" || pathname === "/plans") {
    return true;
  }

  return /^\/\d{10,25}(?:\/(?:overview|sales\/(?:overview|categories|products|stock(?:\/edit\/prd-[0-9]{8})?|payment-methods|coupons-gifts(?:\/(?:create|edit\/[^/]+))?)|tickets\/(?:overview|message|flowai)|entry-exit\/(?:overview|message)|captcha\/(?:overview|message)|suggestions\/(?:overview|message)|bate-ponto\/(?:overview|message|ranking|history)|security\/(?:antilink|autorole|logs))?)?\/?$/.test(
    pathname,
  );
}

function statusStyle(status: ManagedServerStatus) {
  if (status === "paid") {
    return {
      badgeText: "Em dia",
      badgeClass:
        "border border-[rgba(0,98,255,0.42)] bg-[rgba(0,98,255,0.14)] text-[#8AB6FF]",
      ringColor:
        "conic-gradient(#0062FF 0deg 300deg, rgba(255,255,255,0.08) 300deg 360deg)",
    };
  }

  if (status === "expired") {
    return {
      badgeText: "Expirada",
      badgeClass:
        "border border-[rgba(242,200,35,0.4)] bg-[rgba(242,200,35,0.12)] text-[#F2C823]",
      ringColor:
        "conic-gradient(#F2C823 0deg 220deg, rgba(255,255,255,0.08) 220deg 360deg)",
    };
  }

  if (status === "pending_payment") {
    return {
      badgeText: "Pendente",
      badgeClass:
        "border border-[rgba(242,200,35,0.4)] bg-[rgba(242,200,35,0.12)] text-[#F2C823]",
      ringColor:
        "conic-gradient(#F2C823 0deg 180deg, rgba(255,255,255,0.08) 180deg 360deg)",
    };
  }

  return {
    badgeText: "Desligado",
    badgeClass:
      "border border-[rgba(219,70,70,0.4)] bg-[rgba(219,70,70,0.12)] text-[#DB4646]",
    ringColor:
      "conic-gradient(#DB4646 0deg 140deg, rgba(255,255,255,0.08) 140deg 360deg)",
  };
}

function statusDescription(server: ManagedServer) {
  return buildServerStatusDescription(server, "workspace");
}

function serverMetaLabel(server: ManagedServer) {
  return buildServerMetaLabel(server);
}

function serverAccessBadgeLabel(server: ManagedServer) {
  if (server.accessMode === "owner") return "titular";
  return server.canManage ? "equipe" : "visualizar";
}

function serverAccountChipLabel(server: ManagedServer) {
  if (server.accessMode === "owner") return "conta titular";
  return server.canManage ? "conta da equipe" : "conta vinculada";
}

function resolveServersSyncContent(
  sync: ManagedServersSyncState,
  hasDiscordLink: boolean,
): ServersSyncContent | null {
  if (!hasDiscordLink || sync.requiresDiscordRelink) {
    return {
      actionLabel: "Vincular novamente",
      badgeLabel: "Discord",
      description:
        "O FlowSecure manteve o painel ativo com os dados validados do banco, mas a sincronizacao ao vivo precisa ser refeita para evitar inconsistencias.",
      title: "Reconecte sua conta Discord para concluir a sincronizacao",
    };
  }

  if (!sync.degraded) {
    return null;
  }

  return {
    actionLabel: "Atualizar agora",
    badgeLabel: "FlowSecure",
    description:
      "Entramos em modo seguro para evitar que o painel zere dados validos. O banco continua como fonte principal enquanto a sincronizacao externa se estabiliza.",
    title: "Sincronizacao temporariamente instavel, mas seus servidores continuam protegidos",
  };
}

function WorkspaceAlertPixelAccent({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  const edgeClass = isLeft ? "left-0" : "right-0";
  const columnOpacities = isLeft
    ? [1, 0.96, 0.9, 0.8, 0.66, 0.5, 0.34, 0.2, 0.1, 0.04]
    : [0.04, 0.1, 0.2, 0.34, 0.5, 0.66, 0.8, 0.9, 0.96, 1];
  const rowOpacities = [1, 0.95, 0.88, 0.76, 0.62, 0.46, 0.28];
  const maskImage = isLeft
    ? "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 34%, rgba(0,0,0,0.78) 58%, rgba(0,0,0,0.34) 82%, transparent 100%)"
    : "linear-gradient(270deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 34%, rgba(0,0,0,0.78) 58%, rgba(0,0,0,0.34) 82%, transparent 100%)";

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute ${edgeClass} inset-y-0 hidden items-stretch lg:flex`}
    >
      <span
        className="grid h-full w-[72px] grid-cols-10 grid-rows-7 gap-[2px] px-[2px] py-[2px] md:w-[84px]"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        {rowOpacities.flatMap((rowOpacity, rowIndex) =>
          columnOpacities.map((columnOpacity, columnIndex) => (
            <span
              key={`${side}-${rowIndex}-${columnIndex}`}
              className="rounded-[1px] bg-[linear-gradient(135deg,#FF9A9A_0%,#FF6F6F_42%,#E04747_100%)]"
              style={{ opacity: rowOpacity * columnOpacity }}
            />
          )),
        )}
      </span>
    </span>
  );
}

function SearchIcon() {
  return <SearchLucide className="h-[18px] w-[18px] shrink-0 text-[#6F6F6F]" strokeWidth={1.85} aria-hidden="true" />;
}

function FilterIcon() {
  return <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} aria-hidden="true" />;
}

function ServersEmptyState({
  onPrimaryAction,
  selectedTeamName,
  syncContent,
}: {
  onPrimaryAction?: (() => void) | null;
  selectedTeamName?: string | null;
  syncContent?: ServersSyncContent | null;
}) {
  const title = syncContent?.title || "Nenhum servidor encontrado";
  const description = syncContent?.description
    || (selectedTeamName
      ? `Nao ha servidores vinculados para ${selectedTeamName} com o filtro atual.`
      : "Ajuste a busca ou os filtros para encontrar um servidor.");

  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] px-[20px] py-[48px] text-center">
      <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414]">
        {syncContent ? (
          <Shield className="h-[16px] w-[16px] text-[#C4C4C8]" />
        ) : (
          <FolderKanban className="h-[16px] w-[16px] text-[#C4C4C8]" />
        )}
      </div>
      <p className="mt-[16px] text-[16px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
        {title}
      </p>
      <p className="mt-[8px] max-w-[400px] text-[13px] leading-[1.6] text-[#8B8B90]">
        {description}
      </p>
      {syncContent && onPrimaryAction ? (
        <button
          type="button"
          onClick={onPrimaryAction}
          className="mt-[18px] inline-flex h-[42px] items-center justify-center rounded-[12px] border border-[rgba(0,98,255,0.28)] bg-[rgba(0,98,255,0.12)] px-[16px] text-[13px] font-medium text-[#B9D2FF] transition-colors hover:border-[rgba(0,98,255,0.38)] hover:bg-[rgba(0,98,255,0.18)]"
        >
          {syncContent.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ServersSyncBanner({
  diagnosticsFingerprint,
  onAction,
  syncContent,
}: {
  diagnosticsFingerprint?: string | null;
  onAction: () => void;
  syncContent: ServersSyncContent;
}) {
  return (
    <div className="rounded-[24px] border border-[rgba(0,98,255,0.2)] bg-[linear-gradient(180deg,rgba(8,14,26,0.98)_0%,rgba(5,8,15,0.98)_100%)] p-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
      <div className="flex flex-col gap-[16px] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full border border-[rgba(0,98,255,0.24)] bg-[rgba(0,98,255,0.1)] px-[10px] py-[6px] text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-[#9FC3FF]">
            {syncContent.badgeLabel}
          </span>
          <p className="mt-[14px] text-[17px] leading-[1.35] font-medium tracking-[-0.03em] text-[#EAF1FF]">
            {syncContent.title}
          </p>
          <p className="mt-[8px] max-w-[720px] text-[13px] leading-[1.6] text-[#8D99AD]">
            {syncContent.description}
          </p>
          {diagnosticsFingerprint ? (
            <p className="mt-[10px] text-[11px] uppercase tracking-[0.16em] text-[#5E6D86]">
              Diagnostico FlowSecure: {diagnosticsFingerprint}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-[44px] shrink-0 items-center justify-center rounded-[13px] border border-[rgba(0,98,255,0.28)] bg-[rgba(0,98,255,0.14)] px-[18px] text-[13px] font-semibold text-[#C8DBFF] transition-colors hover:border-[rgba(0,98,255,0.42)] hover:bg-[rgba(0,98,255,0.2)]"
        >
          {syncContent.actionLabel}
        </button>
      </div>
    </div>
  );
}

function GridIcon() {
  return <Grid2x2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />;
}

function ListIcon() {
  return <ListLucide className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />;
}

function MenuDotsIcon() {
  return <Ellipsis className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} aria-hidden="true" />;
}

function CopyIcon() {
  return <CopyLucide className="h-[15px] w-[15px] shrink-0" strokeWidth={1.8} aria-hidden="true" />;
}

function CheckIcon() {
  return <CheckLucide className="h-[15px] w-[15px] shrink-0" strokeWidth={2.2} aria-hidden="true" />;
}

function PlusIcon() {
  return <PlusLucide className="h-[18px] w-[18px] shrink-0" strokeWidth={2.2} aria-hidden="true" />;
}

function TeamIcon() {
  return <Users className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} aria-hidden="true" />;
}

function TeamAvatar({
  iconKey,
  name,
  className = "",
  textClassName = "text-[#F3F3F3]",
}: {
  iconKey: string;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-[12px] ${getTeamIconShell(
        iconKey,
      )} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22)_0%,transparent_58%)]" />
      <span
        className={`relative z-10 text-[14px] leading-none font-semibold tracking-[-0.04em] ${textClassName}`}
      >
        {teamInitial(name)}
      </span>
    </div>
  );
}

function accountInitial(name: string, username: string) {
  const source = name.trim() || username.trim();
  return source ? source.charAt(0).toUpperCase() : "F";
}

function normalizeSavedPanelAccounts(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<SavedPanelAccount>;
      if (
        typeof record.authUserId !== "number" ||
        typeof record.discordUserId !== "string" ||
        typeof record.displayName !== "string" ||
        typeof record.username !== "string" ||
        typeof record.lastSeenAt !== "number"
      ) {
        return null;
      }

      return {
        authUserId: record.authUserId,
        discordUserId: record.discordUserId,
        displayName: record.displayName,
        username: record.username,
        avatarUrl: typeof record.avatarUrl === "string" ? record.avatarUrl : null,
        lastSeenAt: record.lastSeenAt,
      } satisfies SavedPanelAccount;
    })
    .filter((value): value is SavedPanelAccount => value !== null)
    .slice(0, 3);
}

function mergeSavedPanelAccounts(
  currentAccount: SavedPanelAccount,
  previousAccounts: SavedPanelAccount[],
) {
  return [currentAccount, ...previousAccounts.filter((account) => account.discordUserId !== currentAccount.discordUserId)]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, 3);
}

function AccountAvatar({
  avatarUrl,
  displayName,
  username,
  className = "",
}: {
  avatarUrl: string | null;
  displayName: string;
  username: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={displayName}
        width={44}
        height={44}
        className={`rounded-full object-cover ${className}`.trim()}
      />
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,#7D3BFF_0%,#3C0F6D_54%,#170822_100%)] font-semibold text-[#F0F0F0] shadow-[0_0_28px_rgba(125,59,255,0.14)] ${className}`.trim()}
    >
      {accountInitial(displayName, username)}
      <span className="absolute bottom-[2px] right-[2px] h-[8px] w-[8px] rounded-full bg-[#0062FF]" />
    </div>
  );
}

function SidebarWorkspaceIcon() {
  return (
    <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_32%_28%,#E7A540_0%,#C77B12_58%,#6B3600_100%)] shadow-[0_0_30px_rgba(231,165,64,0.18)]">
      <div className="grid h-[18px] w-[18px] grid-cols-3 gap-[2px] opacity-95">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} className="rounded-full bg-[rgba(12,8,0,0.42)]" />
        ))}
      </div>
    </div>
  );
}

function SidebarDropdownChevronIcon() {
  return <ChevronDown className="h-[14px] w-[14px] shrink-0" strokeWidth={1.9} aria-hidden="true" />;
}

function SidebarChevronRightIcon() {
  return <ChevronRight className="h-[14px] w-[14px] shrink-0" strokeWidth={1.9} aria-hidden="true" />;
}

function SidebarSearchShortcutIcon() {
  return (
    <span className="inline-flex h-[28px] min-w-[28px] items-center justify-center rounded-[9px] border border-[#1A1A1A] bg-[#101010] px-[8px] text-[12px] font-medium text-[#A7A7A7]">
      F
    </span>
  );
}

function SidebarNavIcon({
  kind,
  active = false,
}: {
  kind: SidebarItem["kind"];
  active?: boolean;
}) {
  const Icon: LucideIcon = {
    home: LayoutDashboard,
    overview: FolderKanban,
    settings: Settings2,
    ticket: Ticket,
    entry_exit: ArrowRightLeft,
    captcha: ShieldCheck,
    suggestions: Lightbulb,
    bate_ponto: Clock,
    security: Shield,
    sales: ShoppingBag,
    dashboard: ChevronLeft,
    payments: WalletCards,
    methods: Workflow,
    plans: BadgePercent,
    analytics: BarChart3,
    integrations: PlugZap,
    storage: HardDrive,
    support: LifeBuoy,
    preferences: Cog,
  }[kind];

  return <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2 : 1.85} aria-hidden="true" />;
}

function StatusRing({ status }: { status: ManagedServerStatus }) {
  const style = statusStyle(status);
  const dotColorClass =
    status === "paid"
      ? "bg-[#0062FF]"
      : status === "expired" || status === "pending_payment"
        ? "bg-[#F2C823]"
        : "bg-[#DB4646]";
  return (
    <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full p-[2px]" style={{ background: style.ringColor }} aria-hidden="true">
      <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0A0A0A]">
        <div className={`h-[8px] w-[8px] rounded-full ${dotColorClass}`} />
      </div>
    </div>
  );
}

function FallbackServerIcon() {
  return (
    <div className="flex h-[48px] w-[48px] items-center justify-center rounded-[14px] border border-[#1C1C1C] bg-[#141414] text-[13px] font-semibold text-[#C4C4C8]">
      FD
    </div>
  );
}

const SERVER_SKELETON_OPACITY_LEVELS = [1, 0.76, 0.58] as const;

function ServerSkeletonBlock({ className }: { className: string }) {
  return <div className={`flowdesk-shimmer ${className}`.trim()} />;
}

function ServerOverviewSkeletonCard({ index }: { index: number }) {
  const opacity =
    SERVER_SKELETON_OPACITY_LEVELS[
      Math.min(index, SERVER_SKELETON_OPACITY_LEVELS.length - 1)
    ];

  return (
    <article
      className="p-[6px]"
      style={{
        opacity,
        animationDelay: `${index * 36}ms`,
      }}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-[14px]">
        <div className="flex min-w-0 items-start gap-[14px]">
          <ServerSkeletonBlock className="h-[48px] w-[48px] rounded-full bg-[#171717]" />
          <div className="min-w-0 flex-1">
            <ServerSkeletonBlock className="h-[16px] w-[160px] max-w-full rounded-full bg-[#171717]" />
            <ServerSkeletonBlock className="mt-[10px] h-[12px] w-[122px] max-w-full rounded-full bg-[#171717]" />
          </div>
        </div>
        <ServerSkeletonBlock className="h-[28px] w-[72px] rounded-full bg-[#171717]" />
      </div>
      <ServerSkeletonBlock className="mt-[18px] h-[12px] w-[92%] rounded-full bg-[#171717]" />
      <ServerSkeletonBlock className="mt-[10px] h-[12px] w-[68%] rounded-full bg-[#171717]" />
    </article>
  );
}

function ServerListSkeletonRow({ index }: { index: number }) {
  const opacity =
    SERVER_SKELETON_OPACITY_LEVELS[
      Math.min(index, SERVER_SKELETON_OPACITY_LEVELS.length - 1)
    ];

  return (
    <article
      className="px-[4px] py-[14px]"
      style={{
        opacity,
        animationDelay: `${index * 36}ms`,
      }}
      aria-hidden="true"
    >
      <div className="flex items-center gap-[14px]">
        <ServerSkeletonBlock className="h-[40px] w-[40px] rounded-full bg-[#171717]" />
        <div className="min-w-0 flex-1 space-y-[8px]">
          <ServerSkeletonBlock className="h-[14px] w-[160px] max-w-full rounded-full bg-[#171717]" />
          <ServerSkeletonBlock className="h-[11px] w-[110px] rounded-full bg-[#171717]" />
        </div>
        <ServerSkeletonBlock className="h-[12px] w-[88px] rounded-full bg-[#171717]" />
      </div>
    </article>
  );
}

function ServersOverviewSkeletonGrid() {
  return (
    <div className="grid gap-[14px] xl:grid-cols-2">
      {Array.from({ length: 3 }, (_, index) => (
        <ServerOverviewSkeletonCard key={index} index={index} />
      ))}
    </div>
  );
}

function ServersListSkeleton() {
  return (
    <div className="space-y-[12px]">
      {Array.from({ length: 3 }, (_, index) => (
        <ServerListSkeletonRow key={index} index={index} />
      ))}
    </div>
  );
}

function ServerCardMenu({
  guildId,
  isOpen,
  onOpen,
  onToggleMenu,
  onCopyFromMenu,
}: {
  guildId: string;
  isOpen: boolean;
  onOpen: (guildId: string) => void;
  onToggleMenu: (guildId: string) => void;
  onCopyFromMenu: (guildId: string) => void;
}) {
  return (
    <div
      className={`relative ${isOpen ? "z-[80]" : "z-0"}`}
      data-server-card-menu-root="true"
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleMenu(guildId);
        }}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#8B8B90] transition-colors hover:border-[#2A2A2E] hover:text-[#F2F2F3]"
        aria-label="Abrir menu do servidor"
      >
        <MenuDotsIcon />
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-[42px] z-[160] min-w-[188px] rounded-[14px] border border-[#1C1C1C] bg-[#141414] p-[6px]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(guildId);
              onToggleMenu(guildId);
            }}
            className="flex w-full items-center rounded-[10px] px-[12px] py-[10px] text-left text-[13px] text-[#D4D4D8] transition-colors hover:bg-[#1A1A1A]"
          >
            Abrir visao geral
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCopyFromMenu(guildId);
            }}
            className="mt-[2px] flex w-full items-center rounded-[10px] px-[12px] py-[10px] text-left text-[13px] text-[#D4D4D8] transition-colors hover:bg-[#1A1A1A]"
          >
            Copiar ID
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ServerListRow({
  server,
  index,
  isSelected,
  isCopied,
  openCardMenuGuildId,
  onOpen,
  onPrefetch,
  onCopy,
  onToggleMenu,
  onCopyFromMenu,
}: {
  server: ManagedServer;
  index: number;
  isSelected: boolean;
  isCopied: boolean;
  openCardMenuGuildId: string | null;
  onOpen: (guildId: string) => void;
  onPrefetch: (guildId: string) => void;
  onCopy: (guildId: string) => void;
  onToggleMenu: (guildId: string) => void;
  onCopyFromMenu: (guildId: string) => void;
}) {
  const style = statusStyle(server.status);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: Math.min(index, 8) * 0.04, ease: projectEase }}
      className={`${projectCardClass} relative cursor-pointer px-[16px] py-[14px] ${isSelected ? "border-[#2A2A2E] bg-[#111111]" : ""}`}
      onClick={() => onOpen(server.guildId)}
      onMouseEnter={() => onPrefetch(server.guildId)}
      onFocus={() => onPrefetch(server.guildId)}
      onPointerDown={() => onPrefetch(server.guildId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(server.guildId);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex flex-col gap-[14px] xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-[14px]">
          {server.iconUrl ? (
            <Image src={server.iconUrl} alt={server.guildName} width={48} height={48} className="h-[48px] w-[48px] rounded-[14px] object-cover" />
          ) : (
            <FallbackServerIcon />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
              <h3 className="truncate text-[16px] leading-none font-semibold tracking-[-0.03em] text-[#F2F2F3]">{server.guildName}</h3>
              <span className={`inline-flex items-center rounded-full px-[8px] py-[4px] text-[11px] font-medium ${style.badgeClass}`}>{style.badgeText}</span>
            </div>
            <p className="mt-[8px] truncate text-[12px] text-[#8B8B90]">{serverMetaLabel(server)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-[10px] xl:justify-end">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCopy(server.guildId);
            }}
            className={`inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[6px] text-[12px] transition-colors ${
              isCopied
                ? "border-[#2A2A2E] bg-[#141414] text-[#C4C4C8]"
                : "border-[#1C1C1C] bg-[#141414] text-[#8B8B90] hover:text-[#F2F2F3]"
            }`}
          >
            {isCopied ? "Copiado" : "Copiar ID"}
          </button>
          <span className="text-[12px] text-[#8B8B90]">{serverAccessBadgeLabel(server)}</span>
          <ArrowUpRight className="h-[15px] w-[15px] text-[#5A5A5E]" strokeWidth={2} />
          <ServerCardMenu
            guildId={server.guildId}
            isOpen={openCardMenuGuildId === server.guildId}
            onOpen={onOpen}
            onToggleMenu={onToggleMenu}
            onCopyFromMenu={onCopyFromMenu}
          />
        </div>
      </div>
    </motion.article>
  );
}

function ServerGridCard({
  server,
  index,
  isSelected,
  isCopied,
  openCardMenuGuildId,
  onOpen,
  onPrefetch,
  onCopy,
  onToggleMenu,
  onCopyFromMenu,
}: {
  server: ManagedServer;
  index: number;
  isSelected: boolean;
  isCopied: boolean;
  openCardMenuGuildId: string | null;
  onOpen: (guildId: string) => void;
  onPrefetch: (guildId: string) => void;
  onCopy: (guildId: string) => void;
  onToggleMenu: (guildId: string) => void;
  onCopyFromMenu: (guildId: string) => void;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: Math.min(index, 8) * 0.05, ease: projectEase }}
      whileHover={{ y: -3 }}
      className={`${projectCardClass} group relative cursor-pointer px-[18px] py-[16px] ${isSelected ? "border-[#2A2A2E] bg-[#111111]" : ""}`}
      onClick={() => onOpen(server.guildId)}
      onMouseEnter={() => onPrefetch(server.guildId)}
      onFocus={() => onPrefetch(server.guildId)}
      onPointerDown={() => onPrefetch(server.guildId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(server.guildId);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex min-w-0 items-center gap-[12px]">
          {server.iconUrl ? (
            <Image
              src={server.iconUrl}
              alt={server.guildName}
              width={48}
              height={48}
              className="h-[48px] w-[48px] rounded-[14px] object-cover"
            />
          ) : (
            <FallbackServerIcon />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[20px] leading-none font-semibold tracking-[-0.04em] text-[#F2F2F3]">
              {server.guildName}
            </h3>
            <p className="mt-[8px] truncate text-[12px] text-[#8B8B90]">
              {serverMetaLabel(server)}
            </p>
          </div>
        </div>
        <ServerCardMenu
          guildId={server.guildId}
          isOpen={openCardMenuGuildId === server.guildId}
          onOpen={onOpen}
          onToggleMenu={onToggleMenu}
          onCopyFromMenu={onCopyFromMenu}
        />
      </div>

      <div className="mt-[16px]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCopy(server.guildId);
          }}
          className={`inline-flex min-w-0 max-w-full items-center gap-[6px] rounded-full border px-[10px] py-[6px] text-[12px] transition-colors ${
            isCopied
              ? "border-[#2A2A2E] bg-[#141414] text-[#C4C4C8]"
              : "border-[#1C1C1C] bg-[#141414] text-[#8B8B90] hover:text-[#F2F2F3]"
          }`}
        >
          <span className="truncate">{isCopied ? "ID copiado" : server.guildId}</span>
        </button>
      </div>

      <div className="mt-[16px] flex items-end justify-between gap-[12px]">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[#F2F2F3]">
            {statusDescription(server)}
          </p>
          <p className="mt-[6px] text-[12px] text-[#6F6F74]">
            {serverAccessBadgeLabel(server)} · {serverAccountChipLabel(server)}
          </p>
        </div>
        <ArrowUpRight className="h-[15px] w-[15px] shrink-0 text-[#5A5A5E] transition-transform group-hover:translate-x-[1px] group-hover:-translate-y-[1px] group-hover:text-[#D4D4D8]" strokeWidth={2} />
      </div>
    </motion.article>
  );
}

export function ServersWorkspace({
  currentAccount: initialCurrentAccount,
  initialGuildId = null,
  initialTab = "settings",
  initialSettingsSection = "overview",
  initialServers = null,
  initialServersSync = null,
  initialTeams = null,
  initialPendingInvites = null,
}: ServersWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentAccount = useLiveAccountProfile(initialCurrentAccount);
  const workspaceCacheKey = `${currentAccount.authUserId}:${currentAccount.discordUserId ?? "no-discord"}`;
  const initialServersSnapshot =
    initialServers ?? readManagedServersMemoryCache(workspaceCacheKey);
  const initialTeamsSnapshot =
    initialTeams
      ? {
          teams: initialTeams,
          pendingInvites: initialPendingInvites ?? [],
        }
      : readTeamsSnapshotMemoryCache(workspaceCacheKey);
  const [servers, setServers] = useState<ManagedServer[]>(initialServersSnapshot ?? []);
  const [teamServers, setTeamServers] = useState<ManagedServer[]>([]);
  const [isTeamServersLoading, setIsTeamServersLoading] = useState(
    Boolean(currentAccount.discordUserId),
  );
  const [serversSync, setServersSync] = useState<ManagedServersSyncState>(
    initialServersSync ?? (
      currentAccount.discordUserId
        ? DEFAULT_MANAGED_SERVERS_SYNC_STATE
        : {
            ...DEFAULT_MANAGED_SERVERS_SYNC_STATE,
            degraded: true,
            reason: "discord_not_linked",
            requiresDiscordRelink: true,
            usedDatabaseFallback: true,
          }
    ),
  );
  const [isLoading, setIsLoading] = useState(initialServersSnapshot === null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isResolvingAddServer, setIsResolvingAddServer] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sidebarSearchText, setSidebarSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterOption>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [copiedGuildId, setCopiedGuildId] = useState<string | null>(null);
  const [openCardMenuGuildId, setOpenCardMenuGuildId] = useState<string | null>(null);
  const [teams, setTeams] = useState<UserTeam[]>(initialTeamsSnapshot?.teams ?? []);
  const [pendingTeamInvites, setPendingTeamInvites] = useState<PendingTeamInvite[]>(
    initialTeamsSnapshot?.pendingInvites ?? [],
  );
  const [isTeamsLoading, setIsTeamsLoading] = useState(initialTeamsSnapshot === null);
  const [teamsErrorMessage, setTeamsErrorMessage] = useState<string | null>(null);
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [createTeamStep, setCreateTeamStep] = useState<CreateTeamStep>("name");
  const [createTeamName, setCreateTeamName] = useState("");
  const [createTeamIconKey, setCreateTeamIconKey] = useState<string>("aurora");
  const [createTeamServerIds, setCreateTeamServerIds] = useState<string[]>([]);
  const [createTeamMemberIds, setCreateTeamMemberIds] = useState<string[]>([]);
  const [isMemberSubmodalOpen, setIsMemberSubmodalOpen] = useState(false);
  const [memberDraftIds, setMemberDraftIds] = useState<string[]>([""]);
  const [savedAccounts, setSavedAccounts] = useState<SavedPanelAccount[]>([]);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isDiscordReconnectModalOpen, setIsDiscordReconnectModalOpen] = useState(
    !currentAccount.discordUserId,
  );
  const [teamActionMessage, setTeamActionMessage] = useState<string | null>(null);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [acceptingTeamId, setAcceptingTeamId] = useState<number | null>(null);
  const [selectedGuildIdForConfig, setSelectedGuildIdForConfig] = useState<string | null>(initialGuildId);
  const [selectedEditorTabForConfig, setSelectedEditorTabForConfig] = useState<ServerEditorTab>(initialTab);
  const [selectedSettingsSectionForConfig, setSelectedSettingsSectionForConfig] =
    useState<ServerSettingsSection>(initialSettingsSection);
  const [hasUnsavedSettingsChanges, setHasUnsavedSettingsChanges] = useState(false);
  const [navigationBlockSignal, setNavigationBlockSignal] = useState(0);
  const hasUnsavedSettingsChangesRef = useRef(false);
  const [isSalesSidebarOpen, setIsSalesSidebarOpen] = useState(false);
  const [isTicketSidebarOpen, setIsTicketSidebarOpen] = useState(false);
  const [isEntryExitSidebarOpen, setIsEntryExitSidebarOpen] = useState(false);
  const [isCaptchaSidebarOpen, setIsCaptchaSidebarOpen] = useState(false);
  const [isSuggestionsSidebarOpen, setIsSuggestionsSidebarOpen] = useState(false);
  const [isBatePontoSidebarOpen, setIsBatePontoSidebarOpen] = useState(false);
  const [isSecuritySidebarOpen, setIsSecuritySidebarOpen] = useState(false);
  const [currentDashboardPermissions, setCurrentDashboardPermissions] = useState<string[] | "full">([]);
  const [pendingWorkspacePaneKey, setPendingWorkspacePaneKey] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const desktopTeamMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileTeamMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopSidebarSearchInputRef = useRef<HTMLInputElement | null>(null);
  const lastServersRecoveryAtRef = useRef(0);
  const selectedServerRecoveryRef = useRef<{
    guildId: string | null;
    attempts: number;
  }>({ guildId: null, attempts: 0 });
  const [serversReloadToken, setServersReloadToken] = useState(0);
  const [teamsReloadToken, setTeamsReloadToken] = useState(0);
  const previousRouteGuildIdRef = useRef<string | null>(null);
  const serversRef = useRef<ManagedServer[]>(initialServersSnapshot ?? []);
  const [, startOpenServerTransition] = useTransition();

  const isEditingServer = Boolean(selectedGuildIdForConfig);

  const routeState = useMemo(() => parseWorkspaceRoute(pathname), [pathname]);
  const routeGuildId = routeState.guildId;
  const resolvedWorkspacePaneKey = useMemo(
    () =>
      buildWorkspacePaneKey(
        selectedGuildIdForConfig,
        selectedEditorTabForConfig,
        selectedSettingsSectionForConfig,
      ),
    [
      selectedEditorTabForConfig,
      selectedGuildIdForConfig,
      selectedSettingsSectionForConfig,
    ],
  );
  const latchedPendingWorkspacePaneKey = useLatchedPendingKey({
    pendingKey: pendingWorkspacePaneKey,
    resolvedKey: resolvedWorkspacePaneKey,
  });

  const requestServersReload = useCallback((options?: { silent?: boolean }) => {
    setErrorMessage(null);
    if (!(options?.silent && servers.length > 0)) {
      setIsLoading(true);
    }
    setServersReloadToken((current) => current + 1);
  }, [servers.length]);

  const requestTeamsReload = useCallback((options?: { silent?: boolean }) => {
    setTeamsErrorMessage(null);
    if (!(options?.silent && (teams.length > 0 || pendingTeamInvites.length > 0))) {
      setIsTeamsLoading(true);
    }
    setTeamsReloadToken((current) => current + 1);
  }, [pendingTeamInvites.length, teams.length]);
  const isDiscordRelinkRequired =
    !currentAccount.discordUserId || serversSync.requiresDiscordRelink;
  const serversSyncContent = useMemo(
    () => resolveServersSyncContent(serversSync, Boolean(currentAccount.discordUserId)),
    [currentAccount.discordUserId, serversSync],
  );

  const applyTeamsSnapshot = useCallback(
    (payload: TeamsApiResponse, preferredTeamId: number | null = null) => {
      const nextTeams = payload.teams || [];
      const nextPendingInvites = payload.pendingInvites || [];
      storeCachedTeamsSnapshot(
        workspaceCacheKey,
        nextTeams,
        nextPendingInvites,
      );
      setTeams(nextTeams);
      setPendingTeamInvites(nextPendingInvites);
      setSelectedTeamId((current) => {
        if (preferredTeamId && nextTeams.some((team) => team.id === preferredTeamId)) {
          return preferredTeamId;
        }
        if (current && nextTeams.some((team) => team.id === current)) {
          return current;
        }
        const storedTeamId = readStoredSelectedTeamId(workspaceCacheKey);
        if (storedTeamId && nextTeams.some((team) => team.id === storedTeamId)) {
          return storedTeamId;
        }
        return null;
      });
      setTeamsErrorMessage(null);
      setIsTeamsLoading(false);
    },
    [workspaceCacheKey],
  );

  const loadTeamServerCatalog = useCallback(async () => {
    if (!currentAccount.discordUserId) {
      setTeamServers([]);
      setIsTeamServersLoading(false);
      return;
    }

    setIsTeamServersLoading(true);

    try {
      const payload = await fetchClientData<{
        ok?: boolean;
        servers?: ManagedServer[];
      }>(
        "/api/auth/me/servers/team-catalog",
        { cache: "no-store" },
        {
          cacheKey: `team-catalog:${workspaceCacheKey}`,
          cacheTtlMs: 30_000,
          timeoutMs: 2800,
          storage: "memory",
        },
      );

      if (!payload.ok) {
        return;
      }

      setTeamServers(payload.servers || []);
    } catch {
      // noop
    } finally {
      setIsTeamServersLoading(false);
    }
  }, [currentAccount.discordUserId, workspaceCacheKey]);

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_PANEL_ACCOUNTS_KEY);
      const previousAccounts = normalizeSavedPanelAccounts(raw ? JSON.parse(raw) : []);
      const nextAccounts = currentAccount.discordUserId
        ? mergeSavedPanelAccounts(
            {
              ...currentAccount,
              discordUserId: currentAccount.discordUserId,
              lastSeenAt: Date.now(),
            },
            previousAccounts,
          )
        : previousAccounts;
      setSavedAccounts(nextAccounts);
      window.localStorage.setItem(SAVED_PANEL_ACCOUNTS_KEY, JSON.stringify(nextAccounts));
    } catch {
      setSavedAccounts(
        currentAccount.discordUserId
          ? [
              {
                ...currentAccount,
                discordUserId: currentAccount.discordUserId,
                lastSeenAt: Date.now(),
              },
            ]
          : [],
      );
    }
  }, [currentAccount]);

  useEffect(() => {
    if (initialServers !== null) {
      storeCachedManagedServers(workspaceCacheKey, initialServers);
      setServers(initialServers);
      setServersSync(initialServersSync ?? DEFAULT_MANAGED_SERVERS_SYNC_STATE);
      return;
    }

    const cachedServers = readCachedManagedServers(workspaceCacheKey);
    if (!cachedServers) {
      return;
    }

    setServers(cachedServers);
    setServersSync(
      initialServersSync ?? (
        currentAccount.discordUserId
          ? DEFAULT_MANAGED_SERVERS_SYNC_STATE
          : {
              ...DEFAULT_MANAGED_SERVERS_SYNC_STATE,
              degraded: true,
              reason: "discord_not_linked",
              requiresDiscordRelink: true,
              usedDatabaseFallback: true,
            }
      ),
    );
    setErrorMessage(null);
    setIsLoading(false);
  }, [currentAccount.discordUserId, initialServers, initialServersSync, workspaceCacheKey]);

  useEffect(() => {
    if (initialTeams !== null) {
      storeCachedTeamsSnapshot(
        workspaceCacheKey,
        initialTeams,
        initialPendingInvites ?? [],
      );
      setTeams(initialTeams);
      setPendingTeamInvites(initialPendingInvites ?? []);
      return;
    }

    const cachedTeamsSnapshot = readCachedTeamsSnapshot(workspaceCacheKey);
    if (!cachedTeamsSnapshot) {
      return;
    }

    setTeams(cachedTeamsSnapshot.teams);
    setPendingTeamInvites(cachedTeamsSnapshot.pendingInvites);
    setTeamsErrorMessage(null);
    setIsTeamsLoading(false);
  }, [initialPendingInvites, initialTeams, workspaceCacheKey]);

  useEffect(() => {
    if (!teams.length) {
      setSelectedTeamId(null);
      return;
    }

    const storedTeamId = readStoredSelectedTeamId(workspaceCacheKey);
    if (!storedTeamId || !teams.some((team) => team.id === storedTeamId)) {
      return;
    }

    setSelectedTeamId((current) => (current === storedTeamId ? current : storedTeamId));
  }, [teams, workspaceCacheKey]);

  useEffect(() => {
    writeStoredSelectedTeamId(workspaceCacheKey, selectedTeamId);
  }, [selectedTeamId, workspaceCacheKey]);

  useEffect(() => {
    let isMounted = true;
    let activeController: AbortController | null = null;
    let activeTimeoutId: number | null = null;
    let retryTimeoutId: number | null = null;
    let requestAttempt = 0;
    let isRequestInFlight = false;
    let hasTriggeredRefresh = false;

    function clearActiveTimeout() {
      if (activeTimeoutId !== null) {
        window.clearTimeout(activeTimeoutId);
        activeTimeoutId = null;
      }
    }

    function clearRetryTimeout() {
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
    }

    function scheduleRetry(reason: "abort" | "network" | "online") {
      if (!isMounted) return;

      requestAttempt += 1;
      setErrorMessage(null);
      setIsLoading(true);

      if (requestAttempt >= 3 && !hasTriggeredRefresh) {
        hasTriggeredRefresh = true;
        router.refresh();
      }

      const retryDelayMs =
        reason === "online"
          ? 120
          : reason === "abort"
            ? Math.min(1200 * requestAttempt, 5000)
            : Math.min(900 * requestAttempt, 5000);

      clearRetryTimeout();
      retryTimeoutId = window.setTimeout(() => {
        if (!isMounted) return;
        void loadServers();
      }, retryDelayMs);
    }

    async function loadServers() {
      if (isRequestInFlight || !isMounted) {
        return;
      }

      isRequestInFlight = true;
      clearRetryTimeout();
      const controller = new AbortController();
      activeController = controller;
      clearActiveTimeout();
      activeTimeoutId = window.setTimeout(() => controller.abort("timeout"), 6500);

      try {
        const serversEndpoint =
          serversReloadToken > 0
            ? "/api/auth/me/servers?fresh=1"
            : "/api/auth/me/servers";
        const payload = await fetchClientData<ServersApiResponse>(
          serversEndpoint,
          {
            cache: "no-store",
            signal: controller.signal,
          },
          {
            cacheKey: `servers:${workspaceCacheKey}:${serversReloadToken > 0 ? "fresh" : "warm"}`,
            cacheTtlMs: serversReloadToken > 0 ? 1200 : 0,
            timeoutMs: serversReloadToken > 0 ? 6500 : 3200,
            storage: "memory",
          },
        );
        if (!isMounted) return;
        if (!payload.ok) {
          const message = payload.message || "Falha ao carregar servidores.";
          throw new Error(message);
        }
        requestAttempt = 0;
        hasTriggeredRefresh = false;
        const nextSync = payload.sync || DEFAULT_MANAGED_SERVERS_SYNC_STATE;
        const nextServers = payload.servers || [];
        const cachedServers = readCachedManagedServers(workspaceCacheKey) || [];
        const fallbackServers =
          serversRef.current.length > 0 ? serversRef.current : cachedServers;
        const shouldPreserveCurrentServers =
          nextSync.degraded && nextServers.length === 0 && fallbackServers.length > 0;

        setServersSync(nextSync);
        if (shouldPreserveCurrentServers) {
          storeCachedManagedServers(workspaceCacheKey, fallbackServers);
          setServers(fallbackServers);
        } else {
          storeCachedManagedServers(workspaceCacheKey, nextServers);
          setServers(nextServers);
        }
        setErrorMessage(null);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) return;
        const isAbortError =
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && (error.name === "AbortError" || error.message === "unmount")) ||
          (error && typeof error === "object" && "name" in error && error.name === "AbortError");
        const isNonRetryable =
          error instanceof Error &&
          (("cause" in error && error.cause === "non_retryable") ||
            ("responseStatus" in error &&
              (error.responseStatus === 401 || error.responseStatus === 403)));

        if (isNonRetryable) {
          setErrorMessage(error instanceof Error ? error.message : "Erro ao carregar servidores.");
          setServers([]);
          setIsLoading(false);
          return;
        }

        scheduleRetry(isAbortError ? "abort" : "network");
      } finally {
        isRequestInFlight = false;
        clearActiveTimeout();
        if (activeController === controller) {
          activeController = null;
        }
      }
    }

    function handleOnline() {
      if (!isMounted) return;
      if (isRequestInFlight) return;
      scheduleRetry("online");
    }

    window.addEventListener("online", handleOnline);
    void loadServers();
    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
      clearRetryTimeout();
      clearActiveTimeout();
      activeController?.abort("unmount");
    };
  }, [router, serversReloadToken, workspaceCacheKey]);

  useEffect(() => {
    setSelectedGuildIdForConfig((current) => {
      if (current === routeGuildId) {
        return current;
      }
      return routeGuildId;
    });
    setSelectedEditorTabForConfig(routeState.tab);
    setSelectedSettingsSectionForConfig(routeState.settingsSection);
  }, [routeGuildId, routeState.settingsSection, routeState.tab]);

  useEffect(() => {
    if (!pendingWorkspacePaneKey || pendingWorkspacePaneKey !== resolvedWorkspacePaneKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingWorkspacePaneKey(null);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingWorkspacePaneKey, resolvedWorkspacePaneKey]);

  useEffect(() => {
    const previousRouteGuildId = previousRouteGuildIdRef.current;

    if (previousRouteGuildId && !routeGuildId && servers.length > 0) {
      requestServersReload({ silent: true });
      requestTeamsReload({ silent: true });
    }

    previousRouteGuildIdRef.current = routeGuildId;
  }, [
    requestServersReload,
    requestTeamsReload,
    routeGuildId,
    servers.length,
  ]);

  useEffect(() => {
    let isMounted = true;
    let activeController: AbortController | null = null;
    let activeTimeoutId: number | null = null;
    let retryTimeoutId: number | null = null;
    let requestAttempt = 0;
    let isRequestInFlight = false;
    let hasTriggeredRefresh = false;

    function clearActiveTimeout() {
      if (activeTimeoutId !== null) {
        window.clearTimeout(activeTimeoutId);
        activeTimeoutId = null;
      }
    }

    function clearRetryTimeout() {
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
    }

    function scheduleRetry(reason: "abort" | "network" | "online") {
      if (!isMounted) return;

      requestAttempt += 1;
      setTeamsErrorMessage(null);
      setIsTeamsLoading(true);

      if (requestAttempt >= 3 && !hasTriggeredRefresh) {
        hasTriggeredRefresh = true;
        router.refresh();
      }

      const retryDelayMs =
        reason === "online"
          ? 180
          : reason === "abort"
            ? Math.min(1200 * requestAttempt, 4500)
            : Math.min(900 * requestAttempt, 4500);

      clearRetryTimeout();
      retryTimeoutId = window.setTimeout(() => {
        if (!isMounted) return;
        void loadTeams();
      }, retryDelayMs);
    }

    async function loadTeams() {
      if (isRequestInFlight || !isMounted) {
        return;
      }

      isRequestInFlight = true;
      clearRetryTimeout();
      const controller = new AbortController();
      activeController = controller;
      clearActiveTimeout();
      activeTimeoutId = window.setTimeout(() => controller.abort("timeout"), 5200);

      try {
        const payload = await fetchClientData<TeamsApiResponse>(
          "/api/auth/me/teams",
          {
            cache: "no-store",
            signal: controller.signal,
          },
          {
            cacheKey: `teams:${workspaceCacheKey}`,
            cacheTtlMs: 30_000,
            timeoutMs: 3000,
            storage: "memory",
          },
        );
        if (!isMounted) return;
        if (!payload.ok) {
          const message = payload.message || "Falha ao carregar equipes.";
          throw new Error(message);
        }
        requestAttempt = 0;
        hasTriggeredRefresh = false;
        applyTeamsSnapshot(payload);
        setTeamsErrorMessage(null);
        setIsTeamsLoading(false);
      } catch (error) {
        if (!isMounted) return;
        const isAbortError =
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && (error.name === "AbortError" || error.message === "unmount")) ||
          (error && typeof error === "object" && "name" in error && error.name === "AbortError");
        const isNonRetryable =
          error instanceof Error &&
          (("cause" in error && error.cause === "non_retryable") ||
            ("responseStatus" in error &&
              (error.responseStatus === 401 || error.responseStatus === 403)));

        if (isNonRetryable) {
          setTeamsErrorMessage(
            error instanceof Error ? error.message : "Erro ao carregar equipes.",
          );
          setIsTeamsLoading(false);
          return;
        }

        scheduleRetry(isAbortError ? "abort" : "network");
      } finally {
        isRequestInFlight = false;
        clearActiveTimeout();
        if (activeController === controller) {
          activeController = null;
        }
      }
    }

    function handleOnline() {
      if (!isMounted) return;
      if (isRequestInFlight) return;
      scheduleRetry("online");
    }

    window.addEventListener("online", handleOnline);
    void loadTeams();

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
      clearRetryTimeout();
      clearActiveTimeout();
      activeController?.abort("unmount");
    };
  }, [applyTeamsSnapshot, router, teamsReloadToken, workspaceCacheKey]);

  useEffect(() => {
    function shouldRecoverDashboardState() {
      if (!pathname?.startsWith("/servers")) return false;
      if (isLoading || isTeamsLoading) return false;
      if (errorMessage || teamsErrorMessage) return false;
      if (servers.length > 0 || teams.length > 0) return false;
      return true;
    }

    function recoverDashboardState(force = false) {
      if (!shouldRecoverDashboardState()) return;

      const now = Date.now();
      if (!force && now - lastServersRecoveryAtRef.current < 5000) {
        return;
      }

      lastServersRecoveryAtRef.current = now;
      requestServersReload();
      requestTeamsReload();
    }

    function handlePageShow() {
      recoverDashboardState(true);
    }

    function handleWindowFocus() {
      recoverDashboardState();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        recoverDashboardState();
      }
    }

    recoverDashboardState();
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    errorMessage,
    isLoading,
    isTeamsLoading,
    pathname,
    requestServersReload,
    requestTeamsReload,
    servers.length,
    teams.length,
    teamsErrorMessage,
  ]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && statusRef.current && !statusRef.current.contains(target)) setIsStatusOpen(false);
      if (target instanceof Element && !target.closest("[data-server-card-menu-root='true']")) setOpenCardMenuGuildId(null);
      const clickedInsideDesktopMenu =
        target && desktopTeamMenuRef.current
          ? desktopTeamMenuRef.current.contains(target)
          : false;
      const clickedInsideMobileMenu =
        target && mobileTeamMenuRef.current
          ? mobileTeamMenuRef.current.contains(target)
          : false;
      if (!clickedInsideDesktopMenu && !clickedInsideMobileMenu) {
        setIsTeamMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsStatusOpen(false);
        setOpenCardMenuGuildId(null);
        setIsTeamMenuOpen(false);
        setIsProfileMenuOpen(false);
        setIsMemberSubmodalOpen(false);
        setIsCreateTeamModalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const normalizedQuery = useMemo(() => normalizeSearchText(searchText), [searchText]);
  const normalizedSidebarQuery = useMemo(
    () => normalizeSearchText(sidebarSearchText),
    [sidebarSearchText],
  );
  const normalizedInviteDraftDiscordIds = useMemo(() => {
    return Array.from(
      new Set(
        memberDraftIds
          .map((value) => value.trim())
          .filter((value) => /^\d{10,25}$/.test(value)),
      ),
    ).slice(0, 30);
  }, [memberDraftIds]);
  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [selectedTeamId, teams],
  );
  useEffect(() => {
    if (!currentAccount.discordUserId) {
      setIsDiscordReconnectModalOpen(true);
      return;
    }

    if (!isDiscordRelinkRequired) {
      setIsDiscordReconnectModalOpen(false);
    }
  }, [currentAccount.discordUserId, isDiscordRelinkRequired]);

  useBodyScrollLock(isCreateTeamModalOpen || isDiscordReconnectModalOpen);
  const linkedGuildIdsInTeams = useMemo(
    () => new Set(teams.flatMap((team) => team.linkedGuildIds)),
    [teams],
  );
  const teamCatalogSnapshotKey = useMemo(
    () =>
      teams
        .map(
          (team) =>
            `${team.id}:${[...team.linkedGuildIds].sort((left, right) => left.localeCompare(right)).join(",")}`,
        )
        .sort((left, right) => left.localeCompare(right))
        .join("|"),
    [teams],
  );
  const panelVisibleServers = useMemo(
    () => servers.filter((server) => server.isPanelVisible),
    [servers],
  );
  const emptyStateSyncContent =
    panelVisibleServers.length === 0 ? serversSyncContent : null;
  const teamServerOptions = useMemo(
    () =>
      [...teamServers].sort((a, b) =>
        a.guildName.localeCompare(b.guildName, "pt-BR"),
      ),
    [teamServers],
  );
  const availableTeamServerOptions = useMemo(
    () =>
      teamServerOptions.filter(
        (server) =>
          server.canLinkToTeam &&
          !server.isLinkedToTeam &&
          !linkedGuildIdsInTeams.has(server.guildId),
      ),
    [linkedGuildIdsInTeams, teamServerOptions],
  );
  const availableTeamServerIdSet = useMemo(
    () => new Set(availableTeamServerOptions.map((server) => server.guildId)),
    [availableTeamServerOptions],
  );
  useEffect(() => {
    void loadTeamServerCatalog();
  }, [loadTeamServerCatalog, teamCatalogSnapshotKey]);
  const visibleServers = useMemo(() => {
    if (!selectedTeam) return panelVisibleServers;
    const allowedGuildIds = new Set(selectedTeam.linkedGuildIds);
    return panelVisibleServers.filter((server) => allowedGuildIds.has(server.guildId));
  }, [panelVisibleServers, selectedTeam]);

  const filteredServers = useMemo(() => {
    const baseServers =
      statusFilter === "all"
        ? visibleServers
        : visibleServers.filter((server) => server.status === statusFilter);

    if (!normalizedQuery) {
      return baseServers;
    }

    return baseServers
      .map((server) => ({
        server,
        score: getSearchScore(server.guildName, normalizedQuery),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.server.guildName.localeCompare(b.server.guildName, "pt-BR"),
      )
      .map((item) => item.server);
  }, [normalizedQuery, visibleServers, statusFilter]);
  const projectStats = useMemo(() => {
    const paid = visibleServers.filter((server) => server.status === "paid").length;
    const pending = visibleServers.filter((server) => server.status === "pending_payment").length;
    const expired = visibleServers.filter((server) => server.status === "expired" || server.status === "off").length;
    return { total: visibleServers.length, paid, pending, expired };
  }, [visibleServers]);
  const filteredProjectsSidebarItems = useMemo(() => {
    if (!normalizedSidebarQuery) return PROJECTS_SIDEBAR_ITEMS;

    return PROJECTS_SIDEBAR_ITEMS
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [normalizedSidebarQuery]);

  const filteredTicketSidebarItems = useMemo(() => {
    if (!isEditingServer) return [];

    const items = TICKET_SIDEBAR_ITEMS;

    if (!normalizedSidebarQuery) return items;

    return items
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [isEditingServer, normalizedSidebarQuery]);

  const filteredSalesSidebarItems = useMemo(() => {
    if (!isEditingServer) return [];

    const items = SALES_SIDEBAR_ITEMS;

    if (!normalizedSidebarQuery) return items;

    return items
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [isEditingServer, normalizedSidebarQuery]);

  const filteredEntryExitSidebarItems = useMemo(() => {
    if (!isEditingServer) return [];

    const items = ENTRY_EXIT_SIDEBAR_ITEMS;

    if (!normalizedSidebarQuery) return items;

    return items
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [isEditingServer, normalizedSidebarQuery]);
  const filteredCaptchaSidebarItems = useMemo(() => {
    if (!isEditingServer) return [];

    const items = CAPTCHA_SIDEBAR_ITEMS;

    if (!normalizedSidebarQuery) return items;

    return items
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [isEditingServer, normalizedSidebarQuery]);
  const filteredSuggestionsSidebarItems = useMemo(() => {
    if (!isEditingServer) return [];

    const items = SUGGESTIONS_SIDEBAR_ITEMS;

    if (!normalizedSidebarQuery) return items;

    return items
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [isEditingServer, normalizedSidebarQuery]);
  const filteredBatePontoSidebarItems = useMemo(() => {
    if (!isEditingServer) return [];

    const items = BATE_PONTO_SIDEBAR_ITEMS;

    if (!normalizedSidebarQuery) return items;

    return items
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [isEditingServer, normalizedSidebarQuery]);
  const filteredSecuritySidebarItems = useMemo(() => {
    if (!isEditingServer) return [];

    const items = SECURITY_SIDEBAR_ITEMS;

    if (!normalizedSidebarQuery) return items;

    return items
      .map((item) => {
        const haystack = [item.label, ...(item.searchAliases || [])].join(" ");
        return { item, score: getSearchScore(haystack, normalizedSidebarQuery) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) =>
        a.score !== b.score
          ? b.score - a.score
          : a.item.label.localeCompare(b.item.label, "pt-BR"),
      )
      .map((entry) => entry.item);
  }, [isEditingServer, normalizedSidebarQuery]);
  const activeTeamServerCount = visibleServers.length;
  const isCreateTeamNextDisabled =
    isCreatingTeam ||
    (createTeamStep === "name" && createTeamName.trim().length < 3) ||
    (createTeamStep === "servers" && !createTeamServerIds.length);
  const isTicketGroupActive =
    isEditingServer &&
    selectedEditorTabForConfig === "settings" &&
    (selectedSettingsSectionForConfig === "overview" ||
      selectedSettingsSectionForConfig === "message" ||
      selectedSettingsSectionForConfig === "ticket_ai");
  const isSalesGroupActive =
    isEditingServer &&
    selectedEditorTabForConfig === "settings" &&
    (selectedSettingsSectionForConfig === "sales_overview" ||
      selectedSettingsSectionForConfig === "sales_categories" ||
      selectedSettingsSectionForConfig === "sales_category_create" ||
      selectedSettingsSectionForConfig === "sales_category_edit" ||
      selectedSettingsSectionForConfig === "sales_products" ||
      selectedSettingsSectionForConfig === "sales_product_create" ||
      selectedSettingsSectionForConfig === "sales_product_edit" ||
      selectedSettingsSectionForConfig === "sales_stock" ||
      selectedSettingsSectionForConfig === "sales_payment_methods" ||
      selectedSettingsSectionForConfig === "sales_coupons_gifts" ||
      selectedSettingsSectionForConfig === "sales_coupons_gifts_create" ||
      selectedSettingsSectionForConfig === "sales_coupons_gifts_edit");
  const isEntryExitGroupActive =
    isEditingServer &&
    selectedEditorTabForConfig === "settings" &&
    (selectedSettingsSectionForConfig === "entry_exit_overview" ||
      selectedSettingsSectionForConfig === "entry_exit_message");
  const isCaptchaGroupActive =
    isEditingServer &&
    selectedEditorTabForConfig === "settings" &&
    (selectedSettingsSectionForConfig === "captcha_overview" ||
      selectedSettingsSectionForConfig === "captcha_message");
  const isSuggestionsGroupActive =
    isEditingServer &&
    selectedEditorTabForConfig === "settings" &&
    (selectedSettingsSectionForConfig === "suggestions_overview" ||
      selectedSettingsSectionForConfig === "suggestions_message");
  const isBatePontoGroupActive =
    isEditingServer &&
    selectedEditorTabForConfig === "settings" &&
    (selectedSettingsSectionForConfig === "bate_ponto_overview" ||
      selectedSettingsSectionForConfig === "bate_ponto_message" ||
      selectedSettingsSectionForConfig === "bate_ponto_ranking" ||
      selectedSettingsSectionForConfig === "bate_ponto_history");
  const isSecurityGroupActive =
    isEditingServer &&
    selectedEditorTabForConfig === "settings" &&
    (selectedSettingsSectionForConfig === "security_antilink" ||
      selectedSettingsSectionForConfig === "security_autorole" ||
      selectedSettingsSectionForConfig === "security_logs");

  useEffect(() => {
    if (normalizedSidebarQuery) {
      setIsTicketSidebarOpen(true);
      setIsSalesSidebarOpen(true);
      setIsEntryExitSidebarOpen(true);
      setIsCaptchaSidebarOpen(true);
      setIsSuggestionsSidebarOpen(true);
      setIsBatePontoSidebarOpen(true);
      setIsSecuritySidebarOpen(true);
      return;
    }

    if (!isEditingServer || selectedEditorTabForConfig !== "settings") {
      return;
    }

    switch (selectedSettingsSectionForConfig) {
      case "home":
        break;
      case "overview":
      case "message":
      case "ticket_ai":
        setIsTicketSidebarOpen(true);
        break;
      case "sales_overview":
      case "sales_categories":
      case "sales_category_create":
      case "sales_category_edit":
      case "sales_products":
      case "sales_product_create":
      case "sales_product_edit":
      case "sales_stock":
      case "sales_stock_edit":
      case "sales_payment_methods":
      case "sales_coupons_gifts":
      case "sales_coupons_gifts_create":
      case "sales_coupons_gifts_edit":
        setIsSalesSidebarOpen(true);
        break;
      case "entry_exit_overview":
      case "entry_exit_message":
        setIsEntryExitSidebarOpen(true);
        break;
      case "captcha_overview":
      case "captcha_message":
        setIsCaptchaSidebarOpen(true);
        break;
      case "suggestions_overview":
      case "suggestions_message":
        setIsSuggestionsSidebarOpen(true);
        break;
      case "bate_ponto_overview":
      case "bate_ponto_message":
      case "bate_ponto_ranking":
      case "bate_ponto_history":
        setIsBatePontoSidebarOpen(true);
        break;
      case "security_antilink":
      case "security_autorole":
      case "security_logs":
        setIsSecuritySidebarOpen(true);
        break;
      default:
        break;
    }
  }, [
    isEditingServer,
    normalizedSidebarQuery,
    selectedEditorTabForConfig,
    selectedSettingsSectionForConfig,
  ]);

  useEffect(() => {
    if (!selectedGuildIdForConfig) {
      setHasUnsavedSettingsChanges(false);
    }
  }, [selectedGuildIdForConfig]);

  useEffect(() => {
    if (
      Boolean(selectedGuildIdForConfig) ||
      isLoading ||
      errorMessage ||
      !filteredServers.length
    ) {
      return;
    }

    const guildIdsToWarm = filteredServers
      .slice(0, 6)
      .map((server) => server.guildId);

    const timeoutId = window.setTimeout(() => {
      guildIdsToWarm.forEach((guildId) => {
        void prefetchServerDashboardSettings(guildId);
        warmBrowserRoute(
          `/servers/${encodeURIComponent(guildId)}/overview/`,
          {
            router,
            prefetchDocument: true,
          },
        );
      });
    }, 80);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [errorMessage, filteredServers, isLoading, router, selectedGuildIdForConfig]);

  useEffect(() => {
    return scheduleWarmBrowserRoutes(
      [
        "/account",
        "/servers",
        "/servers/plans",
      ],
      {
        router,
        delayMs: 80,
      },
    );
  }, [router]);

  const buildServerConfigUrl = useCallback((
    guildId: string,
    tab: ServerEditorTab,
    settingsSection: ServerSettingsSection = "overview",
  ) => {
    if (tab !== "settings") {
      const encodedGuildId = encodeURIComponent(guildId);
      return `/servers/${encodedGuildId}/`;
    }

    const encodedGuildId = encodeURIComponent(guildId);
    if (settingsSection === "sales_overview") {
      return `/servers/${encodedGuildId}/sales/overview/`;
    }
    if (settingsSection === "sales_categories") {
      return `/servers/${encodedGuildId}/sales/categories/`;
    }
    if (settingsSection === "sales_category_create") {
      return `/servers/${encodedGuildId}/sales/categories/create/`;
    }
    if (settingsSection === "sales_category_edit") {
      return `/servers/${encodedGuildId}/sales/categories/`;
    }
    if (settingsSection === "sales_products") {
      return `/servers/${encodedGuildId}/sales/products/`;
    }
    if (settingsSection === "sales_product_create") {
      return `/servers/${encodedGuildId}/sales/products/create/`;
    }
    if (settingsSection === "sales_product_edit") {
      return `/servers/${encodedGuildId}/sales/products/`;
    }
    if (settingsSection === "sales_stock" || settingsSection === "sales_stock_edit") {
      return `/servers/${encodedGuildId}/sales/stock/`;
    }
    if (settingsSection === "sales_payment_methods") {
      return `/servers/${encodedGuildId}/sales/payment-methods/`;
    }
    if (settingsSection === "sales_coupons_gifts") {
      return `/servers/${encodedGuildId}/sales/coupons-gifts/`;
    }
    if (settingsSection === "sales_coupons_gifts_create") {
      return `/servers/${encodedGuildId}/sales/coupons-gifts/create/`;
    }
    if (settingsSection === "sales_coupons_gifts_edit") {
      return pathname.startsWith(`/servers/${encodedGuildId}/sales/coupons-gifts/edit/`)
        ? pathname
        : `/servers/${encodedGuildId}/sales/coupons-gifts/`;
    }
    if (settingsSection === "message") {
      return `/servers/${encodedGuildId}/tickets/message/`;
    }
    if (settingsSection === "ticket_ai") {
      return `/servers/${encodedGuildId}/tickets/flowai/`;
    }
    if (settingsSection === "entry_exit_message") {
      return `/servers/${encodedGuildId}/entry-exit/message/`;
    }
    if (settingsSection === "entry_exit_overview") {
      return `/servers/${encodedGuildId}/entry-exit/overview/`;
    }
    if (settingsSection === "captcha_message") {
      return `/servers/${encodedGuildId}/captcha/message/`;
    }
    if (settingsSection === "captcha_overview") {
      return `/servers/${encodedGuildId}/captcha/overview/`;
    }
    if (settingsSection === "suggestions_message") {
      return `/servers/${encodedGuildId}/suggestions/message/`;
    }
    if (settingsSection === "suggestions_overview") {
      return `/servers/${encodedGuildId}/suggestions/overview/`;
    }
    if (settingsSection === "bate_ponto_message") {
      return `/servers/${encodedGuildId}/bate-ponto/message/`;
    }
    if (settingsSection === "bate_ponto_overview") {
      return `/servers/${encodedGuildId}/bate-ponto/overview/`;
    }
    if (settingsSection === "bate_ponto_ranking") {
      return `/servers/${encodedGuildId}/bate-ponto/ranking/`;
    }
    if (settingsSection === "bate_ponto_history") {
      return `/servers/${encodedGuildId}/bate-ponto/history/`;
    }
    if (settingsSection === "security_antilink") {
      return `/servers/${encodedGuildId}/security/antilink/`;
    }
    if (settingsSection === "security_autorole") {
      return `/servers/${encodedGuildId}/security/autorole/`;
    }
    if (settingsSection === "security_logs") {
      return `/servers/${encodedGuildId}/security/logs/`;
    }
    if (settingsSection === "home") {
      return `/servers/${encodedGuildId}/overview/`;
    }
    return `/servers/${encodedGuildId}/tickets/overview/`;
  }, [pathname]);

  const navigateToUrl = useCallback((nextUrl: string, mode: "push" | "replace" = "push") => {
    if (typeof window === "undefined") return;
    setIsMobileNavOpen(false);
    setIsProfileMenuOpen(false);
    const target = warmBrowserRoute(nextUrl, {
      router,
      prefetchDocument: true,
    });
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const comparableCurrentUrl = normalizeComparablePath(currentUrl);
    const comparableNextUrl = normalizeComparablePath(target.path);
    if (comparableCurrentUrl === comparableNextUrl) return;
    const currentPathname = window.location.pathname;
    const nextPathname = target.path.split("?")[0]?.split("#")[0] || "";
    const isInternalServersPath =
      target.sameOrigin &&
      isServersWorkspacePath(currentPathname) &&
      isServersWorkspacePath(nextPathname);

    // CORRECAO: Restaura window.history.pushState para roteamento interno.
    // Next.js router.push falha ao resolver paths reescritos por middleware
    // no client-side nav. O estado React do painel é sincronizado manualmente
    // com applySelectedServerRouteState para que as configs abram sem F5.
    if (isInternalServersPath) {
      if (mode === "replace") {
        window.history.replaceState(null, "", target.path);
        return;
      }
      window.history.pushState(null, "", target.path);
      return;
    }

    if (!target.sameOrigin) {
      if (mode === "replace") {
        window.location.replace(target.href);
        return;
      }

      window.location.assign(target.href);
      return;
    }

    if (mode === "replace") router.replace(target.path, { scroll: false });
    else router.push(target.path, { scroll: false });
  }, [router]);

  const applySelectedServerRouteState = useCallback((
    guildId: string | null,
    tab: ServerEditorTab,
    settingsSection: ServerSettingsSection,
  ) => {
    setSelectedGuildIdForConfig(guildId);
    setSelectedEditorTabForConfig(tab);
    setSelectedSettingsSectionForConfig(settingsSection);
  }, []);

  const syncBrowserHistoryServerRoute = useCallback(() => {
    if (typeof window === "undefined") return;

    const nextPathname = window.location.pathname;
    const nextRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    setPendingWorkspacePaneKey(null);
    setIsTeamMenuOpen(false);
    setIsProfileMenuOpen(false);

    if (!isServersWorkspacePath(nextPathname)) {
      window.setTimeout(() => {
        router.replace(nextRoute, { scroll: false });
      }, 0);
      return;
    }

    const nextRouteState = parseWorkspaceRoute(nextPathname);
    applySelectedServerRouteState(
      nextRouteState.guildId,
      nextRouteState.tab,
      nextRouteState.settingsSection,
    );
  }, [applySelectedServerRouteState, router]);

  useEffect(() => {
    function handlePageShow() {
      syncBrowserHistoryServerRoute();
    }

    window.addEventListener("popstate", syncBrowserHistoryServerRoute);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("popstate", syncBrowserHistoryServerRoute);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [syncBrowserHistoryServerRoute]);

  const openProjectsOverview = useCallback((mode: "push" | "replace" = "push") => {
    setPendingWorkspacePaneKey(buildWorkspacePaneKey(null, "settings", "overview"));
    navigateToUrl("/servers/", mode);
    startOpenServerTransition(() => {
      applySelectedServerRouteState(null, "settings", "overview");
      setErrorMessage(null);
    });
  }, [applySelectedServerRouteState, navigateToUrl, startOpenServerTransition]);

  const redirectToDashboardRoot = useCallback(() => {
    if (typeof window === "undefined") return;
    const target = buildBrowserRoutingTargetFromInternalPath("/dashboard");
    window.location.assign(target.href);
  }, []);

  const prefetchWorkspaceSections = useCallback((guildId: string) => {
    void prefetchServerDashboardSettings(guildId);
    [
      buildServerConfigUrl(guildId, "settings", "home"),
      buildServerConfigUrl(guildId, "settings", "overview"),
      buildServerConfigUrl(guildId, "settings", "message"),
      buildServerConfigUrl(guildId, "settings", "ticket_ai"),
      buildServerConfigUrl(guildId, "settings", "entry_exit_overview"),
      buildServerConfigUrl(guildId, "settings", "entry_exit_message"),
      buildServerConfigUrl(guildId, "settings", "captcha_overview"),
      buildServerConfigUrl(guildId, "settings", "captcha_message"),
      buildServerConfigUrl(guildId, "settings", "suggestions_overview"),
      buildServerConfigUrl(guildId, "settings", "suggestions_message"),
      buildServerConfigUrl(guildId, "settings", "bate_ponto_overview"),
      buildServerConfigUrl(guildId, "settings", "bate_ponto_message"),
      buildServerConfigUrl(guildId, "settings", "bate_ponto_ranking"),
      buildServerConfigUrl(guildId, "settings", "bate_ponto_history"),
      buildServerConfigUrl(guildId, "settings", "security_antilink"),
      buildServerConfigUrl(guildId, "settings", "security_autorole"),
      buildServerConfigUrl(guildId, "settings", "security_logs"),
    ].forEach((url) => {
      warmBrowserRoute(url, {
        router,
        prefetchDocument: true,
      });
    });
  }, [buildServerConfigUrl, router]);

  const prefetchSelectedWorkspaceSections = useCallback((tab?: ServerEditorTab | null) => {
    if (!selectedGuildIdForConfig || !tab) {
      return;
    }

    prefetchWorkspaceSections(selectedGuildIdForConfig);
  }, [prefetchWorkspaceSections, selectedGuildIdForConfig]);

  useEffect(() => {
    if (!isEditingServer || !selectedGuildIdForConfig) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      prefetchWorkspaceSections(selectedGuildIdForConfig);
    }, 45);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isEditingServer, prefetchWorkspaceSections, selectedGuildIdForConfig]);

  const handleUnsavedSettingsChangesChange = useCallback((hasUnsavedChanges: boolean) => {
    hasUnsavedSettingsChangesRef.current = hasUnsavedChanges;
    setHasUnsavedSettingsChanges(hasUnsavedChanges);
  }, []);

  const handleSidebarSettingsSectionNavigation = useCallback(
    (input: {
      guildId: string;
      tab: ServerEditorTab;
      settingsSection: ServerSettingsSection;
    }) => {
      const isLeavingCurrentSettingsView =
        selectedEditorTabForConfig === "settings" &&
        (input.tab !== "settings" ||
          selectedSettingsSectionForConfig !== input.settingsSection);
      const hasBlockingUnsavedSettingsChanges =
        hasUnsavedSettingsChanges || hasUnsavedSettingsChangesRef.current;

      if (
        isEditingServer &&
        hasBlockingUnsavedSettingsChanges &&
        isLeavingCurrentSettingsView
      ) {
        setNavigationBlockSignal((current) => current + 1);
        return;
      }

      prefetchWorkspaceSections(input.guildId);
      setPendingWorkspacePaneKey(
        buildWorkspacePaneKey(input.guildId, input.tab, input.settingsSection),
      );
      navigateToUrl(
        buildServerConfigUrl(
          input.guildId,
          input.tab,
          input.settingsSection,
        ),
        "replace",
      );
      startOpenServerTransition(() => {
        applySelectedServerRouteState(input.guildId, input.tab, input.settingsSection);
        setErrorMessage(null);
      });
    },
    [
      applySelectedServerRouteState,
      buildServerConfigUrl,
      hasUnsavedSettingsChanges,
      isEditingServer,
      navigateToUrl,
      prefetchWorkspaceSections,
      selectedEditorTabForConfig,
      selectedSettingsSectionForConfig,
      startOpenServerTransition,
    ],
  );

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
      });
    } catch {
      // Mesmo com erro de rede, redireciona para login
    } finally {
      // Limpa qualquer estado persistido no localStorage antes de redirecionar
      try {
        window.localStorage.removeItem("flowdesk_pending_account_switch_v1");
      } catch {
        // noop
      }
      window.location.replace(buildLoginHref());
    }
  }, [isLoggingOut]);

  const openDiscordLoginFlow = useCallback((mode: "login" | "link" = "login") => {
    if (typeof window === "undefined") return;
    const nextPath = getCurrentBrowserInternalPath("/servers");
    window.location.assign(buildDiscordAuthStartHref(nextPath, mode));
  }, []);
  const handleReconnectDiscord = useCallback(() => {
    openDiscordLoginFlow("link");
  }, [openDiscordLoginFlow]);
  const handleServersSyncAction = useCallback(() => {
    if (isDiscordRelinkRequired) {
      setIsDiscordReconnectModalOpen(true);
      return;
    }

    requestServersReload({ silent: servers.length > 0 });
  }, [isDiscordRelinkRequired, requestServersReload, servers.length]);

  const handleAddAnotherAccount = useCallback(() => {
    setIsProfileMenuOpen(false);
    openDiscordLoginFlow();
  }, [openDiscordLoginFlow]);

  const handleSwitchSavedAccount = useCallback(
    (account: SavedPanelAccount) => {
      if (account.discordUserId === currentAccount.discordUserId) {
        setIsProfileMenuOpen(false);
        return;
      }

      try {
        window.localStorage.setItem(
          "flowdesk_pending_account_switch_v1",
          JSON.stringify({
            discordUserId: account.discordUserId,
            requestedAt: Date.now(),
          }),
        );
      } catch {
        // noop
      }

      setIsProfileMenuOpen(false);
      openDiscordLoginFlow();
    },
    [currentAccount.discordUserId, openDiscordLoginFlow],
  );

  const handleOpenAccountSettings = useCallback(() => {
    setIsProfileMenuOpen(false);
    navigateToUrl(buildAccountPathWithReturn(getCurrentBrowserPath()));
  }, [navigateToUrl]);

  const handleOpenMyAccount = useCallback(() => {
    setIsProfileMenuOpen(false);
    window.location.assign(
      buildBrowserRoutingTargetFromInternalPath("/discord/link", {
        fallbackArea: "public",
      }).href,
    );
  }, []);

  const handleOpenHelp = useCallback(() => {
    setIsProfileMenuOpen(false);
    window.open(OFFICIAL_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
  }, []);

  const handleStartAddServer = useCallback(async () => {
    if (isResolvingAddServer) return;
    setErrorMessage(null);
    setIsResolvingAddServer(true);

    try {
      const targetHref = await resolveAddServerTargetHref();
      window.location.assign(targetHref);
    } finally {
      setIsResolvingAddServer(false);
    }
  }, [isResolvingAddServer]);

  const handleCopyGuildId = useCallback(async (guildId: string) => {
    try {
      await navigator.clipboard.writeText(guildId);
      setCopiedGuildId(guildId);
      window.setTimeout(() => setCopiedGuildId((current) => (current === guildId ? null : current)), 1000);
    } catch {
      setCopiedGuildId(null);
    }
  }, []);

  const handleCardMenuCopyId = useCallback((guildId: string) => {
    void handleCopyGuildId(guildId);
    setOpenCardMenuGuildId(null);
  }, [handleCopyGuildId]);

  const resetCreateTeamForm = useCallback(() => {
    setCreateTeamStep("name");
    setCreateTeamName("");
    setCreateTeamIconKey("aurora");
    setCreateTeamServerIds([]);
    setCreateTeamMemberIds([]);
    setIsMemberSubmodalOpen(false);
    setMemberDraftIds([""]);
    setTeamActionError(null);
  }, []);

  const openCreateTeamModal = useCallback(() => {
    resetCreateTeamForm();
    setTeamActionMessage(null);
    setIsTeamMenuOpen(false);
    setIsCreateTeamModalOpen(true);
  }, [resetCreateTeamForm]);

  useEffect(() => {
    if (searchParams.get("createTeam") !== "1") return;
    openCreateTeamModal();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("createTeam");
    const nextQuery = nextParams.toString();
    const nextUrl = `${pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [openCreateTeamModal, pathname, searchParams]);

  useEffect(() => {
    setCreateTeamServerIds((current) => {
      const next = current.filter((guildId) => availableTeamServerIdSet.has(guildId));
      return next.length === current.length ? current : next;
    });
  }, [availableTeamServerIdSet]);

  const handleToggleCreateTeamServer = useCallback((guildId: string) => {
    setCreateTeamServerIds((current) =>
      current.includes(guildId)
        ? current.filter((value) => value !== guildId)
        : [...current, guildId],
    );
  }, []);

  const handleSelectTeam = useCallback(
    (teamId: number | null) => {
      setSelectedTeamId(teamId);
      setIsTeamMenuOpen(false);
      setTeamActionMessage(null);
      setTeamActionError(null);
    },
    [],
  );

  const handleOpenMemberSubmodal = useCallback(() => {
    setMemberDraftIds([""]);
    setTeamActionError(null);
    setIsMemberSubmodalOpen(true);
  }, []);

  const handleMemberDraftChange = useCallback((index: number, value: string) => {
    const normalizedValue = typeof value === "string" ? value : "";
    setMemberDraftIds((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? normalizedValue : (typeof draft === "string" ? draft : ""),
      ),
    );
  }, []);

  const handleAddMemberDraftField = useCallback(() => {
    setMemberDraftIds((current) => [...current, ""]);
  }, []);

  const handleConfirmMemberDrafts = useCallback(() => {
    if (!normalizedInviteDraftDiscordIds.length) {
      setTeamActionError("Adicione pelo menos um ID valido para convidar membros.");
      return;
    }
    setCreateTeamMemberIds((current) =>
      Array.from(new Set([...current, ...normalizedInviteDraftDiscordIds])).slice(0, 50),
    );
    setIsMemberSubmodalOpen(false);
    setMemberDraftIds([""]);
    setTeamActionError(null);
  }, [normalizedInviteDraftDiscordIds]);

  const handleRemoveTeamMemberId = useCallback((discordId: string) => {
    setCreateTeamMemberIds((current) => current.filter((value) => value !== discordId));
  }, []);

  const handleCreateTeam = useCallback(async () => {
    if (isCreatingTeam) return;
    const validSelectedGuildIds = createTeamServerIds.filter((guildId) =>
      availableTeamServerIdSet.has(guildId),
    );

    if (!validSelectedGuildIds.length) {
      setTeamActionError(
        "Os servidores escolhidos nao estao mais disponiveis para nova equipe. Revise a selecao.",
      );
      return;
    }

    if (validSelectedGuildIds.length !== createTeamServerIds.length) {
      setCreateTeamServerIds(validSelectedGuildIds);
      setTeamActionError(
        "Alguns servidores selecionados ficaram indisponiveis. Revise a lista antes de criar a equipe.",
      );
      return;
    }

    setIsCreatingTeam(true);
    setTeamActionError(null);
    setTeamActionMessage(null);

    try {
      const response = await fetch("/api/auth/me/teams", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: createTeamName,
          iconKey: createTeamIconKey,
          guildIds: validSelectedGuildIds,
          memberDiscordIds: createTeamMemberIds,
        }),
      });

      const payload = (await response.json()) as TeamsApiResponse;

      if (!response.ok || !payload.ok) {
        if (payload.teams || payload.pendingInvites) {
          applyTeamsSnapshot(payload);
        }

        if (Array.isArray(payload.conflictingGuildIds) && payload.conflictingGuildIds.length) {
          const conflictingGuildIdSet = new Set(payload.conflictingGuildIds);
          setCreateTeamServerIds((current) =>
            current.filter((guildId) => !conflictingGuildIdSet.has(guildId)),
          );
        }

        if (payload.conflict || (Array.isArray(payload.conflictingGuildIds) && payload.conflictingGuildIds.length)) {
          void requestServersReload({ silent: true });
          void loadTeamServerCatalog();
        }

        throw new Error(payload.message || "Nao foi possivel criar a equipe.");
      }

      const trimmedName = createTeamName.trim();
      const createdTeamId =
        payload.createdTeamId ||
        [...(payload.teams || [])]
          .reverse()
          .find((team) => team.name === trimmedName)?.id ||
        null;

      applyTeamsSnapshot(payload, createdTeamId);
      setTeamActionMessage("Equipe criada com sucesso.");
      setIsCreateTeamModalOpen(false);
      setIsTeamMenuOpen(true);
      resetCreateTeamForm();
    } catch (error) {
      setTeamActionError(
        error instanceof Error ? error.message : "Erro ao criar equipe.",
      );
    } finally {
      setIsCreatingTeam(false);
    }
  }, [
    applyTeamsSnapshot,
    createTeamName,
    createTeamIconKey,
    createTeamMemberIds,
    createTeamServerIds,
    availableTeamServerIdSet,
    isCreatingTeam,
    loadTeamServerCatalog,
    resetCreateTeamForm,
    requestServersReload,
  ]);

  const handleAcceptTeamInvite = useCallback(
    async (teamId: number) => {
      if (acceptingTeamId === teamId) return;
      setAcceptingTeamId(teamId);
      setTeamActionError(null);
      setTeamActionMessage(null);

      try {
        const response = await fetch(`/api/auth/me/teams/${teamId}/accept`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });

        const payload = (await response.json()) as TeamsApiResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.message || "Nao foi possivel aceitar o convite.",
          );
        }

        applyTeamsSnapshot(payload, teamId);
        setTeamActionMessage("Convite aceito. Equipe adicionada ao painel.");
      } catch (error) {
        setTeamActionError(
          error instanceof Error
            ? error.message
            : "Erro ao aceitar convite da equipe.",
        );
      } finally {
        setAcceptingTeamId(null);
      }
    },
    [acceptingTeamId, applyTeamsSnapshot],
  );

  const handleOpenServerConfig = useCallback((guildId: string, tab: ServerEditorTab = "settings") => {
    const nextSettingsSection: ServerSettingsSection = "home";
    const isSameSelection =
      selectedGuildIdForConfig === guildId &&
      selectedEditorTabForConfig === tab &&
      selectedSettingsSectionForConfig === nextSettingsSection;
    if (isSameSelection) {
      return;
    }

    prefetchWorkspaceSections(guildId);
    setPendingWorkspacePaneKey(
      buildWorkspacePaneKey(guildId, tab, nextSettingsSection),
    );
    navigateToUrl(
      buildServerConfigUrl(guildId, tab, nextSettingsSection),
      "push",
    );
    startOpenServerTransition(() => {
      applySelectedServerRouteState(guildId, tab, nextSettingsSection);
      setErrorMessage(null);
    });
  }, [
    applySelectedServerRouteState,
    buildServerConfigUrl,
    navigateToUrl,
    prefetchWorkspaceSections,
    selectedEditorTabForConfig,
    selectedGuildIdForConfig,
    selectedSettingsSectionForConfig,
    startOpenServerTransition,
  ]);

  const prefetchServerConfig = useCallback((guildId: string, tab: ServerEditorTab = "settings") => {
    prefetchWorkspaceSections(guildId);
    warmBrowserRoute(buildServerConfigUrl(guildId, tab), {
      router,
      prefetchDocument: true,
    });
  }, [buildServerConfigUrl, prefetchWorkspaceSections, router]);

  useEffect(() => {
    if (!selectedGuildIdForConfig) return;

    const timeoutId = window.setTimeout(() => {
      prefetchWorkspaceSections(selectedGuildIdForConfig);
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [prefetchWorkspaceSections, selectedGuildIdForConfig]);

  const selectedServer = useMemo(
    () =>
      panelVisibleServers.find((server) => server.guildId === selectedGuildIdForConfig) ||
      null,
    [panelVisibleServers, selectedGuildIdForConfig],
  );
  const shouldShowServersSyncBanner = Boolean(
    serversSyncContent && (panelVisibleServers.length > 0 || isDiscordRelinkRequired),
  );
  const workspaceAlertMessage = useMemo(
    () =>
      resolveServersWorkspaceAlertMessage({
        isEditingServer,
        selectedServer,
        servers: panelVisibleServers,
      }),
    [isEditingServer, panelVisibleServers, selectedServer],
  );
  const hasWorkspaceAlert = Boolean(workspaceAlertMessage);
  const isEditorViewerOnly = useMemo(() => {
    if (!selectedServer) return false;
    return !(selectedServer.canManage && selectedServer.accessMode === "owner");
  }, [selectedServer]);

  const hasCurrentSectionPermission = useMemo(() => {
    if (selectedServer?.accessMode === "owner") return true;
    if (currentDashboardPermissions === "full") return true;
    const perms = new Set(currentDashboardPermissions);
    const section = selectedSettingsSectionForConfig;

    if (section === "home") return true;
    if (section === "overview") {
      return perms.has("server_manage_tickets_overview");
    }
    if (section === "message") return perms.has("server_manage_tickets_message");
    if (
      section === "ticket_ai" ||
      section === "sales_overview" ||
      section === "sales_categories" ||
      section === "sales_category_create" ||
      section === "sales_category_edit" ||
      section === "sales_products" ||
      section === "sales_product_create" ||
      section === "sales_product_edit" ||
      section === "sales_stock" ||
      section === "sales_stock_edit" ||
      section === "sales_payment_methods" ||
      section === "sales_coupons_gifts" ||
      section === "sales_coupons_gifts_create" ||
      section === "sales_coupons_gifts_edit"
    ) {
      return perms.has("server_manage_tickets_overview");
    }
    if (section === "entry_exit_overview") {
      return perms.has("server_manage_welcome_overview");
    }
    if (section === "entry_exit_message") return perms.has("server_manage_welcome_message");
    if (section === "captcha_overview") {
      return perms.has("server_manage_captcha_overview");
    }
    if (section === "captcha_message") return perms.has("server_manage_captcha_message");
    if (section === "suggestions_overview") {
      return perms.has("server_manage_suggestions_overview");
    }
    if (section === "suggestions_message") {
      return perms.has("server_manage_suggestions_message");
    }
    if (section === "bate_ponto_overview") {
      return perms.has("server_manage_bate_ponto_overview");
    }
    if (section === "bate_ponto_message") {
      return perms.has("server_manage_bate_ponto_message");
    }
    if (section === "bate_ponto_ranking") {
      return perms.has("server_manage_bate_ponto_ranking");
    }
    if (section === "bate_ponto_history") {
      return perms.has("server_manage_bate_ponto_history");
    }
    if (section === "security_antilink") return perms.has("server_manage_antilink");
    if (section === "security_autorole") return perms.has("server_manage_autorole");
    if (section === "security_logs") return perms.has("server_view_security_logs");
    
    return false;
  }, [currentDashboardPermissions, selectedServer?.accessMode, selectedSettingsSectionForConfig]);

  const shouldHideEditorHeaderDueToPermissions = 
    isEditingServer && 
    !isLoading && 
    !isEditorViewerOnly && 
    !hasCurrentSectionPermission &&
    (errorMessage === "Acesso negado." || (Array.isArray(currentDashboardPermissions) && currentDashboardPermissions.length === 0));
  
  const shouldShowEditorSkeleton =
    Boolean(selectedGuildIdForConfig) && (isLoading || (!selectedServer && !errorMessage));
  const shouldShowEditorUnavailableState =
    Boolean(selectedGuildIdForConfig) &&
    !selectedServer &&
    !isLoading &&
    Boolean(errorMessage || servers.length > 0);
  const shouldShowEditorHeaderSkeleton =
    Boolean(selectedGuildIdForConfig) && !selectedServer;
  const shouldShowWorkspacePaneSkeleton = Boolean(latchedPendingWorkspacePaneKey);
  const shouldShowOverviewPaneSkeleton =
    latchedPendingWorkspacePaneKey === "overview";

  useNotificationEffect(teamsErrorMessage, {
    tone: "error",
    title: "Equipes",
  });
  useNotificationEffect(teamActionError, {
    tone: "error",
    title: "Equipes",
  });
  useNotificationEffect(teamActionMessage, {
    tone: "success",
    title: "Equipes",
  });

  useEffect(() => {
    if (!selectedGuildIdForConfig) {
      selectedServerRecoveryRef.current = { guildId: null, attempts: 0 };
      return;
    }

    if (selectedServer) {
      selectedServerRecoveryRef.current = {
        guildId: selectedGuildIdForConfig,
        attempts: 0,
      };
      return;
    }

    if (isLoading) {
      return;
    }

    if (selectedServerRecoveryRef.current.guildId !== selectedGuildIdForConfig) {
      selectedServerRecoveryRef.current = {
        guildId: selectedGuildIdForConfig,
        attempts: 0,
      };
    }

    if (selectedServerRecoveryRef.current.attempts >= 2) {
      return;
    }

    selectedServerRecoveryRef.current = {
      guildId: selectedGuildIdForConfig,
      attempts: selectedServerRecoveryRef.current.attempts + 1,
    };
    requestServersReload();
  }, [isLoading, requestServersReload, selectedGuildIdForConfig, selectedServer]);

  const panelTitle = isEditingServer
    ? `Servidor ${selectedServer?.guildName || ""}`.trim()
    : selectedTeam
      ? selectedTeam.name
      : "Seus projetos";
  const panelDescription = isEditingServer
    ? "Gerencie tickets, canais e cargos do servidor em um fluxo unico, mais limpo e mais atual."
    : selectedTeam
      ? `Servidores da equipe ${selectedTeam.name}. Abra um projeto para ver vendas, tickets e a saude da operacao.`
      : "Abra um servidor para a visao geral de vendas e tickets, ou gerencie a equipe pelo seletor ao lado.";
  const teamSummaryLabel = isTeamsLoading
    ? "Carregando equipes..."
    : selectedTeam
      ? `${selectedTeam.memberCount} membro(s)   ${selectedTeam.linkedGuildIds.length} servidor(es)`
      : teams.length
        ? `${teams.length} equipe(s) disponivel(is)`
        : pendingTeamInvites.length
          ? `${pendingTeamInvites.length} convite(s) pendente(s)`
          : "Nenhuma equipe criada";
  const renderSidebarContent = (
    teamDropdownRef: RefObject<HTMLDivElement | null>,
    sidebarSearchInputRef: RefObject<HTMLInputElement | null>,
  ) => (
    <div className="fd-sidebar-inner">
      <div ref={teamDropdownRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setIsProfileMenuOpen(false);
            setIsTeamMenuOpen((current) => !current);
          }}
          className="fd-team-trigger"
          aria-expanded={isTeamMenuOpen}
          aria-haspopup="dialog"
        >
          <div className="flex min-w-0 items-center gap-[10px]">
            {selectedTeam ? (
              <TeamAvatar
                iconKey={selectedTeam.iconKey}
                name={selectedTeam.name}
                className="h-[34px] w-[34px] shrink-0 rounded-full"
                textClassName="text-[13px] text-[#F0F0F0]"
              />
            ) : (
              <SidebarWorkspaceIcon />
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] leading-none font-medium tracking-[-0.03em] text-[#E5E5E5]">
                {selectedTeam ? selectedTeam.name : currentAccount.displayName}
              </p>
              <p className="mt-[5px] truncate text-[12px] leading-none text-[#6D6D6D]">{teamSummaryLabel}</p>
            </div>
          </div>
          <div className="flex items-center">
            <span className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[10px] text-[#7E7E7E] transition-colors hover:bg-[#101010] hover:text-[#D8D8D8]">
              <SidebarDropdownChevronIcon />
            </span>
          </div>
        </button>
        {isTeamMenuOpen ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-[120] overflow-hidden rounded-[12px] border border-[#222226] bg-[#161618] p-[10px]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="space-y-[8px]">
              <div>
                <p className="px-[4px] text-[11px] uppercase tracking-[0.16em] text-[#5F5F5F]">Trocar equipe</p>
                <div className="mt-[10px] space-y-[6px]">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSelectTeam(null);
                    }}
                    className={`flex w-full items-center justify-between rounded-[14px] px-[12px] py-[11px] text-left transition-colors ${
                      !selectedTeam
                        ? "bg-[#141414] text-[#ECECEC]"
                        : "text-[#A7A7A7] hover:bg-[#111111] hover:text-[#E6E6E6]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-[10px]">
                      <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] border border-[#171717] bg-[#0D0D0D] text-[#A7A7A7]">
                        <TeamIcon />
                      </span>
                      <span>
                        <span className="block text-[14px] leading-none font-medium tracking-[-0.03em]">
                          Todos os servidores
                        </span>
                        <span className="mt-[5px] block text-[11px] leading-none text-[#666666]">
                          Visual geral do painel
                        </span>
                      </span>
                    </span>
                    {!selectedTeam ? (
                      <span className="h-[7px] w-[7px] rounded-full bg-[#0062FF]" />
                    ) : null}
                  </button>
                  {teams.map((team) => {
                    const isSelected = selectedTeamId === team.id;
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectTeam(team.id);
                        }}
                        className={`flex w-full items-center justify-between rounded-[14px] px-[12px] py-[11px] text-left transition-colors ${
                          isSelected
                            ? "bg-[#141414] text-[#ECECEC]"
                            : "text-[#A7A7A7] hover:bg-[#111111] hover:text-[#E6E6E6]"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-[10px]">
                          <TeamAvatar
                            iconKey={team.iconKey}
                            name={team.name}
                            className="h-[30px] w-[30px] shrink-0"
                            textClassName="text-[12px] text-[#F3F3F3]"
                          />
                          <span className="min-w-0">
                          <span className="block truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {team.name}
                          </span>
                          <span className="mt-[5px] block truncate text-[11px] leading-none text-[#666666]">
                            {team.memberCount} membro(s)   {team.linkedGuildIds.length} servidor(es)
                          </span>
                          </span>
                        </span>
                        {isSelected ? (
                          <span className="h-[7px] w-[7px] rounded-full bg-[#0062FF]" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {pendingTeamInvites.length ? (
                <div className="border-t border-[#121212] pt-[12px]">
                  <p className="px-[4px] text-[11px] uppercase tracking-[0.16em] text-[#5F5F5F]">
                    Convites pendentes
                  </p>
                  <div className="mt-[10px] space-y-[8px]">
                    {pendingTeamInvites.map((invite) => (
                      <div
                        key={invite.membershipId}
                        className="rounded-[14px] border border-[#141414] bg-[#0D0D0D] px-[12px] py-[11px]"
                      >
                        <p className="truncate text-[14px] leading-none font-medium tracking-[-0.03em] text-[#E9E9E9]">
                          {invite.teamName}
                        </p>
                        <p className="mt-[6px] text-[11px] leading-[1.4] text-[#6E6E6E]">
                          Convite enviado por {invite.invitedByDisplayName}
                        </p>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleAcceptTeamInvite(invite.teamId);
                          }}
                          disabled={acceptingTeamId === invite.teamId}
                          className="mt-[10px] inline-flex h-[34px] items-center justify-center rounded-[12px] bg-[#F4F4F4] px-[14px] text-[12px] font-medium text-[#111111] transition-transform duration-200 hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {acceptingTeamId === invite.teamId ? (
                            <ButtonLoader size={14} colorClassName="text-[#111111]" />
                          ) : (
                            "Aceitar convite"
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-[#121212] pt-[12px]">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openCreateTeamModal();
                  }}
                  className="group relative inline-flex h-[46px] w-full shrink-0 items-center justify-center overflow-visible whitespace-nowrap rounded-[12px] px-6 text-[14px] leading-none font-semibold"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[12px] bg-[#111111] transition-transform duration-150 ease-out group-hover:scale-[1.02] group-active:scale-[0.985]"
                  />
                  <span className="relative z-10 inline-flex items-center justify-center whitespace-nowrap leading-none text-[#B7B7B7]">
                    Criar equipe
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="fd-sidebar-search">
        <SearchIcon />
        <input
          ref={sidebarSearchInputRef}
          type="text"
          value={typeof sidebarSearchText === "string" ? sidebarSearchText : ""}
          onChange={(event) => setSidebarSearchText(String(event.currentTarget.value ?? ""))}
          placeholder="Filtrar navegacao..."
          autoComplete="off"
        />
      </div>

      <div className="fd-nav-scroll thin-scrollbar">
        {filteredProjectsSidebarItems.length ||
        filteredSalesSidebarItems.length ||
        filteredTicketSidebarItems.length ||
        filteredEntryExitSidebarItems.length ||
        filteredCaptchaSidebarItems.length ||
        filteredSuggestionsSidebarItems.length ||
        filteredBatePontoSidebarItems.length ||
        filteredSecuritySidebarItems.length ? (
          <>
            {filteredProjectsSidebarItems.length ? (
              <div className="space-y-[2px]">
                <p className="fd-nav-label">Workspace</p>
                {filteredProjectsSidebarItems.map((item) => {
                  const isHomeLocked = item.kind === "home" && !selectedServer;
                  const isActive =
                    item.kind === "home"
                      ? isEditingServer && selectedSettingsSectionForConfig === "home"
                      : item.kind === "overview" && !isEditingServer;

                  return (
                      <button
                        key={item.label}
                        type="button"
                        disabled={isHomeLocked}
                        onClick={() => {
                          setIsMobileNavOpen(false);
                          if (item.kind === "home") {
                            if (!selectedServer) return;
                            handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: "settings",
                              settingsSection: "home",
                            });
                            return;
                          }
                          if (item.kind === "dashboard") {
                            redirectToDashboardRoot();
                            return;
                          }
                          openProjectsOverview("push");
                        }}
                        className={fdNavItemClass({ active: isActive, disabled: isHomeLocked })}
                    >
                      <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                        <SidebarNavIcon kind={item.kind} active={isActive} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {isEditingServer ? (
              <p className="fd-nav-label">Modulos</p>
            ) : null}

            {filteredSalesSidebarItems.length ? (
              <div className="mt-[12px]">
                <button
                  type="button"
                  onClick={() => setIsSalesSidebarOpen((current) => !current)}
                  className={fdNavGroupClass({ active: isSalesGroupActive, open: isSalesSidebarOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isSalesGroupActive ? "text-[#F0F0F0]" : isSalesSidebarOpen ? "text-[#C7C7C7]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                    <SidebarNavIcon kind="sales" active={isSalesGroupActive} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    Vendas
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      isSalesSidebarOpen || normalizedSidebarQuery
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <SidebarDropdownChevronIcon />
                  </span>
                </button>

                {isSalesSidebarOpen || normalizedSidebarQuery ? (
                  <div className="fd-nav-children">
                    {filteredSalesSidebarItems.map((item) => {
                      const isDisabled = item.disabled || !selectedServer || !item.tab;
                      const isActive =
                        Boolean(
                          item.tab &&
                            selectedEditorTabForConfig === item.tab &&
                            (selectedSettingsSectionForConfig === item.settingsSection ||
                              (item.settingsSection === "sales_categories" &&
                                (selectedSettingsSectionForConfig ===
                                  "sales_category_create" ||
                                  selectedSettingsSectionForConfig ===
                                    "sales_category_edit")) ||
                              (item.settingsSection === "sales_products" &&
                                (selectedSettingsSectionForConfig ===
                                  "sales_product_create" ||
                                  selectedSettingsSectionForConfig ===
                                    "sales_product_edit")) ||
                              (item.settingsSection === "sales_coupons_gifts" &&
                                (selectedSettingsSectionForConfig ===
                                  "sales_coupons_gifts_create" ||
                                  selectedSettingsSectionForConfig ===
                                    "sales_coupons_gifts_edit"))) &&
                            isEditingServer,
                        );

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onMouseEnter={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onFocus={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onPointerDown={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onClick={() => {
                              if (isDisabled || !selectedServer || !item.tab) return;
                              handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: item.tab,
                              settingsSection: item.settingsSection || "sales_overview",
                            });
                          }}
                          disabled={isDisabled}
                          className={fdNavItemClass({ active: isActive, disabled: isDisabled })}
                        >
                          <span className={`inline-flex h-[20px] w-[20px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : isDisabled ? "text-[#4A4A4A]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"}`}>
                            <SidebarNavIcon kind={item.kind} active={isActive} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {filteredTicketSidebarItems.length ? (
              <div className="mt-[12px]">
                <button
                  type="button"
                  onClick={() => setIsTicketSidebarOpen((current) => !current)}
                  className={fdNavGroupClass({ active: isTicketGroupActive, open: isTicketSidebarOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isTicketGroupActive ? "text-[#F0F0F0]" : isTicketSidebarOpen ? "text-[#C7C7C7]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                    <SidebarNavIcon kind="ticket" active={isTicketGroupActive} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    Ticket
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      isTicketSidebarOpen || normalizedSidebarQuery
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <SidebarDropdownChevronIcon />
                  </span>
                </button>

                {isTicketSidebarOpen || normalizedSidebarQuery ? (
                  <div className="fd-nav-children">
                    {filteredTicketSidebarItems.map((item) => {
                      const isDisabled = item.disabled || !selectedServer || !item.tab;
                      const isActive =
                        Boolean(
                          item.tab &&
                            selectedEditorTabForConfig === item.tab &&
                            selectedSettingsSectionForConfig === item.settingsSection &&
                            isEditingServer,
                        );

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onMouseEnter={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onFocus={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onPointerDown={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onClick={() => {
                              if (isDisabled || !selectedServer || !item.tab) return;
                              handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: item.tab,
                              settingsSection: item.settingsSection || "overview",
                            });
                          }}
                          disabled={isDisabled}
                          className={fdNavItemClass({ active: isActive, disabled: isDisabled })}
                        >
                          <span className={`inline-flex h-[20px] w-[20px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : isDisabled ? "text-[#4A4A4A]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"}`}>
                            <SidebarNavIcon kind={item.kind} active={isActive} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {filteredEntryExitSidebarItems.length ? (
              <div className="mt-[12px]">
                <button
                  type="button"
                  onClick={() => setIsEntryExitSidebarOpen((current) => !current)}
                  className={fdNavGroupClass({ active: isEntryExitGroupActive, open: isEntryExitSidebarOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isEntryExitGroupActive ? "text-[#F0F0F0]" : isEntryExitSidebarOpen ? "text-[#C7C7C7]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                    <SidebarNavIcon kind="entry_exit" active={isEntryExitGroupActive} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    Mensagem Entrada/Saida
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      isEntryExitSidebarOpen || normalizedSidebarQuery
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <SidebarDropdownChevronIcon />
                  </span>
                </button>

                {isEntryExitSidebarOpen || normalizedSidebarQuery ? (
                  <div className="fd-nav-children">
                    {filteredEntryExitSidebarItems.map((item) => {
                      const isDisabled = item.disabled || !selectedServer || !item.tab;
                      const isActive =
                        Boolean(
                          item.tab &&
                            selectedEditorTabForConfig === item.tab &&
                            selectedSettingsSectionForConfig === item.settingsSection &&
                            isEditingServer,
                        );

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onMouseEnter={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onFocus={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onPointerDown={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onClick={() => {
                              if (isDisabled || !selectedServer || !item.tab) return;
                              handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: item.tab,
                              settingsSection: item.settingsSection || "overview",
                            });
                          }}
                          disabled={isDisabled}
                          className={fdNavItemClass({ active: isActive, disabled: isDisabled })}
                        >
                          <span className={`inline-flex h-[20px] w-[20px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : isDisabled ? "text-[#4A4A4A]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"}`}>
                            <SidebarNavIcon kind={item.kind} active={isActive} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {filteredCaptchaSidebarItems.length ? (
              <div className="mt-[12px]">
                <button
                  type="button"
                  onClick={() => setIsCaptchaSidebarOpen((current) => !current)}
                  className={fdNavGroupClass({ active: isCaptchaGroupActive, open: isCaptchaSidebarOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isCaptchaGroupActive ? "text-[#F0F0F0]" : isCaptchaSidebarOpen ? "text-[#C7C7C7]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                    <SidebarNavIcon kind="captcha" active={isCaptchaGroupActive} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    Captcha
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      isCaptchaSidebarOpen || normalizedSidebarQuery
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <SidebarDropdownChevronIcon />
                  </span>
                </button>

                {isCaptchaSidebarOpen || normalizedSidebarQuery ? (
                  <div className="fd-nav-children">
                    {filteredCaptchaSidebarItems.map((item) => {
                      const isDisabled = item.disabled || !selectedServer || !item.tab;
                      const isActive =
                        Boolean(
                          item.tab &&
                            selectedEditorTabForConfig === item.tab &&
                            selectedSettingsSectionForConfig === item.settingsSection &&
                            isEditingServer,
                        );

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onMouseEnter={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onFocus={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onPointerDown={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onClick={() => {
                              if (isDisabled || !selectedServer || !item.tab) return;
                              handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: item.tab,
                              settingsSection: item.settingsSection || "overview",
                            });
                          }}
                          disabled={isDisabled}
                          className={fdNavItemClass({ active: isActive, disabled: isDisabled })}
                        >
                          <span className={`inline-flex h-[20px] w-[20px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : isDisabled ? "text-[#4A4A4A]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"}`}>
                            <SidebarNavIcon kind={item.kind} active={isActive} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {filteredSuggestionsSidebarItems.length ? (
              <div className="mt-[12px]">
                <button
                  type="button"
                  onClick={() => setIsSuggestionsSidebarOpen((current) => !current)}
                  className={fdNavGroupClass({ active: isSuggestionsGroupActive, open: isSuggestionsSidebarOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isSuggestionsGroupActive ? "text-[#F0F0F0]" : isSuggestionsSidebarOpen ? "text-[#C7C7C7]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                    <SidebarNavIcon kind="suggestions" active={isSuggestionsGroupActive} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    Sugestoes
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      isSuggestionsSidebarOpen || normalizedSidebarQuery
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <SidebarDropdownChevronIcon />
                  </span>
                </button>

                {isSuggestionsSidebarOpen || normalizedSidebarQuery ? (
                  <div className="fd-nav-children">
                    {filteredSuggestionsSidebarItems.map((item) => {
                      const isDisabled = item.disabled || !selectedServer || !item.tab;
                      const isActive =
                        Boolean(
                          item.tab &&
                            selectedEditorTabForConfig === item.tab &&
                            selectedSettingsSectionForConfig === item.settingsSection &&
                            isEditingServer,
                        );

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onMouseEnter={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onFocus={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onPointerDown={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onClick={() => {
                              if (isDisabled || !selectedServer || !item.tab) return;
                              handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: item.tab,
                              settingsSection: item.settingsSection || "overview",
                            });
                          }}
                          disabled={isDisabled}
                          className={fdNavItemClass({ active: isActive, disabled: isDisabled })}
                        >
                          <span className={`inline-flex h-[20px] w-[20px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : isDisabled ? "text-[#4A4A4A]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"}`}>
                            <SidebarNavIcon kind={item.kind} active={isActive} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {filteredBatePontoSidebarItems.length ? (
              <div className="mt-[12px]">
                <button
                  type="button"
                  onClick={() => setIsBatePontoSidebarOpen((current) => !current)}
                  className={fdNavGroupClass({ active: isBatePontoGroupActive, open: isBatePontoSidebarOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isBatePontoGroupActive ? "text-[#F0F0F0]" : isBatePontoSidebarOpen ? "text-[#C7C7C7]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                    <SidebarNavIcon kind="bate_ponto" active={isBatePontoGroupActive} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    Bate Ponto
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      isBatePontoSidebarOpen || normalizedSidebarQuery
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <SidebarDropdownChevronIcon />
                  </span>
                </button>

                {isBatePontoSidebarOpen || normalizedSidebarQuery ? (
                  <div className="fd-nav-children">
                    {filteredBatePontoSidebarItems.map((item) => {
                      const isDisabled = item.disabled || !selectedServer || !item.tab;
                      const isActive =
                        Boolean(
                          item.tab &&
                            selectedEditorTabForConfig === item.tab &&
                            selectedSettingsSectionForConfig === item.settingsSection &&
                            isEditingServer,
                        );

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onMouseEnter={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onFocus={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onPointerDown={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onClick={() => {
                              if (isDisabled || !selectedServer || !item.tab) return;
                              handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: item.tab,
                              settingsSection: item.settingsSection || "overview",
                            });
                          }}
                          disabled={isDisabled}
                          className={fdNavItemClass({ active: isActive, disabled: isDisabled })}
                        >
                          <span className={`inline-flex h-[20px] w-[20px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : isDisabled ? "text-[#4A4A4A]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"}`}>
                            <SidebarNavIcon kind={item.kind} active={isActive} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {filteredSecuritySidebarItems.length ? (
              <div className="mt-[12px]">
                <button
                  type="button"
                  onClick={() => setIsSecuritySidebarOpen((current) => !current)}
                  className={fdNavGroupClass({ active: isSecurityGroupActive, open: isSecuritySidebarOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isSecurityGroupActive ? "text-[#F0F0F0]" : isSecuritySidebarOpen ? "text-[#C7C7C7]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                    <SidebarNavIcon kind="security" active={isSecurityGroupActive} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    Seguranca
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      isSecuritySidebarOpen || normalizedSidebarQuery
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <SidebarDropdownChevronIcon />
                  </span>
                </button>

                {isSecuritySidebarOpen || normalizedSidebarQuery ? (
                  <div className="fd-nav-children">
                    {filteredSecuritySidebarItems.map((item) => {
                      const isDisabled = item.disabled || !selectedServer || !item.tab;
                      const isActive =
                        Boolean(
                          item.tab &&
                            selectedEditorTabForConfig === item.tab &&
                            selectedSettingsSectionForConfig === item.settingsSection &&
                            isEditingServer,
                        );

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onMouseEnter={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onFocus={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onPointerDown={() => prefetchSelectedWorkspaceSections(item.tab)}
                            onClick={() => {
                              if (isDisabled || !selectedServer || !item.tab) return;
                              handleSidebarSettingsSectionNavigation({
                              guildId: selectedServer.guildId,
                              tab: item.tab,
                              settingsSection: item.settingsSection || "overview",
                            });
                          }}
                          disabled={isDisabled}
                          className={fdNavItemClass({ active: isActive, disabled: isDisabled })}
                        >
                          <span className={`inline-flex h-[20px] w-[20px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : isDisabled ? "text-[#4A4A4A]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"}`}>
                            <SidebarNavIcon kind={item.kind} active={isActive} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-[18px] border border-[#131313] bg-[#080808] px-[14px] py-[16px]">
            <p className="text-[13px] leading-[1.55] text-[#767676]">
              Nenhuma area encontrada para essa busca.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const closePanelChrome = () => {
    setIsProfileMenuOpen(false);
    setIsMobileNavOpen(false);
  };

  const mapServerPaletteItem = (
    group: string,
    item: (typeof PROJECTS_SIDEBAR_ITEMS)[number],
  ): PanelQuickLink => ({
    id: `${group}-${item.kind}-${item.settingsSection || item.label}`,
    label: item.label,
    group,
    onSelect: () => {
      closePanelChrome();
      if (item.kind === "home") {
        if (!selectedServer) return;
        handleSidebarSettingsSectionNavigation({
          guildId: selectedServer.guildId,
          tab: "settings",
          settingsSection: "home",
        });
        return;
      }
      if (item.kind === "dashboard") {
        redirectToDashboardRoot();
        return;
      }
      if (item.kind === "overview") {
        openProjectsOverview("push");
        return;
      }
      if (!selectedServer || !item.tab) return;
      handleSidebarSettingsSectionNavigation({
        guildId: selectedServer.guildId,
        tab: item.tab,
        settingsSection: item.settingsSection || "overview",
      });
    },
  });

  const paletteLinks: PanelQuickLink[] = [
    ...PROJECTS_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Workspace", item)),
    ...(isEditingServer
      ? [
          ...SALES_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Vendas", item)),
          ...TICKET_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Ticket", item)),
          ...ENTRY_EXIT_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Entrada e saida", item)),
          ...CAPTCHA_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Captcha", item)),
          ...SUGGESTIONS_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Sugestoes", item)),
          ...BATE_PONTO_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Bate ponto", item)),
          ...SECURITY_SIDEBAR_ITEMS.map((item) => mapServerPaletteItem("Seguranca", item)),
        ]
      : []),
  ];

  return (
    <PanelShell
      className="flowdesk-servers-ui"
      hasAlert={hasWorkspaceAlert}
      crumb="FlowDesk"
      title={isEditingServer ? "Servidores" : panelTitle}
      account={{
        displayName: currentAccount.displayName,
        username: currentAccount.username,
        avatarUrl: currentAccount.avatarUrl,
        discordUserId: currentAccount.discordUserId,
      }}
      savedAccounts={savedAccounts}
      links={paletteLinks}
      actions={{
        onAddAccount: handleAddAnotherAccount,
        onSwitchAccount: (account) => {
          if (!account.discordUserId) return;
          handleSwitchSavedAccount({
            authUserId: account.authUserId ?? currentAccount.authUserId,
            discordUserId: account.discordUserId,
            displayName: account.displayName,
            username: account.username,
            avatarUrl: account.avatarUrl,
            lastSeenAt: Date.now(),
          });
        },
        onOpenMyAccount: handleOpenMyAccount,
        onOpenSettings: handleOpenAccountSettings,
        onOpenApiDocs: () => navigateToUrl("/account/api_keys"),
        onOpenHelp: handleOpenHelp,
        onLogout: () => {
          void handleLogout();
        },
        isLoggingOut,
      }}
      isPaletteOpen={isProfileMenuOpen}
      onPaletteOpenChange={setIsProfileMenuOpen}
      isMobileNavOpen={isMobileNavOpen}
      onMobileNavOpenChange={setIsMobileNavOpen}
      sidebar={renderSidebarContent(
        desktopTeamMenuRef,
        desktopSidebarSearchInputRef,
      )}
      alert={
        workspaceAlertMessage ? (
        <button
          type="button"
          onMouseEnter={() => warmBrowserRoute("/servers/plans", { router, prefetchDocument: true })}
          onFocus={() => warmBrowserRoute("/servers/plans", { router, prefetchDocument: true })}
          onPointerDown={() => warmBrowserRoute("/servers/plans", { router, prefetchDocument: true })}
          onClick={() => {
            navigateToUrl("/servers/plans");
          }}
          className="fixed inset-x-0 top-0 z-[1400] h-[42px] overflow-hidden bg-[#971D22] text-white transition-opacity hover:opacity-95 md:h-[46px]"
          aria-label={`${workspaceAlertMessage} Abrir pagina de planos.`}
        >
          <div className="relative mx-auto flex h-full w-full max-w-[1280px] items-center justify-center px-[16px] md:px-[22px]">
            <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-[8px] text-center md:gap-[12px]">
              <span className="text-[12px] font-medium tracking-[-0.02em] text-white md:text-[13px]">
                {workspaceAlertMessage}
              </span>
              <span className="hidden items-center gap-[6px] rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(22,0,0,0.16)] px-[11px] py-[5px] text-[11px] leading-none font-semibold text-[rgba(255,255,255,0.94)] md:inline-flex">
                Ver planos
                <ArrowUpRight className="h-[14px] w-[14px] shrink-0" strokeWidth={2.4} aria-hidden="true" />
              </span>
              <ArrowUpRight className="h-[15px] w-[15px] shrink-0 md:hidden" strokeWidth={2.5} aria-hidden="true" />
            </span>
          </div>
        </button>
        ) : null
      }
    >
          <section className="min-w-0">
            <LandingReveal delay={36} duration={240}>
              <div className="relative z-[700] flex flex-col gap-[18px]">
                <div className="flex flex-col gap-[14px] md:flex-row md:items-end md:justify-between">
                  <div>
                    {shouldShowEditorHeaderSkeleton ? (
                      <div className="space-y-[12px]" aria-hidden="true">
                        <div className="flowdesk-shimmer h-[12px] w-[88px] rounded-full bg-[#171717]" />
                        <div className="flowdesk-shimmer h-[28px] w-[min(320px,70vw)] max-w-full rounded-full bg-[#171717]" />
                        <div className="flowdesk-shimmer h-[12px] w-[min(520px,80vw)] max-w-full rounded-full bg-[#171717]" />
                      </div>
                    ) : shouldHideEditorHeaderDueToPermissions ||
                      selectedSettingsSectionForConfig === "home" ? null : (
                      <>
                        <p className="text-[12px] font-medium tracking-[0.02em] text-[#8B8B90]">
                          {isEditingServer ? "Configurando servidor" : "Projetos"}
                        </p>
                        <h1 className="mt-[10px] text-[32px] leading-[1.05] font-semibold tracking-[-0.045em] text-[#F2F2F3] md:text-[40px]">
                          {panelTitle}
                        </h1>
                        <p className="mt-[12px] max-w-[720px] text-[14px] leading-[1.6] text-[#8B8B90] md:text-[15px]">
                          {panelDescription}
                        </p>
                      </>
                    )}
                  </div>
                  {!isEditingServer ? (
                    <LandingActionButton
                      variant="light"
                      className="h-[42px] rounded-[14px] px-[16px] text-[14px]"
                      disabled={isResolvingAddServer}
                      onClick={() => {
                        void handleStartAddServer();
                      }}
                    >
                      <span className="inline-flex items-center gap-[10px]">
                        {isResolvingAddServer ? (
                          <ButtonLoader size={16} colorClassName="text-[#2B2B2B]" />
                        ) : (
                          <PlusIcon />
                        )}
                        Adicionar novo
                      </span>
                    </LandingActionButton>
                  ) : null}
                </div>
                {shouldShowServersSyncBanner && serversSyncContent ? (
                  <ServersSyncBanner
                    diagnosticsFingerprint={serversSync.diagnosticsFingerprint}
                    onAction={handleServersSyncAction}
                    syncContent={serversSyncContent}
                  />
                ) : null}
                {!isEditingServer ? (
                  <div className="relative z-[900] space-y-[12px]">
                    <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "Projetos", value: String(projectStats.total), hint: "Servidores visiveis", icon: FolderKanban },
                        { label: "Em dia", value: String(projectStats.paid), hint: "Assinatura ativa", icon: ShieldCheck },
                        { label: "Pendentes", value: String(projectStats.pending), hint: "Cobranca em aberto", icon: Clock },
                        { label: "Criticos", value: String(projectStats.expired), hint: "Expirados ou off", icon: Shield },
                      ].map((stat, index) => {
                        const Icon = stat.icon;
                        return (
                          <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.05 + index * 0.04, ease: projectEase }}
                            className="rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[16px]"
                          >
                            <div className="flex items-start justify-between gap-[12px]">
                              <p className="text-[12px] font-medium text-[#8B8B90]">{stat.label}</p>
                              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#C4C4C8]">
                                <Icon className="h-[16px] w-[16px]" strokeWidth={1.85} />
                              </span>
                            </div>
                            <p className="mt-[14px] text-[26px] leading-none font-semibold tracking-[-0.04em] text-[#F2F2F3]">
                              {stat.value}
                            </p>
                            <p className="mt-[10px] text-[12px] text-[#6F6F74]">{stat.hint}</p>
                          </motion.div>
                        );
                      })}
                    </div>
                    <div className={`${shellClass} overflow-visible px-[14px] py-[12px]`}>
                    <div className="flex flex-col gap-[12px] xl:flex-row xl:items-center">
                      <div className="fd-pill-search">
                        <SearchIcon />
                        <input
                          type="text"
                          value={typeof searchText === "string" ? searchText : ""}
                          onChange={(event) => setSearchText(String(event.currentTarget.value ?? ""))}
                          placeholder="Pesquisar servidor..."
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-[8px] xl:justify-end">
                        <div ref={statusRef} className="relative z-[1200]">
                          <button
                            type="button"
                            onClick={() => setIsStatusOpen((current) => !current)}
                            className={`flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border transition-colors ${
                              isStatusOpen || statusFilter !== "all"
                                ? "border-[#2A2A2E] bg-[#141414] text-[#F2F2F3]"
                                : "border-[#1C1C1C] bg-[#141414] text-[#8B8B90] hover:text-[#F2F2F3]"
                            }`}
                            aria-label="Filtrar por status"
                          >
                            <FilterIcon />
                          </button>

                          {isStatusOpen ? (
                            <div
                              className="absolute right-0 top-[50px] z-[2000] min-w-[190px] rounded-[14px] border border-[#1C1C1C] bg-[#141414] p-[6px]"
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              {(["all", "paid", "pending_payment", "expired", "off"] as const).map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    setStatusFilter(option);
                                    setIsStatusOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-[10px] px-[12px] py-[10px] text-left text-[13px] transition-colors ${
                                    statusFilter === option
                                      ? "bg-[#1A1A1A] text-[#F2F2F3]"
                                      : "text-[#8B8B90] hover:bg-[#1A1A1A] hover:text-[#F2F2F3]"
                                  }`}
                                >
                                  <span>{FILTER_LABEL[option]}</span>
                                  {statusFilter === option ? (
                                    <span className="h-[6px] w-[6px] rounded-full bg-[#C4C4C8]" />
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="inline-flex items-center gap-[4px] rounded-[12px] border border-[#1C1C1C] bg-[#141414] p-[4px]">
                          <button
                            type="button"
                            onClick={() => setViewMode("overview")}
                            className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] transition-colors ${
                              viewMode === "overview"
                                ? "bg-[#1A1A1A] text-[#F2F2F3]"
                                : "text-[#8B8B90] hover:text-[#F2F2F3]"
                            }`}
                            aria-label="Visual overview"
                          >
                            <GridIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode("list")}
                            className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] transition-colors ${
                              viewMode === "list"
                                ? "bg-[#1A1A1A] text-[#F2F2F3]"
                                : "text-[#8B8B90] hover:text-[#F2F2F3]"
                            }`}
                            aria-label="Visual lista"
                          >
                            <ListIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </LandingReveal>
            <div className="relative z-[10] mt-[22px]">
              {shouldShowWorkspacePaneSkeleton ? (
                <LandingReveal delay={52} duration={240}>
                  {shouldShowOverviewPaneSkeleton ? (
                    viewMode === "overview" ? (
                      <div className={workspacePaneRevealClass}>
                        <ServersOverviewSkeletonGrid />
                      </div>
                    ) : (
                      <div className={`${shellClass} ${workspacePaneRevealClass} overflow-visible`}>
                        <ServersListSkeleton />
                      </div>
                    )
                  ) : (
                    <div className={editorPanelRevealClass}>
                      <ServerSettingsEditorSkeleton
                        standalone
                        tab={selectedEditorTabForConfig}
                        settingsSection={selectedSettingsSectionForConfig}
                      />
                    </div>
                  )}
                </LandingReveal>
              ) : selectedServer && selectedSettingsSectionForConfig === "home" ? (
                <LandingReveal delay={52} duration={240}>
                  <div className={editorPanelRevealClass}>
                    <ServerHomeOverview
                      guildId={selectedServer.guildId}
                      guildName={selectedServer.guildName}
                      displayName={currentAccount.displayName}
                      servers={panelVisibleServers}
                      onOpenSales={() => {
                        handleSidebarSettingsSectionNavigation({
                          guildId: selectedServer.guildId,
                          tab: "settings",
                          settingsSection: "sales_overview",
                        });
                      }}
                      onOpenTickets={() => {
                        handleSidebarSettingsSectionNavigation({
                          guildId: selectedServer.guildId,
                          tab: "settings",
                          settingsSection: "overview",
                        });
                      }}
                    />
                  </div>
                </LandingReveal>
              ) : selectedServer && selectedSettingsSectionForConfig !== "home" ? (
                <LandingReveal delay={52} duration={240}>
                  <div className={editorPanelRevealClass}>
                    <ServerSettingsEditor
                      {...selectedServer}
                      allServers={panelVisibleServers}
                      initialTab={selectedEditorTabForConfig}
                      settingsSection={selectedSettingsSectionForConfig}
                      onTabChange={(tab) => {
                        handleSidebarSettingsSectionNavigation({
                          guildId: selectedServer.guildId,
                          tab,
                          settingsSection: "overview",
                        });
                      }}
                      onUnsavedChangesChange={handleUnsavedSettingsChangesChange}
                      onPermissionsChange={setCurrentDashboardPermissions}
                      navigationBlockSignal={navigationBlockSignal}
                      onClose={() => {
                        openProjectsOverview("push");
                      }}
                    />
                  </div>
                </LandingReveal>
              ) : shouldShowEditorSkeleton ? (
                <LandingReveal delay={52} duration={240}>
                  <div className={editorPanelRevealClass}>
                    <ServerSettingsEditorSkeleton
                      standalone
                      tab={selectedEditorTabForConfig}
                      settingsSection={selectedSettingsSectionForConfig}
                    />
                  </div>
                </LandingReveal>
              ) : shouldShowEditorUnavailableState ? (
                <LandingReveal delay={52} duration={240}>
                  <div className={`${editorPanelRevealClass} ${shellClass} px-[22px] py-[24px]`}>
                    <div className="rounded-[22px] border border-[#141414] bg-[#090909] px-[20px] py-[20px]">
                      {errorMessage === "Acesso negado." ? (
                        <div className="py-[60px]">
                          <PermissionDeniedState 
                            onAction={() => {
                              openProjectsOverview("replace");
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          <p className="text-[12px] uppercase tracking-[0.18em] text-[#666666]">
                            Servidor
                          </p>
                          <h2 className="mt-[12px] text-[24px] leading-none font-medium tracking-[-0.04em] text-[#E5E5E5]">
                            Nao foi possivel abrir este servidor agora
                          </h2>
                          <p className="mt-[12px] max-w-[720px] text-[14px] leading-[1.6] text-[#7D7D7D]">
                            {errorMessage || "Estamos tentando recuperar os dados deste servidor. Voce pode tentar novamente sem sair da configuracao."}
                          </p>
                          <div className="mt-[18px] flex flex-wrap items-center gap-[12px]">
                            <button
                              type="button"
                              onClick={() => {
                                requestServersReload();
                              }}
                              className="inline-flex h-[46px] items-center justify-center rounded-[12px] bg-[#F3F3F3] px-6 text-[15px] font-medium text-[#101010] transition-colors hover:bg-white"
                            >
                              Tentar novamente
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openProjectsOverview("replace");
                              }}
                              className="inline-flex h-[46px] items-center justify-center rounded-[12px] border border-[#181818] bg-[#101010] px-6 text-[15px] font-medium text-[#B7B7B7] transition-colors hover:border-[#222222] hover:bg-[#141414] hover:text-[#E5E5E5]"
                            >
                              Voltar aos projetos
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </LandingReveal>
              ) : (
                <LandingReveal delay={52} duration={240}>
                  {viewMode === "overview" ? (
                    <div className={workspacePaneRevealClass}>
                      <div className="mb-[16px] flex flex-col gap-[8px] sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-[12px] font-medium text-[#8B8B90]">Projetos</p>
                          <h2 className="mt-[8px] text-[20px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">Servidores em destaque</h2>
                        </div>
                          <p className="text-[12px] text-[#6F6F74]">
                            {filteredServers.length} de {activeTeamServerCount} visiveis
                          </p>
                      </div>
                      {isLoading ? (
                        <div>
                          <ServersOverviewSkeletonGrid />
                        </div>
                      ) : errorMessage ? (
                        <div className="py-[34px] text-center text-[13px] text-[#C2C2C2]">{errorMessage}</div>
                      ) : filteredServers.length ? (
                        <div className="grid gap-[14px] xl:grid-cols-2">
                          {filteredServers.map((server, index) => (
                            <ServerGridCard
                              key={server.guildId}
                              server={server}
                              index={index}
                              isSelected={selectedGuildIdForConfig === server.guildId}
                              isCopied={copiedGuildId === server.guildId}
                              openCardMenuGuildId={openCardMenuGuildId}
                              onOpen={handleOpenServerConfig}
                              onPrefetch={prefetchServerConfig}
                              onCopy={(guildId) => {
                                void handleCopyGuildId(guildId);
                              }}
                              onToggleMenu={(guildId) => {
                                setOpenCardMenuGuildId((current) => current === guildId ? null : guildId);
                              }}
                              onCopyFromMenu={handleCardMenuCopyId}
                            />
                          ))}
                        </div>
                      ) : (
                        <ServersEmptyState
                          onPrimaryAction={emptyStateSyncContent ? handleServersSyncAction : null}
                          selectedTeamName={selectedTeam?.name}
                          syncContent={emptyStateSyncContent}
                        />
                      )}
                    </div>
                  ) : (
                    <div className={workspacePaneRevealClass}>
                      <div className="mb-[16px] flex flex-col gap-[8px] sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-[12px] font-medium text-[#8B8B90]">Projetos</p>
                          <h2 className="mt-[8px] text-[20px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
                            {selectedTeam ? `Equipe ${selectedTeam.name}` : "Todos os servidores"}
                          </h2>
                        </div>
                        <p className="text-[12px] text-[#6F6F74]">
                          {filteredServers.length} de {activeTeamServerCount} visiveis
                        </p>
                      </div>
                      {isLoading ? (
                        <ServersListSkeleton />
                      ) : errorMessage ? (
                        <div className="py-[34px] text-center text-[13px] text-[#C2C2C2]">{errorMessage}</div>
                      ) : filteredServers.length ? (
                        <div className="space-y-[10px]">
                          {filteredServers.map((server, index) => (
                            <ServerListRow
                              key={server.guildId}
                              server={server}
                              index={index}
                              isSelected={selectedGuildIdForConfig === server.guildId}
                              isCopied={copiedGuildId === server.guildId}
                              openCardMenuGuildId={openCardMenuGuildId}
                              onOpen={handleOpenServerConfig}
                              onPrefetch={prefetchServerConfig}
                              onCopy={(guildId) => {
                                void handleCopyGuildId(guildId);
                              }}
                              onToggleMenu={(guildId) => {
                                setOpenCardMenuGuildId((current) => current === guildId ? null : guildId);
                              }}
                              onCopyFromMenu={handleCardMenuCopyId}
                            />
                          ))}
                        </div>
                      ) : (
                        <ServersEmptyState
                          onPrimaryAction={emptyStateSyncContent ? handleServersSyncAction : null}
                          selectedTeamName={selectedTeam?.name}
                          syncContent={emptyStateSyncContent}
                        />
                      )}
                    </div>
                  )}
                </LandingReveal>
              )}
            </div>
          </section>
      <ServerDiscordLinkModal
        diagnosticsFingerprint={serversSync.diagnosticsFingerprint}
        open={isDiscordReconnectModalOpen}
        mode={currentAccount.discordUserId ? "reconnect" : "connect"}
        onClose={() => setIsDiscordReconnectModalOpen(false)}
        onConnect={handleReconnectDiscord}
      />

      {isCreateTeamModalOpen ? (
        <div className="fixed inset-y-0 left-0 right-0 z-[5000] isolate overflow-y-auto overscroll-contain lg:left-[278px]">
          <button
            type="button"
            aria-label="Fechar modal de equipe"
            className="absolute inset-0 bg-[rgba(0,0,0,0.62)]"
            onClick={() => {
              setIsCreateTeamModalOpen(false);
              setIsMemberSubmodalOpen(false);
              setTeamActionError(null);
            }}
          />
          <div className="relative z-[10] min-h-full px-[20px] py-[32px] md:px-6 lg:px-8 xl:pl-[40px] xl:pr-[42px]">
            <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1220px] items-center justify-center">
              <div
              role="dialog"
              aria-modal="true"
              aria-label="Criar equipe"
              className="relative w-full max-w-[760px] overflow-hidden rounded-[20px] border border-[#222226] bg-[#141416] px-[22px] py-[22px] sm:px-[28px] sm:py-[28px]"
              >
              <div className="relative z-10">
                <div className="flex flex-col gap-[14px] sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="fd-kicker">Criar equipe</p>
                    <h2 className="mt-[10px] text-[28px] leading-[1.15] font-semibold tracking-[-0.04em] text-[#F0F0F2] sm:text-[34px]">
                      Monte uma equipe
                      <br />
                      para seus servidores
                    </h2>
                    <p className="mt-[14px] max-w-[560px] text-[14px] leading-[1.55] text-[#747474]">
                      Crie uma estrutura profissional, escolha os servidores da equipe e envie convites pendentes para o staff aceitar depois dentro do painel.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateTeamModalOpen(false);
                      setIsMemberSubmodalOpen(false);
                      setTeamActionError(null);
                    }}
                    className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[14px] border border-[#171717] bg-[#0D0D0D] text-[#9C9C9C] transition-colors hover:border-[#242424] hover:text-[#E4E4E4]"
                    aria-label="Fechar modal"
                  >
                    <span className="text-[18px] leading-none">x</span>
                  </button>
                </div>

                <div className="mt-[22px]">
                  {createTeamStep === "name" ? (
                    <div className="mt-[18px] space-y-[14px]">
                      <label className="block">
                        <span className="mb-[8px] block text-[12px] uppercase tracking-[0.16em] text-[#666666]">
                          Nome da equipe
                        </span>
                        <input
                          type="text"
                          value={typeof createTeamName === "string" ? createTeamName : ""}
                          onChange={(event) => setCreateTeamName(String(event.currentTarget.value ?? ""))}
                          placeholder="Ex: Moderacao principal"
                          autoComplete="off"
                          maxLength={64}
                          className="h-[50px] w-full rounded-[16px] border border-[#151515] bg-[#0A0A0A] px-[16px] text-[15px] text-[#E0E0E0] outline-none transition-colors placeholder:text-[#575757] focus:border-[rgba(0,98,255,0.34)]"
                        />
                      </label>

                      <div>
                        <span className="mb-[8px] block text-[12px] uppercase tracking-[0.16em] text-[#666666]">
                          Cor da equipe
                        </span>
                        <div className="grid grid-cols-3 gap-[10px]">
                          {TEAM_ICON_OPTIONS.map((option) => {
                            const isActive = createTeamIconKey === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => setCreateTeamIconKey(option.key)}
                                className={`rounded-[16px] border px-[10px] py-[12px] transition-colors ${
                                  isActive
                                    ? "border-[rgba(0,98,255,0.3)] bg-[rgba(0,98,255,0.08)]"
                                    : "border-[#141414] bg-[#0A0A0A] hover:border-[#1E1E1E] hover:bg-[#0D0D0D]"
                                }`}
                              >
                                <div className="flex flex-col items-center gap-[8px]">
                                  <TeamAvatar
                                    iconKey={option.key}
                                    name={createTeamName || option.label}
                                    className="h-[44px] w-[44px] rounded-[14px]"
                                    textClassName="text-[16px] text-[#F3F3F3]"
                                  />
                                  <span className="text-[12px] leading-none text-[#C7C7C7]">
                                    {option.label}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {createTeamStep === "servers" ? (
                    <div className="mt-[18px]">
                      <div className="mb-[10px] flex items-center justify-between gap-[12px]">
                        <span className="text-[12px] uppercase tracking-[0.16em] text-[#666666]">
                          Servidores vinculados
                        </span>
                        <span className="text-[12px] text-[#6F6F6F]">
                          {createTeamServerIds.length} selecionado(s)
                        </span>
                      </div>
                      {!isTeamServersLoading && !availableTeamServerOptions.length && teamServerOptions.length ? (
                        <p className="mb-[10px] text-[12px] leading-[1.5] text-[#676767]">
                          Todos os servidores disponiveis no painel ja estao vinculados a outra equipe.
                        </p>
                      ) : null}
                      <div className="max-h-[360px] space-y-[8px] overflow-y-auto pr-[4px]">
                        {availableTeamServerOptions.length ? availableTeamServerOptions.map((server) => {
                          const isChecked = createTeamServerIds.includes(server.guildId);
                          return (
                            <label
                              key={server.guildId}
                              className={`flex cursor-pointer items-center gap-[12px] rounded-[16px] border px-[14px] py-[12px] transition-colors ${
                                isChecked
                                  ? "border-[rgba(0,98,255,0.32)] bg-[rgba(0,98,255,0.08)]"
                                  : "border-[#141414] bg-[#0A0A0A] hover:border-[#1F1F1F] hover:bg-[#0D0D0D]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleCreateTeamServer(server.guildId)}
                                className="hidden"
                              />
                              <span
                                className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${
                                  isChecked
                                    ? "border-[#0062FF] bg-[#0062FF]"
                                    : "border-[#303030] bg-[#111111]"
                                }`}
                              >
                                {isChecked ? (
                                  <span className="h-[6px] w-[6px] rounded-full bg-white" />
                                ) : null}
                              </span>
                              {server.iconUrl ? (
                                <Image
                                  src={server.iconUrl}
                                  alt={server.guildName}
                                  width={36}
                                  height={36}
                                  className="h-[36px] w-[36px] rounded-[12px] object-cover"
                                />
                              ) : (
                                <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[12px] bg-[#131313] text-[11px] font-semibold text-[#8A8A8A]">
                                  FD
                                </div>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] leading-none font-medium text-[#E8E8E8]">
                                  {server.guildName}
                                </span>
                                <span className="mt-[5px] block truncate text-[12px] leading-none text-[#6B6B6B]">
                                  {server.guildId}
                                </span>
                              </span>
                            </label>
                          );
                        }) : (
                          <div className="rounded-[16px] border border-[#141414] bg-[#0A0A0A] px-[14px] py-[14px] text-[13px] leading-[1.5] text-[#6E6E6E]">
                            {isTeamServersLoading
                              ? "Carregando servidores disponiveis..."
                              : "Nenhum servidor disponivel no painel para vincular a uma equipe agora."}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {createTeamStep === "members" ? (
                    <div className="mt-[18px] space-y-[14px]">
                      <div className="rounded-[18px] border border-[#141414] bg-[#0A0A0A] p-[14px]">
                        <div className="flex flex-col gap-[10px] sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[12px] uppercase tracking-[0.16em] text-[#666666]">
                              Convidar membros
                            </p>
                            <p className="mt-[8px] text-[13px] leading-[1.55] text-[#727272]">
                              Adicione IDs do Discord. Eles ficam pendentes ate o staff entrar no painel e aceitar o convite.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenMemberSubmodal}
                            className="group relative inline-flex h-[42px] shrink-0 items-center justify-center overflow-visible whitespace-nowrap rounded-[12px] px-5 text-[13px] leading-none font-semibold"
                          >
                            <span
                              aria-hidden="true"
                              className="absolute inset-0 rounded-[12px] bg-[#111111] transition-transform duration-150 ease-out group-hover:scale-[1.02] group-active:scale-[0.985]"
                            />
                            <span className="relative z-10 inline-flex items-center gap-[8px] whitespace-nowrap leading-none text-[#B7B7B7]">
                              <PlusIcon />
                              Adicionar membro
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-[#141414] bg-[#0A0A0A] p-[14px]">
                        <div className="flex items-center justify-between gap-[10px]">
                          <p className="text-[12px] uppercase tracking-[0.16em] text-[#666666]">
                            Membros pendentes
                          </p>
                          <span className="text-[12px] text-[#6A6A6A]">
                            {createTeamMemberIds.length} ID(s)
                          </span>
                        </div>
                        {createTeamMemberIds.length ? (
                          <div className="mt-[12px] flex flex-wrap gap-[8px]">
                            {createTeamMemberIds.map((discordId) => (
                              <button
                                key={discordId}
                                type="button"
                                onClick={() => handleRemoveTeamMemberId(discordId)}
                                className="inline-flex items-center gap-[8px] rounded-full border border-[#171717] bg-[#121212] px-[10px] py-[7px] text-[12px] leading-none text-[#C4C4C4] transition-colors hover:border-[#242424] hover:text-[#F0F0F0]"
                              >
                                <span>{discordId}</span>
                                <span className="text-[13px] leading-none text-[#777777]">x</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-[12px] text-[12px] text-[#5E5E5E]">
                            Nenhum membro adicionado ainda.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-[20px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      if (createTeamStep === "name") {
                        setIsCreateTeamModalOpen(false);
                        setIsMemberSubmodalOpen(false);
                        setTeamActionError(null);
                        return;
                      }
                      if (createTeamStep === "servers") {
                        setCreateTeamStep("name");
                        setTeamActionError(null);
                        return;
                      }
                      setCreateTeamStep("servers");
                      setTeamActionError(null);
                    }}
                    className="inline-flex h-[46px] items-center justify-center rounded-[14px] border border-[#171717] bg-[#0D0D0D] px-[18px] text-[14px] font-medium text-[#CACACA] transition-colors hover:border-[#232323] hover:bg-[#111111] hover:text-[#F1F1F1]"
                  >
                    {createTeamStep === "name" ? "Cancelar" : "Voltar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (createTeamStep === "name") {
                        if (createTeamName.trim().length < 3) {
                          setTeamActionError("Escolha um nome de equipe com pelo menos 3 caracteres.");
                          return;
                        }
                        setTeamActionError(null);
                        setCreateTeamStep("servers");
                        return;
                      }
                      if (createTeamStep === "servers") {
                        if (!createTeamServerIds.length) {
                          setTeamActionError("Selecione pelo menos um servidor para vincular a equipe.");
                          return;
                        }
                        setTeamActionError(null);
                        setCreateTeamStep("members");
                        return;
                      }
                      void handleCreateTeam();
                    }}
                    disabled={
                      isCreateTeamNextDisabled
                    }
                    className="group relative inline-flex h-[46px] shrink-0 items-center justify-center overflow-visible whitespace-nowrap rounded-[12px] px-6 text-[14px] leading-none font-semibold disabled:cursor-not-allowed disabled:opacity-75"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 rounded-[12px] transition-transform duration-150 ease-out group-hover:scale-[1.02] group-active:scale-[0.985] ${
                        isCreateTeamNextDisabled ? "bg-[#111111]" : "bg-[#F3F3F3]"
                      }`}
                    />
                    <span
                      className={`relative z-10 inline-flex items-center justify-center whitespace-nowrap leading-none ${
                        isCreateTeamNextDisabled ? "text-[#B7B7B7]" : "text-[#111111]"
                      }`}
                    >
                      {isCreatingTeam ? (
                        <span className="relative inline-flex items-center justify-center">
                          <span className="invisible">
                            {createTeamStep === "members" ? "Criar equipe" : "Proximo"}
                          </span>
                          <span className="absolute inset-0 flex items-center justify-center">
                            <ButtonLoader size={16} colorClassName={isCreateTeamNextDisabled ? "text-[#B7B7B7]" : "text-[#111111]"} />
                          </span>
                        </span>
                      ) : (
                        createTeamStep === "members" ? "Criar equipe" : "Proximo"
                      )}
                    </span>
                  </button>
                </div>
              </div>
              </div>
            </div>
          </div>

          {isMemberSubmodalOpen ? (
            <div className="absolute inset-0 z-[30] overflow-y-auto overscroll-contain p-[16px]">
              <button
                type="button"
                aria-label="Fechar submodal de membros"
                className="absolute inset-0 bg-[rgba(0,0,0,0.62)]"
                onClick={() => {
                  setIsMemberSubmodalOpen(false);
                  setTeamActionError(null);
                }}
              />
              <div className="relative z-[40] mx-auto flex min-h-full items-center justify-center">
                <div className="w-full max-w-[520px] overflow-hidden rounded-[16px] border border-[#222226] bg-[#161618] p-[18px]">
                <div className="flex items-start justify-between gap-[14px]">
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.16em] text-[#666666]">
                      Adicionar membros
                    </p>
                    <p className="mt-[10px] text-[14px] leading-[1.55] text-[#797979]">
                      Digite um ou mais IDs do Discord. Use um campo por pessoa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMemberSubmodalOpen(false);
                      setTeamActionError(null);
                    }}
                    className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-[#171717] bg-[#0D0D0D] text-[#9C9C9C] transition-colors hover:border-[#242424] hover:text-[#E4E4E4]"
                    aria-label="Fechar submodal"
                  >
                    <span className="text-[18px] leading-none">x</span>
                  </button>
                </div>

                <div className="mt-[18px] space-y-[10px]">
                  {memberDraftIds.map((draft, index) => (
                    <input
                      key={index}
                      type="text"
                      value={typeof draft === "string" ? draft : ""}
                      onChange={(event) => handleMemberDraftChange(index, String(event.currentTarget.value ?? ""))}
                      placeholder={
                        'ID do membro ' + (index + 1)
                      }
                      autoComplete="off"
                      className="h-[48px] w-full rounded-[14px] border border-[#151515] bg-[#0A0A0A] px-[16px] text-[14px] text-[#E0E0E0] outline-none transition-colors placeholder:text-[#575757] focus:border-[rgba(0,98,255,0.34)]"
                    />
                  ))}
                </div>

                <div className="mt-[14px] flex flex-wrap gap-[8px]">
                  <button
                    type="button"
                    onClick={handleAddMemberDraftField}
                    className="inline-flex h-[40px] items-center justify-center rounded-[12px] border border-[#171717] bg-[#0D0D0D] px-[14px] text-[13px] font-medium text-[#CACACA] transition-colors hover:border-[#232323] hover:bg-[#111111] hover:text-[#F1F1F1]"
                  >
                    Adicionar mais
                  </button>
                  {normalizedInviteDraftDiscordIds.length ? (
                    <div className="flex flex-wrap items-center gap-[8px]">
                      {normalizedInviteDraftDiscordIds.map((discordId) => (
                        <span
                          key={discordId}
                          className="inline-flex rounded-full border border-[#171717] bg-[#121212] px-[10px] py-[7px] text-[12px] leading-none text-[#BFBFBF]"
                        >
                          {discordId}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-[18px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMemberSubmodalOpen(false);
                      setTeamActionError(null);
                    }}
                    className="inline-flex h-[44px] items-center justify-center rounded-[12px] border border-[#171717] bg-[#0D0D0D] px-[16px] text-[13px] font-medium text-[#CACACA] transition-colors hover:border-[#232323] hover:bg-[#111111] hover:text-[#F1F1F1]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmMemberDrafts}
                    className="group relative inline-flex h-[44px] shrink-0 items-center justify-center overflow-visible whitespace-nowrap rounded-[12px] px-5 text-[13px] leading-none font-semibold"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-[12px] bg-[#111111] transition-transform duration-150 ease-out group-hover:scale-[1.02] group-active:scale-[0.985]"
                    />
                    <span className="relative z-10 inline-flex items-center justify-center whitespace-nowrap leading-none text-[#B7B7B7]">
                      Confirmar IDs
                    </span>
                  </button>
                </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </PanelShell>
  );
}
