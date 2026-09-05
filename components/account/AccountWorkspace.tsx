"use client";

import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useTransition,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgePercent,
  ChevronDown,
  ChevronLeft,
  Contact,
  CreditCard,
  History,
  Key,
  LifeBuoy,
  MonitorSmartphone,
  Search,
  Settings2,
  ShieldAlert,
  Ticket,
  UserRound,
  Users,
  Shield,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { OFFICIAL_DISCORD_INVITE_URL } from "@/lib/discordLink/config";
import { LandingReveal } from "@/components/landing/LandingReveal";
import { setWorkspaceShellReadyState } from "@/components/workspace/WorkspaceRouteAdaptiveLoading";
import { useAccountStatus } from "@/hooks/useAccountData";
import { AccountTabLoadingState } from "@/components/account/TabRegistry";

import {
  ACCOUNT_RETURN_QUERY_PARAM,
  getAccountReturnLabel,
  readStoredAccountReturnPath,
  sanitizeAccountReturnPath,
  storeAccountReturnPath,
} from "@/lib/account/navigation";
import { buildDiscordAuthStartHref, buildLoginHref } from "@/lib/auth/paths";
import { type AccountTab, ACCOUNT_TABS, validateTab } from "@/lib/account/tabs";
import { buildBrowserRoutingTargetFromInternalPath } from "@/lib/routing/subdomains";
import {
  scheduleWarmBrowserRoutes,
  warmBrowserRoute,
} from "@/lib/routing/browserWarmup";
import { useLatchedPendingKey } from "@/lib/ui/useLatchedPendingKey";
import { useLiveAccountProfile } from "@/hooks/useLiveAccountProfile";
import {
  PanelShell,
  fdNavGroupClass,
  fdNavItemClass,
  type PanelQuickLink,
} from "@/components/panel-shell";
export { validateTab };
export type { AccountTab };

function normalizeComparablePath(value: string) {
  if (!value) return "/";
  if (value === "/") return value;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

type NavItem = {
  id: AccountTab;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  category: string;
  items: NavItem[];
};

type SavedPanelAccount = {
  authUserId: number;
  discordUserId: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  lastSeenAt: number;
};

const NAV_GROUPS: NavGroup[] = [
  {
    category: "Conta",
    items: [
      { id: "overview", label: "Visão Geral", icon: UserRound },
      { id: "personal_data", label: "Meus dados", icon: Contact },
      { id: "sessions", label: "Sessoes", icon: MonitorSmartphone },
    ],
  },
  {
    category: "Cobrança",
    items: [
      { id: "plans", label: "Assinaturas", icon: BadgePercent },
      { id: "payment_methods", label: "Métodos de Pagamento", icon: CreditCard },
      { id: "payment_history", label: "Histórico", icon: History },
    ],
  },
  {
    category: "Ferramentas",
    items: [
      { id: "api_keys", label: "Chaves API", icon: Key },
      { id: "teams", label: "Equipes e Membros", icon: Users },
      { id: "tickets", label: "Tickets de Suporte", icon: Ticket },
    ],
  },
  {
    category: "Conta",
    items: [
      { id: "status", label: "Status da Conta", icon: ShieldCheck },
      { id: "delete_account", label: "Excluir Conta", icon: ShieldAlert },
    ],
  },
];

const ACCOUNT_NAV_GROUPS: NavGroup[] = NAV_GROUPS.map((group) => ({
  ...group,
  items: group.items.map((item) => {
    if (item.id === "plans") {
      return { ...item, label: "Assinaturas" };
    }

    if (item.id === "payment_methods") {
      return { ...item, label: "Metodos de Pagamento" };
    }

    if (item.id === "payment_history") {
      return { ...item, label: "Historico de Pagamentos" };
    }

    return item;
  }),
}));

const ACCOUNT_SIDEBAR_COLLAPSE_KEY = "flowdesk_account_sidebar_groups_v1";
const SAVED_PANEL_ACCOUNTS_KEY = "flowdesk_saved_panel_accounts_v1";

function buildAccountGroupKey(group: NavGroup, groupIndex: number) {
  return `${group.category}-${groupIndex}`;
}

function buildDefaultCollapsedGroups() {
  return Object.fromEntries(
    ACCOUNT_NAV_GROUPS.map((group, groupIndex) => [buildAccountGroupKey(group, groupIndex), true]),
  ) as Record<string, boolean>;
}

function readStoredCollapsedGroups() {
  if (typeof window === "undefined") {
    return buildDefaultCollapsedGroups();
  }

  const fallback = buildDefaultCollapsedGroups();

  try {
    const raw = window.localStorage.getItem(ACCOUNT_SIDEBAR_COLLAPSE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(fallback).map((key) => [key, typeof parsed[key] === "boolean" ? parsed[key] : fallback[key]]),
    ) as Record<string, boolean>;
  } catch {
    return fallback;
  }
}

function normalizeSavedPanelAccounts(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<SavedPanelAccount>;
      if (
        typeof record.authUserId !== "number" ||
        typeof record.displayName !== "string" ||
        typeof record.username !== "string" ||
        typeof record.lastSeenAt !== "number"
      ) {
        return null;
      }

      return {
        authUserId: record.authUserId,
        discordUserId:
          typeof record.discordUserId === "string" ? record.discordUserId : null,
        displayName: record.displayName,
        username: record.username,
        avatarUrl: typeof record.avatarUrl === "string" ? record.avatarUrl : null,
        lastSeenAt: record.lastSeenAt,
      } satisfies SavedPanelAccount;
    })
    .filter((value): value is SavedPanelAccount => value !== null)
    .slice(0, 3);
}

function resolveSavedAccountKey(account: {
  authUserId: number;
  discordUserId: string | null;
}) {
  return account.discordUserId || `auth:${account.authUserId}`;
}

function mergeSavedPanelAccounts(
  currentAccount: SavedPanelAccount,
  previousAccounts: SavedPanelAccount[],
) {
  const currentAccountKey = resolveSavedAccountKey(currentAccount);
  return [
    currentAccount,
    ...previousAccounts.filter(
      (account) => resolveSavedAccountKey(account) !== currentAccountKey,
    ),
  ]
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, 3);
}

// ─── Main Workspace Shell ──────────────────────────────────────────────────────

type AccountWorkspaceProps = {
  authUserId: number;
  discordUserId: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  children?: React.ReactNode;
};

export function AccountWorkspace({
  authUserId,
  discordUserId,
  displayName,
  username,
  avatarUrl,
  children,
}: AccountWorkspaceProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => buildDefaultCollapsedGroups());
  const [hasLoadedCollapsedGroups, setHasLoadedCollapsedGroups] = useState(false);
  const [pendingTab, setPendingTab] = useState<AccountTab | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedPanelAccount[]>([]);
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const [, startSidebarNavigationTransition] = useTransition();

  const { statusData } = useAccountStatus();
  const isSuspended = (statusData?.statusLevel ?? 0) >= 4;
  const isAtRisk = (statusData?.statusLevel ?? 0) >= 1;

  useEffect(() => {
    setWorkspaceShellReadyState("account", true);

    return () => {
      setWorkspaceShellReadyState("account", false);
    };
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialAccountProfile = useMemo(
    () => ({
      authUserId,
      discordUserId,
      displayName,
      username,
      avatarUrl,
    }),
    [authUserId, avatarUrl, discordUserId, displayName, username],
  );
  const currentAccount = useLiveAccountProfile(initialAccountProfile);

  // Derive active tab from pathname reactively
  const segments = pathname.split("/").filter(Boolean);
  // segments could be ["account"] or ["account", "plans"]
  const lastSegment = segments[segments.length - 1];
  const activeTab: AccountTab = (lastSegment && lastSegment !== "account") 
    ? validateTab(lastSegment) 
    : "overview";
  const latchedPendingTab = useLatchedPendingKey({
    pendingKey: pendingTab,
    resolvedKey: activeTab,
  });
  const highlightedTab = pendingTab ?? activeTab;
  const displayedTab = (latchedPendingTab as AccountTab | null) ?? highlightedTab;

  const buildTabHref = useCallback((tab: AccountTab) => {
    return tab === "overview" ? "/account" : `/account/${tab}`;
  }, []);

  const prefetchHref = useCallback((href: string) => {
    warmBrowserRoute(href, {
      router,
      prefetchDocument: true,
    });
  }, [router]);

  const prefetchTab = useCallback((tab: AccountTab) => {
    prefetchHref(buildTabHref(tab));
  }, [buildTabHref, prefetchHref]);

  const navigateToHref = useCallback((href: string, nextTab?: AccountTab | null) => {
    setIsProfileMenuOpen(false);
    setIsMobileNavOpen(false);
    const target = warmBrowserRoute(href, {
      router,
      prefetchDocument: true,
    });
    if (normalizeComparablePath(pathname) === normalizeComparablePath(target.path)) {
      return;
    }

    if (nextTab) {
      setPendingTab(nextTab);
    }

    if (!target.sameOrigin) {
      window.location.assign(target.href);
      return;
    }

    prefetchHref(href);
    startSidebarNavigationTransition(() => {
      router.push(target.path, { scroll: false });
    });
  }, [pathname, prefetchHref, router, startSidebarNavigationTransition]);

  const navigateToTab = useCallback((tab: AccountTab) => {
    navigateToHref(buildTabHref(tab), tab);
  }, [buildTabHref, navigateToHref]);

  useEffect(() => {
    if (!pendingTab || pendingTab !== activeTab) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingTab(null);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, pendingTab]);

  useEffect(() => {
    return scheduleWarmBrowserRoutes(
      [
        ...ACCOUNT_TABS.map((tab) =>
          tab === "overview" ? "/account" : `/account/${tab}`,
        ),
        "/servers",
        "/dashboard",
      ],
      {
        router,
        delayMs: 80,
      },
    );
  }, [router]);

  useEffect(() => {
    setCollapsedGroups(readStoredCollapsedGroups());
    setHasLoadedCollapsedGroups(true);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_PANEL_ACCOUNTS_KEY);
      const currentSnapshot: SavedPanelAccount = {
        ...currentAccount,
        lastSeenAt: Date.now(),
      };
      const nextAccounts = mergeSavedPanelAccounts(
        currentSnapshot,
        normalizeSavedPanelAccounts(raw ? JSON.parse(raw) : []),
      );
      setSavedAccounts(nextAccounts);
      window.localStorage.setItem(
        SAVED_PANEL_ACCOUNTS_KEY,
        JSON.stringify(nextAccounts),
      );
    } catch {
      setSavedAccounts([
        {
          ...currentAccount,
          lastSeenAt: Date.now(),
        },
      ]);
    }
  }, [currentAccount]);

  useEffect(() => {
    const queryReturnPath = sanitizeAccountReturnPath(
      searchParams.get(ACCOUNT_RETURN_QUERY_PARAM),
    );
    const storedReturnPath = readStoredAccountReturnPath();
    const resolvedReturnPath =
      storeAccountReturnPath(queryReturnPath ?? storedReturnPath ?? "/dashboard") ||
      "/dashboard";

    setReturnPath(resolvedReturnPath);
  }, [searchParams]);

  async function handleLogout() {
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
      try {
        window.localStorage.removeItem("flowdesk_pending_account_switch_v1");
      } catch {
        // noop
      }
      window.location.replace(buildLoginHref());
    }
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const normalizedSearch = sidebarSearch.trim().toLowerCase();

  useEffect(() => {
    if (!hasLoadedCollapsedGroups) return;

    try {
      window.localStorage.setItem(ACCOUNT_SIDEBAR_COLLAPSE_KEY, JSON.stringify(collapsedGroups));
    } catch {
      // noop
    }
  }, [collapsedGroups, hasLoadedCollapsedGroups]);

  useEffect(() => {
    const activeGroupIndex = ACCOUNT_NAV_GROUPS.findIndex((group) =>
      group.items.some((item) => item.id === activeTab),
    );
    if (activeGroupIndex < 0) return;

    const groupKey = buildAccountGroupKey(ACCOUNT_NAV_GROUPS[activeGroupIndex], activeGroupIndex);
    setCollapsedGroups((prev) => {
      if (prev[groupKey] === false) return prev;
      return { ...prev, [groupKey]: false };
    });
  }, [activeTab]);

  function matchesSearch(item: NavItem) {
    if (!normalizedSearch) return true;
    return item.label.toLowerCase().includes(normalizedSearch);
  }

  const openDiscordLoginFlow = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextPath = `${window.location.pathname}${window.location.search}`;
    window.location.assign(buildDiscordAuthStartHref(nextPath));
  }, []);

  const handleAddAnotherAccount = useCallback(() => {
    setIsProfileMenuOpen(false);
    openDiscordLoginFlow();
  }, [openDiscordLoginFlow]);

  const handleSwitchSavedAccount = useCallback((account: SavedPanelAccount) => {
    if (resolveSavedAccountKey(account) === resolveSavedAccountKey(currentAccount)) {
      setIsProfileMenuOpen(false);
      return;
    }

    if (!account.discordUserId) {
      setIsProfileMenuOpen(false);
      window.location.replace(buildLoginHref());
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
  }, [currentAccount, openDiscordLoginFlow]);

  const handleOpenAccountSettings = useCallback(() => {
    navigateToHref("/account", "overview");
  }, [navigateToHref]);

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

  const handleReturnToPreviousPage = useCallback(() => {
    navigateToHref(returnPath || "/dashboard");
  }, [navigateToHref, returnPath]);

  // ── Page title / description ─────────────────────────────────────────────────

  const PAGE_META: Record<AccountTab, { eyebrow: string; title: string; subtitle: string }> = {
    overview: {
      eyebrow: "Minha conta",
      title: "Visão Geral",
      subtitle: "Gerencie sua conta, cobrança, chaves de API e equipes em um único lugar.",
    },
    personal_data: {
      eyebrow: "Minha conta",
      title: "Meus dados",
      subtitle: "Gerencie sua identidade, acessos vinculados e segurança da conta.",
    },
    sessions: {
      eyebrow: "Minha conta",
      title: "Sessoes",
      subtitle: "Veja dispositivos conectados e encerre acessos que voce nao reconhece.",
    },
    plans: {
      eyebrow: "Cobrança",
      title: "Assinaturas",
      subtitle: "Seu plano atual, status de ativação e opções de upgrade.",
    },
    payment_methods: {
      eyebrow: "Cobrança",
      title: "Métodos de Pagamento",
      subtitle: "Cadastre e gerencie seus cartões e métodos de pagamento.",
    },
    payment_history: {
      eyebrow: "Cobrança",
      title: "Histórico de Pagamentos",
      subtitle: "Visualize todas as transações e cobranças da sua conta.",
    },
    api_keys: {
      eyebrow: "Ferramentas",
      title: "Chaves de API",
      subtitle: "Crie e revogue chaves para integrar o Flowdesk com sistemas externos.",
    },
    teams: {
      eyebrow: "Ferramentas",
      title: "Equipes e Membros",
      subtitle: "Gerencie equipes, convite membros e ajuste permissões.",
    },
    tickets: {
      eyebrow: "Suporte",
      title: "Tickets de Suporte",
      subtitle: "Visualize o histórico de atendimentos e abra novos chamados.",
    },
    status: {
      eyebrow: "Avançado",
      title: "Status da Conta",
      subtitle: "Visualize o histórico de violações e integridade da sua conta.",
    },
    delete_account: {
      eyebrow: "Zona de perigo",
      title: "Excluir Conta",
      subtitle: "Esta ação é permanente e não pode ser revertida.",
    },
  };

  const meta = PAGE_META[displayedTab];
  const shouldShowAccountContentLoading = Boolean(latchedPendingTab);
  const returnLabel = getAccountReturnLabel(returnPath);

  const renderSidebarContent = () => (
    <div className="fd-sidebar-inner">
      <div className="fd-sidebar-search">
        <Search className="h-[16px] w-[16px] shrink-0 text-[#8b8b90]" strokeWidth={1.85} aria-hidden="true" />
        <input
          type="text"
          value={sidebarSearch}
          onChange={(e) => setSidebarSearch(e.target.value)}
          placeholder="Filtrar navegacao..."
          autoComplete="off"
        />
      </div>

      <div className="mt-[14px] space-y-[4px]">
          <button
            type="button"
            onMouseEnter={() => prefetchHref(returnPath || "/dashboard")}
            onFocus={() => prefetchHref(returnPath || "/dashboard")}
            onPointerDown={() => prefetchHref(returnPath || "/dashboard")}
            onClick={() => {
              setIsMobileNavOpen(false);
              handleReturnToPreviousPage();
            }}
            className={fdNavItemClass()}
          >
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-[#8A8A8A] group-hover:text-[#DADADA]">
            <ChevronLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
            {returnLabel}
          </span>
        </button>
      </div>

      <div className="mt-[14px] flex-1 overflow-y-auto pr-[2px]">
        {ACCOUNT_NAV_GROUPS.map((group, groupIndex) => {
          const visibleItems = group.items.filter(matchesSearch);
          if (!visibleItems.length) return null;
          const shouldShowCategory =
            groupIndex === 0 ||
            (group.category !== ACCOUNT_NAV_GROUPS[groupIndex - 1]?.category);

          const groupKey = buildAccountGroupKey(group, groupIndex);
          const isCollapsed = collapsedGroups[groupKey] && !normalizedSearch;
          const isGroupActive = group.items.some((item) => item.id === activeTab);
          const isGroupOpen = !isCollapsed && !normalizedSearch;

          return (
            <div key={groupKey} className={groupIndex > 0 && shouldShowCategory ? "mt-[12px]" : ""}>
              {shouldShowCategory && (
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  className={fdNavGroupClass({ active: isGroupActive, open: isGroupOpen })}
                >
                  <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${
                    isGroupActive
                      ? "text-[#DADADA]"
                      : isGroupOpen
                        ? "text-[#C7C7C7]"
                        : "text-[#8A8A8A] group-hover:text-[#DADADA]"
                  }`}>
                     {group.category === "Conta" && <Settings2 className="h-[16px] w-[16px]" strokeWidth={1.9} />}
                     {group.category === "Cobrança" && <CreditCard className="h-[16px] w-[16px]" strokeWidth={1.9} />}
                     {group.category === "Ferramentas" && <Key className="h-[16px] w-[16px]" strokeWidth={1.9} />}
                     {group.category === "Suporte" && <LifeBuoy className="h-[16px] w-[16px]" strokeWidth={1.9} />}
                     {group.category === "Zona de perigo" && <Shield className="h-[16px] w-[16px]" strokeWidth={1.9} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                    {group.category === "Conta" && groupIndex > 0 ? "Avançado" : group.category}
                  </span>
                  <span
                    className={`transition-transform duration-200 ${
                      !isCollapsed || normalizedSearch
                        ? "rotate-180 text-[#C9C9C9]"
                        : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                    }`}
                  >
                    <ChevronDown className="h-[14px] w-[14px] shrink-0" strokeWidth={1.9} />
                  </span>
                </button>
              )}

              {(!isCollapsed || normalizedSearch) && (
                <div className="fd-nav-children">
                  {visibleItems.map((item) => {
                    const isActive = highlightedTab === item.id;
                    const Icon = item.icon;
                    const isDanger = item.id === "delete_account";

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigateToTab(item.id)}
                        onMouseEnter={() => prefetchTab(item.id)}
                        onFocus={() => prefetchTab(item.id)}
                        onPointerDown={() => prefetchTab(item.id)}
                        className={fdNavItemClass({ active: isActive, danger: isDanger })}
                      >
                        <span
                          className={`inline-flex h-[20px] w-[20px] items-center justify-center ${
                            isActive
                              ? isDanger ? "text-[#F0A0A0]" : "text-[#F0F0F0]"
                              : isDanger
                                ? "text-[#9A5555] group-hover:text-[#F0A0A0]"
                                : "text-[#7F7F7F] group-hover:text-[#DADADA]"
                          }`}
                        >
                          <Icon className="h-[16px] w-[16px]" strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.03em]">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const paletteLinks: PanelQuickLink[] = ACCOUNT_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      id: item.id,
      label: item.label,
      group: group.category === "Conta" && group.items[0]?.id === "status" ? "Avancado" : group.category,
      icon: item.icon,
      onSelect: () => {
        setIsProfileMenuOpen(false);
        setIsMobileNavOpen(false);
        navigateToTab(item.id);
      },
    })),
  );

  return (
    <PanelShell
      className="flowdesk-account-ui"
      crumb="FlowDesk"
      title={meta.title}
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
        onSwitchAccount: (account) =>
          handleSwitchSavedAccount({
            authUserId: account.authUserId ?? currentAccount.authUserId,
            discordUserId: account.discordUserId,
            displayName: account.displayName,
            username: account.username,
            avatarUrl: account.avatarUrl,
            lastSeenAt: Date.now(),
          }),
        onOpenMyAccount: handleOpenMyAccount,
        onOpenSettings: handleOpenAccountSettings,
        onOpenApiDocs: () => navigateToTab("api_keys"),
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
      sidebar={renderSidebarContent()}
    >
          <section className="min-w-0">
            <LandingReveal delay={36} duration={240}>
              <div className="flex flex-col gap-[14px] md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#666666]">{meta.eyebrow}</p>
                  <h1 className="mt-[7px] text-[24px] leading-[1.2] font-semibold text-[#EEEEEE] md:text-[28px]">
                    {meta.title}
                  </h1>
                  <p className="mt-[7px] max-w-[760px] text-[13px] leading-[1.55] text-[#737373]">
                    {meta.subtitle}
                  </p>
                </div>
              </div>
            </LandingReveal>

            <LandingReveal delay={52} duration={240}>
              <div className="mt-[20px]">
                {/* Suspension Banner */}
                {isSuspended && activeTab !== "status" && (
                  <div className="mb-[20px] flex items-start gap-[16px] rounded-[18px] border border-[#DB4646]/40 bg-[rgba(219,70,70,0.08)] px-[20px] py-[18px]">
                    <Shield className="mt-[2px] h-[22px] w-[22px] shrink-0 text-[#DB4646]" strokeWidth={2} />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#DB4646]">Conta Suspensa</p>
                      <p className="mt-[4px] text-[13px] text-[#B06060] leading-[1.5]">
                        Sua conta está suspensa e o acesso às funcionalidades está limitado.{" "}
                        <Link href="/account/status" className="underline hover:text-[#DB4646]">Ver detalhes na aba Status</Link>.
                      </p>
                    </div>
                  </div>
                )}
                {isAtRisk && !isSuspended && activeTab !== "status" && (
                  <div className="mb-[20px] flex items-start gap-[16px] rounded-[18px] border border-[#E7A540]/30 bg-[rgba(231,165,64,0.07)] px-[20px] py-[18px]">
                    <ShieldAlert className="mt-[2px] h-[22px] w-[22px] shrink-0 text-[#E7A540]" strokeWidth={2} />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#E7A540]">Conta com Restrições</p>
                      <p className="mt-[4px] text-[13px] text-[#A08040] leading-[1.5]">
                        Sua conta possui violações ativas que podem afetar seus serviços.{" "}
                        <Link href="/account/status" className="underline hover:text-[#E7A540]">Ver na aba Status</Link>.
                      </p>
                    </div>
                  </div>
                )}
                {shouldShowAccountContentLoading ? <AccountTabLoadingState /> : children}
              </div>
            </LandingReveal>
          </section>
    </PanelShell>
  );
}
