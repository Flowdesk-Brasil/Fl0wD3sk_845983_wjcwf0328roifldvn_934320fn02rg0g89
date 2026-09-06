"use client";

import { useEffect, useRef } from "react";
import {
  BookOpen,
  CircleHelp,
  Cog,
  LogOut,
  Palette,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { PanelAvatar } from "@/components/panel-shell/PanelAvatar";
import type {
  PanelAccountActions,
  PanelSavedAccount,
} from "@/components/panel-shell/PanelCommandPalette";

type PanelUserMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSearch: () => void;
  account: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
    discordUserId?: string | null;
    email?: string | null;
  };
  savedAccounts?: PanelSavedAccount[];
  actions: PanelAccountActions;
};

export function PanelUserMenu({
  open,
  onOpenChange,
  onOpenSearch,
  account,
  savedAccounts = [],
  actions,
}: PanelUserMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onOpenChange, open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`fd-header-user${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpenChange(!open)}
      >
        <PanelAvatar
          avatarUrl={account.avatarUrl}
          displayName={account.displayName}
          username={account.username}
          size={28}
        />
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[140px] truncate text-left text-[13px] font-medium text-[#f0f0f2]">
            {account.displayName}
          </span>
          <span className="block max-w-[140px] truncate text-left text-[11px] text-[#8b8b90]">
            @{account.username}
          </span>
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fd-user-menu"
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="fd-user-menu-head">
              <PanelAvatar
                avatarUrl={account.avatarUrl}
                displayName={account.displayName}
                username={account.username}
                size={40}
              />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[#f3f3f5]">{account.displayName}</p>
                <p className="mt-1 truncate text-[12px] text-[#8b8b90]">
                  {account.email || `@${account.username}`}
                </p>
              </div>
            </div>

            <p className="fd-user-menu-label">Conta</p>
            <button type="button" className="fd-user-menu-item" onClick={() => run(actions.onOpenMyAccount)}>
              <UserRound className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              Vincular Conta
            </button>
            <button type="button" className="fd-user-menu-item" onClick={() => run(actions.onOpenSettings)}>
              <Cog className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              Configuracoes
            </button>
            <button
              type="button"
              className="fd-user-menu-item"
              onClick={() =>
                run(() => {
                  if (actions.onOpenApiDocs) {
                    actions.onOpenApiDocs();
                    return;
                  }
                  window.location.assign("/account/api_keys");
                })
              }
            >
              <BookOpen className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              Documentacao da API
            </button>
            <button type="button" className="fd-user-menu-item" onClick={() => run(actions.onAddAccount)}>
              <Plus className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              Adicionar outra conta
            </button>

            {savedAccounts.length ? (
              <>
                <p className="fd-user-menu-label">Contas salvas</p>
                {savedAccounts.map((item) => {
                  const isCurrent = item.discordUserId && item.discordUserId === account.discordUserId;
                  return (
                    <button
                      key={`${item.discordUserId || item.username}`}
                      type="button"
                      className="fd-user-menu-item"
                      onClick={() => run(() => actions.onSwitchAccount(item))}
                    >
                      <PanelAvatar
                        avatarUrl={item.avatarUrl}
                        displayName={item.displayName}
                        username={item.username}
                        size={20}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.displayName}</span>
                      {isCurrent ? <span className="text-[11px] text-[#8b8b90]">ativa</span> : null}
                    </button>
                  );
                })}
              </>
            ) : null}

            <button type="button" className="fd-user-menu-item" disabled>
              <Palette className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              Personalizacao
            </button>
            <button type="button" className="fd-user-menu-item" onClick={() => run(actions.onOpenHelp)}>
              <CircleHelp className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              Ajuda
            </button>
            <button
              type="button"
              className="fd-user-menu-item"
              onClick={() => {
                onOpenChange(false);
                onOpenSearch();
              }}
            >
              <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 text-left">Busca rapida</span>
              <span className="fd-kbd">Ctrl K</span>
            </button>

            <div className="fd-user-menu-sep" />
            <button
              type="button"
              className="fd-user-menu-item is-danger"
              onClick={() => run(actions.onLogout)}
              disabled={actions.isLoggingOut}
            >
              {actions.isLoggingOut ? (
                <ButtonLoader size={16} colorClassName="text-[#d7a0a0]" />
              ) : (
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              )}
              Sair da conta
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
