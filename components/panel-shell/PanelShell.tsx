"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import { PanelHeader } from "@/components/panel-shell/PanelHeader";
import {
  PanelCommandPalette,
  type PanelAccountActions,
  type PanelQuickLink,
  type PanelSavedAccount,
} from "@/components/panel-shell/PanelCommandPalette";

type PanelShellProps = {
  className?: string;
  hasAlert?: boolean;
  alert?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
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
  links?: PanelQuickLink[];
  actions: PanelAccountActions;
  isPaletteOpen: boolean;
  onPaletteOpenChange: (open: boolean) => void;
  isMobileNavOpen: boolean;
  onMobileNavOpenChange: (open: boolean) => void;
};

export function PanelShell({
  className,
  hasAlert = false,
  alert,
  sidebar,
  children,
  crumb,
  title,
  account,
  savedAccounts,
  links,
  actions,
  isPaletteOpen,
  onPaletteOpenChange,
  isMobileNavOpen,
  onMobileNavOpenChange,
}: PanelShellProps) {
  useBodyScrollLock(isMobileNavOpen);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      const isPaletteShortcut =
        (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) ||
        (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.altKey);

      if (!isPaletteShortcut) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        const isEditable =
          target.isContentEditable ||
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT";
        if (isEditable && !(event.ctrlKey || event.metaKey)) return;
      }

      event.preventDefault();
      onMobileNavOpenChange(false);
      onPaletteOpenChange(true);
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [onMobileNavOpenChange, onPaletteOpenChange]);

  return (
    <div className={`fd-panel ${className || ""}`.trim()} data-has-alert={hasAlert ? "true" : "false"}>
      {alert}
      <aside className="fd-sidebar-frame hidden lg:block">{sidebar}</aside>

      <AnimatePresence>
        {isMobileNavOpen ? (
          <>
            <motion.button
              type="button"
              className="fd-drawer-backdrop lg:hidden"
              aria-label="Fechar navegacao"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              onClick={() => onMobileNavOpenChange(false)}
            />
            <motion.aside
              className="fd-drawer lg:hidden"
              initial={{ x: -24, opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {sidebar}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="fd-main-frame">
        <PanelHeader
          crumb={crumb}
          title={title}
          account={account}
          savedAccounts={savedAccounts}
          actions={actions}
          onOpenSearch={() => onPaletteOpenChange(true)}
          onOpenMobileNav={() => onMobileNavOpenChange(true)}
          isPaletteOpen={isPaletteOpen}
        />
        <div className="fd-content">
          <div className="fd-content-inner">{children}</div>
        </div>
      </div>

      <PanelCommandPalette
        open={isPaletteOpen}
        onClose={() => onPaletteOpenChange(false)}
        links={links}
      />
    </div>
  );
}
