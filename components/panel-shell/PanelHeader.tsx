"use client";

import { useEffect, useState } from "react";
import { Menu, Search } from "lucide-react";
import { PanelNotificationsMenu } from "@/components/panel-shell/PanelNotificationsMenu";
import { PanelUserMenu } from "@/components/panel-shell/PanelUserMenu";
import type {
  PanelAccountActions,
  PanelSavedAccount,
} from "@/components/panel-shell/PanelCommandPalette";

type PanelHeaderProps = {
  crumb?: string;
  title: string;
  account: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
    discordUserId?: string | null;
    email?: string | null;
  };
  savedAccounts?: PanelSavedAccount[];
  actions: PanelAccountActions;
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
  isPaletteOpen?: boolean;
};

export function PanelHeader({
  crumb,
  title,
  account,
  savedAccounts,
  actions,
  onOpenSearch,
  onOpenMobileNav,
  isPaletteOpen = false,
}: PanelHeaderProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    if (isPaletteOpen) {
      setIsUserMenuOpen(false);
      setIsNotificationsOpen(false);
    }
  }, [isPaletteOpen]);

  return (
    <header className="fd-header">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#9a9aa0] transition-colors hover:bg-[#1a1a1d] hover:text-[#f0f0f2] lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="Abrir navegacao"
        >
          <Menu className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-[13px] text-[#8b8b90]">
            {crumb ? (
              <>
                {crumb}
                <span className="mx-1.5 text-[#3a3a3e]">/</span>
                <span className="text-[#f0f0f2]">{title}</span>
              </>
            ) : (
              <span className="text-[#f0f0f2]">{title}</span>
            )}
          </p>
        </div>
      </div>

      <button type="button" className="fd-header-search" onClick={onOpenSearch}>
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-[13px]">Buscar...</span>
        <span className="fd-kbd">Ctrl K</span>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <PanelNotificationsMenu
          open={isNotificationsOpen}
          onOpenChange={(open) => {
            setIsNotificationsOpen(open);
            if (open) setIsUserMenuOpen(false);
          }}
        />
        <PanelUserMenu
          open={isUserMenuOpen}
          onOpenChange={(open) => {
            setIsUserMenuOpen(open);
            if (open) setIsNotificationsOpen(false);
          }}
          onOpenSearch={onOpenSearch}
          account={account}
          savedAccounts={savedAccounts}
          actions={actions}
        />
      </div>
    </header>
  );
}
