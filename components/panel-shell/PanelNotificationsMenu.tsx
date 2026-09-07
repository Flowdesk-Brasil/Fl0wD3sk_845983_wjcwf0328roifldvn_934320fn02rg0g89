"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, Check, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useNotificationInbox,
  type NotificationInboxItem,
  type NotificationTone,
} from "@/components/notifications/NotificationsProvider";
import { usePanelDropdownPosition } from "@/components/panel-shell/usePanelDropdownPosition";

function formatRelativeTime(createdAt: number) {
  const elapsedMs = Date.now() - createdAt;
  const minutes = Math.max(0, Math.floor(elapsedMs / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `ha ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "ha 1 hora" : `ha ${hours} horas`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days === 2) return "anteontem";
  return `ha ${days} dias`;
}

function toneIcon(tone: NotificationTone) {
  if (tone === "success") return Check;
  if (tone === "error") return AlertTriangle;
  return Info;
}

function NotificationRow({ item }: { item: NotificationInboxItem }) {
  const Icon = toneIcon(item.tone);
  return (
    <div className={`fd-notify-item${item.read ? "" : " is-unread"}`}>
      <span className={`fd-notify-icon is-${item.tone}`} aria-hidden="true">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#f0f0f2]">
          {item.title || item.message}
        </p>
        {item.title ? (
          <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-[#8b8b90]">
            {item.message}
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-[#6a6a70]">{formatRelativeTime(item.createdAt)}</p>
      </div>
    </div>
  );
}

type PanelNotificationsMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PanelNotificationsMenu({ open, onOpenChange }: PanelNotificationsMenuProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const position = usePanelDropdownPosition(open, anchorRef, 360);
  const { items, unreadCount, markAllRead } = useNotificationInbox();
  const [shouldRenderMenu, setShouldRenderMenu] = useState(open);

  useEffect(() => {
    if (open) setShouldRenderMenu(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      const target = event.target as Node | null;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
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

  const menu =
    typeof document !== "undefined" && shouldRenderMenu && position ? (
      createPortal(
        <AnimatePresence onExitComplete={() => setShouldRenderMenu(false)}>
          {open ? (
            <>
              <motion.button
                type="button"
                aria-label="Fechar notificacoes"
                className="fd-panel-dropdown-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                onClick={() => onOpenChange(false)}
              />
              <motion.div
                ref={menuRef}
                className="fd-notify-menu is-portal"
                role="dialog"
                aria-label="Notificacoes"
                style={{
                  top: position.top,
                  right: position.right,
                  width: position.width,
                }}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="fd-notify-head">
                  <div>
                    <p>Notificacoes</p>
                    {unreadCount > 0 ? (
                      <span className="mt-1 block text-[11px] font-normal text-[#8b8b90]">
                        {unreadCount} nova{unreadCount === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="mt-1 block text-[11px] font-normal text-[#6a6a70]">
                        Tudo em dia
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      className="fd-notify-mark-read"
                      onClick={() => markAllRead()}
                    >
                      Marcar lidas
                    </button>
                  ) : null}
                </div>
                <div className="fd-notify-list">
                  {items.length ? (
                    items.map((item) => <NotificationRow key={item.id} item={item} />)
                  ) : (
                    <div className="fd-notify-empty">
                      <span className="fd-notify-empty-icon" aria-hidden="true">
                        <Bell className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <p className="text-[13px] font-medium text-[#d1d1d5]">
                        Nenhuma notificacao por enquanto
                      </p>
                      <p className="mt-1 max-w-[240px] text-[12px] leading-[1.5] text-[#7d7d82]">
                        Alertas de sucesso, erro e avisos do painel aparecem aqui.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>,
        document.body,
      )
    ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`fd-header-icon${open ? " is-open" : ""}`}
        aria-label="Notificacoes"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
      >
        <Bell className="h-4 w-4" strokeWidth={1.8} />
        {unreadCount > 0 ? (
          <span className="fd-header-icon-dot">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {menu}
    </>
  );
}
