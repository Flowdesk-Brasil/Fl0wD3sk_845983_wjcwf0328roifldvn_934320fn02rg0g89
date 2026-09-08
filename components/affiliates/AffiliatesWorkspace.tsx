"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Search,
} from "lucide-react";
import { LandingReveal } from "@/components/landing/LandingReveal";
import { useLiveAccountProfile } from "@/hooks/useLiveAccountProfile";
import { buildLoginHref } from "@/lib/auth/paths";
import { scheduleWarmBrowserRoutes, warmBrowserRoute } from "@/lib/routing/browserWarmup";
import { useLatchedPendingKey } from "@/lib/ui/useLatchedPendingKey";
import {
  PanelShell,
  fdNavGroupClass,
  fdNavItemClass,
  type PanelQuickLink,
} from "@/components/panel-shell";
import {
  AFFILIATE_NAV_GROUPS,
  AFFILIATE_PAGE_META,
  AFFILIATE_SIDEBAR_COLLAPSE_KEY,
  AFFILIATE_TABS,
  buildAffiliateGroupKey,
  readStoredAffiliateCollapsedGroups,
  type AffiliateTab,
} from "@/components/affiliates/affiliateConfig";
import { AffiliateTabContent } from "@/components/affiliates/AffiliateTabs";
import { AffiliateEnrollmentGate } from "@/components/affiliates/AffiliateEnrollmentGate";
import { TabSkeleton } from "@/components/affiliates/affiliateUi";
import { useAffiliateData } from "@/components/affiliates/useAffiliateData";

const SAVED_PANEL_ACCOUNTS_KEY = "flowdesk_saved_panel_accounts_v1";

type SavedPanelAccount = {
  authUserId: number;
  discordUserId: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  lastSeenAt: number;
};

export type AffiliatesWorkspaceProps = {
  authUserId: number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  initialTab?: AffiliateTab;
};

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
        discordUserId: typeof record.discordUserId === "string" ? record.discordUserId : null,
        displayName: record.displayName,
        username: record.username,
        avatarUrl: typeof record.avatarUrl === "string" ? record.avatarUrl : null,
        lastSeenAt: record.lastSeenAt,
      } satisfies SavedPanelAccount;
    })
    .filter((value): value is SavedPanelAccount => value !== null)
    .slice(0, 3);
}

function resolveSavedAccountKey(account: { authUserId: number; discordUserId: string | null }) {
  return account.discordUserId || `auth:${account.authUserId}`;
}

function mergeSavedPanelAccounts(currentAccount: SavedPanelAccount, previousAccounts: SavedPanelAccount[]) {
  const currentAccountKey = resolveSavedAccountKey(currentAccount);
  return [
    currentAccount,
    ...previousAccounts.filter((account) => resolveSavedAccountKey(account) !== currentAccountKey),
  ]
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, 3);
}

export function AffiliatesWorkspace({
  authUserId,
  displayName,
  username,
  avatarUrl,
  initialTab = "overview",
}: AffiliatesWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AffiliateTab>(initialTab);
  const [pendingTab, setPendingTab] = useState<AffiliateTab | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    AFFILIATE_NAV_GROUPS.reduce(
      (acc, group, index) => ({
        ...acc,
        [buildAffiliateGroupKey(group, index)]: false,
      }),
      {} as Record<string, boolean>,
    ),
  );
  const [hasLoadedCollapsedGroups, setHasLoadedCollapsedGroups] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedPanelAccount[]>([]);
  const [, startTabTransition] = useTransition();

  const initialAccountProfile = useMemo(
    () => ({
      authUserId,
      displayName,
      username,
      avatarUrl,
    }),
    [authUserId, avatarUrl, displayName, username],
  );
  const currentAccount = useLiveAccountProfile(initialAccountProfile);

  const {
    enrolled,
    status,
    statusMessage,
    rules,
    profile,
    stats,
    insight,
    links,
    conversions,
    withdrawals,
    ranking,
    settings,
    loading,
    isRefreshing,
    errorMessage,
    reload,
  } = useAffiliateData();

  const highlightedTab = pendingTab ?? activeTab;
  const latchedPendingTab = useLatchedPendingKey({
    pendingKey: pendingTab,
    resolvedKey: activeTab,
  });
  const displayedTab = (latchedPendingTab as AffiliateTab | null) ?? highlightedTab;
  const meta = AFFILIATE_PAGE_META[displayedTab];
  const normalizedSearch = sidebarSearch.trim().toLowerCase();

  const buildTabHref = useCallback((tab: AffiliateTab) => {
    return tab === "overview" ? "/affiliates/dashboard" : `/affiliates/dashboard?tab=${tab}`;
  }, []);

  const prefetchTab = useCallback(
    (tab: AffiliateTab) => {
      warmBrowserRoute(buildTabHref(tab), { router, prefetchDocument: true });
    },
    [buildTabHref, router],
  );

  const navigateToTab = useCallback(
    (tab: AffiliateTab) => {
      setIsProfileMenuOpen(false);
      setIsMobileNavOpen(false);
      setActiveTab(tab);
      setPendingTab(tab);

      const href = buildTabHref(tab);
      warmBrowserRoute(href, { router, prefetchDocument: true });
      startTabTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [buildTabHref, router, startTabTransition],
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!pendingTab || pendingTab !== activeTab) return;
    const timeoutId = window.setTimeout(() => setPendingTab(null), 180);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, pendingTab]);

  useEffect(() => {
    setCollapsedGroups(readStoredAffiliateCollapsedGroups());
    setHasLoadedCollapsedGroups(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedCollapsedGroups) return;
    try {
      window.localStorage.setItem(AFFILIATE_SIDEBAR_COLLAPSE_KEY, JSON.stringify(collapsedGroups));
    } catch {
      // noop
    }
  }, [collapsedGroups, hasLoadedCollapsedGroups]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_PANEL_ACCOUNTS_KEY);
      const currentSnapshot: SavedPanelAccount = {
        ...currentAccount,
        discordUserId: null,
        lastSeenAt: Date.now(),
      };
      const nextAccounts = mergeSavedPanelAccounts(
        currentSnapshot,
        normalizeSavedPanelAccounts(raw ? JSON.parse(raw) : []),
      );
      setSavedAccounts(nextAccounts);
      window.localStorage.setItem(SAVED_PANEL_ACCOUNTS_KEY, JSON.stringify(nextAccounts));
    } catch {
      setSavedAccounts([{ ...currentAccount, discordUserId: null, lastSeenAt: Date.now() }]);
    }
  }, [currentAccount]);

  useEffect(() => {
    return scheduleWarmBrowserRoutes(
      AFFILIATE_TABS.map((tab) => buildTabHref(tab)).concat(["/servers", "/dashboard"]),
      { router, delayMs: 80 },
    );
  }, [buildTabHref, router]);

  const matchesSearch = useCallback(
    (label: string) => {
      if (!normalizedSearch) return true;
      return label.toLowerCase().includes(normalizedSearch);
    },
    [normalizedSearch],
  );

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }));
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.replace(buildLoginHref());
    } catch {
      window.location.replace(buildLoginHref());
    }
  };

  const handleOpenHelp = () => {
    window.open("https://docs.flwdesk.com", "_blank", "noopener,noreferrer");
  };

  const handleOpenMyAccount = () => {
    router.push("/account");
  };

  const handleOpenAccountSettings = () => {
    router.push("/account/personal_data");
  };

  const handleAddAnotherAccount = () => {
    window.location.assign(buildLoginHref());
  };

  const handleSwitchSavedAccount = (account: SavedPanelAccount) => {
    if (account.authUserId === currentAccount.authUserId) return;
    window.location.assign(buildLoginHref());
  };

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
          onMouseEnter={() => warmBrowserRoute("/servers", { router, prefetchDocument: true })}
          onFocus={() => warmBrowserRoute("/servers", { router, prefetchDocument: true })}
          onClick={() => {
            setIsMobileNavOpen(false);
            router.push("/servers");
          }}
          className={fdNavItemClass()}
        >
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-[#8A8A8A] group-hover:text-[#DADADA]">
            <ChevronLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
            Central de servidores
          </span>
        </button>
      </div>

      <div className="fd-nav-scroll thin-scrollbar">
        <p className="fd-nav-label">Afiliados</p>

        {AFFILIATE_NAV_GROUPS.map((group, groupIndex) => {
          const visibleItems = group.items.filter((item) => matchesSearch(item.label));
          if (!visibleItems.length) return null;

          const groupKey = buildAffiliateGroupKey(group, groupIndex);
          const isCollapsed = collapsedGroups[groupKey] && !normalizedSearch;
          const isGroupActive = group.items.some((item) => item.id === activeTab);
          const isGroupOpen = !isCollapsed || Boolean(normalizedSearch);
          const GroupIcon = group.icon;

          return (
            <div key={groupKey} className={groupIndex > 0 ? "mt-[12px]" : ""}>
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className={fdNavGroupClass({ active: isGroupActive, open: isGroupOpen })}
              >
                <span
                  className={`inline-flex h-[22px] w-[22px] items-center justify-center ${
                    isGroupActive
                      ? "text-[#F0F0F0]"
                      : isGroupOpen
                        ? "text-[#C7C7C7]"
                        : "text-[#8A8A8A] group-hover:text-[#DADADA]"
                  }`}
                >
                  <GroupIcon className="h-[16px] w-[16px]" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] leading-none font-medium tracking-[-0.03em]">
                  {group.category}
                </span>
                <span
                  className={`transition-transform duration-200 ${
                    isGroupOpen ? "rotate-180 text-[#C9C9C9]" : "rotate-0 text-[#6F6F6F] group-hover:text-[#BEBEBE]"
                  }`}
                >
                  <ChevronDown className="h-[14px] w-[14px] shrink-0" strokeWidth={1.9} />
                </span>
              </button>

              {isGroupOpen ? (
                <div className="fd-nav-children">
                  {visibleItems.map((item) => {
                    const isActive = highlightedTab === item.id;
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => prefetchTab(item.id)}
                        onFocus={() => prefetchTab(item.id)}
                        onPointerDown={() => prefetchTab(item.id)}
                        onClick={() => navigateToTab(item.id)}
                        className={fdNavItemClass({ active: isActive })}
                      >
                        <span
                          className={`inline-flex h-[20px] w-[20px] items-center justify-center ${
                            isActive ? "text-[#F0F0F0]" : "text-[#7F7F7F] group-hover:text-[#DADADA]"
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
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  const paletteLinks: PanelQuickLink[] = AFFILIATE_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      id: item.id,
      label: item.label,
      group: group.category,
      icon: item.icon,
      onSelect: () => navigateToTab(item.id),
    })),
  );

  const showContentLoading = Boolean(latchedPendingTab) || (loading && !profile);

  return (
    <PanelShell
      className="flowdesk-affiliates-ui"
      crumb="FlowDesk"
      title="Afiliados"
      account={{
        displayName: currentAccount.displayName,
        username: currentAccount.username,
        avatarUrl: currentAccount.avatarUrl,
      }}
      savedAccounts={savedAccounts}
      links={paletteLinks}
      actions={{
        onAddAccount: handleAddAnotherAccount,
        onSwitchAccount: (account) =>
          handleSwitchSavedAccount({
            authUserId: account.authUserId ?? currentAccount.authUserId,
            discordUserId: account.discordUserId ?? null,
            displayName: account.displayName,
            username: account.username,
            avatarUrl: account.avatarUrl,
            lastSeenAt: Date.now(),
          }),
        onOpenMyAccount: handleOpenMyAccount,
        onOpenSettings: handleOpenAccountSettings,
        onOpenApiDocs: () => router.push("/account/api_keys"),
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
              <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#666666]">{meta.eyebrow}</p>
              <h1 className="mt-[10px] text-[28px] leading-[1.08] font-semibold tracking-[-0.05em] text-[#F3F3F3] md:text-[36px]">
                {meta.title}
              </h1>
              <p className="mt-[10px] max-w-[760px] text-[14px] leading-[1.6] text-[#858585]">{meta.subtitle}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-[8px]">
              {isRefreshing ? (
                <span className="inline-flex h-[34px] items-center gap-[8px] rounded-full border border-[#1C1C1C] bg-[#141414] px-[12px] text-[12px] font-medium text-[#AFAFAF]">
                  <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-[#5B8DEF]" />
                  Atualizando...
                </span>
              ) : (
                <span className="inline-flex h-[34px] items-center gap-[8px] rounded-full border border-[#1C1C1C] bg-[#141414] px-[12px] text-[12px] font-medium text-[#AFAFAF]">
                  <span className="h-[6px] w-[6px] rounded-full bg-[#0062FF]" />
                  Tempo real
                </span>
              )}
              {profile?.level ? (
                <span className="inline-flex h-[34px] items-center rounded-full border border-[#1C1C1C] bg-[#0D0D0D] px-[12px] text-[12px] font-medium capitalize text-[#C4C4C8]">
                  Nível {profile.level}
                </span>
              ) : null}
            </div>
          </div>
        </LandingReveal>

        {errorMessage && !loading ? (
          <LandingReveal delay={44} duration={220}>
            <div className="mt-[18px] flex flex-col gap-[12px] rounded-[18px] border border-[#DB4646]/35 bg-[rgba(219,70,70,0.08)] px-[18px] py-[16px] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-[10px]">
                <CircleHelp className="mt-[2px] h-[18px] w-[18px] shrink-0 text-[#DB4646]" strokeWidth={2} />
                <div>
                  <p className="text-[14px] font-medium text-[#F0A0A0]">{errorMessage}</p>
                  <p className="mt-[4px] text-[12px] text-[#B06060]">Verifique sua conexão e tente novamente.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => reload()}
                className="inline-flex h-[38px] items-center justify-center rounded-[12px] border border-[#DB4646]/30 bg-[#141414] px-[14px] text-[13px] font-medium text-[#F0A0A0] transition-colors hover:border-[#DB4646]/50"
              >
                Tentar novamente
              </button>
            </div>
          </LandingReveal>
        ) : null}

        <LandingReveal delay={52} duration={240}>
          <div className="mt-[22px]">
            <AnimatePresence mode="wait">
              {showContentLoading ? (
                <motion.div
                  key={`skeleton-${displayedTab}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <TabSkeleton tab={displayedTab} />
                </motion.div>
              ) : (
                <motion.div
                  key={enrolled && status === "active" ? displayedTab : `gate-${status}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  {status !== "active" ? (
                    <AffiliateEnrollmentGate
                      status={status}
                      statusMessage={statusMessage}
                      rules={rules}
                      onEnrolled={() => reload()}
                    />
                  ) : (
                  <AffiliateTabContent
                    tab={displayedTab}
                    profile={profile}
                    stats={stats}
                    insight={insight}
                    links={links}
                    conversions={conversions}
                    withdrawals={withdrawals}
                    ranking={ranking}
                    settings={settings}
                    rules={rules}
                    reload={reload}
                  />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </LandingReveal>
      </section>
    </PanelShell>
  );
}
