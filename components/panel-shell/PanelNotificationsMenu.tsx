"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Bell, Check, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useNotificationInbox,
  type NotificationInboxItem,
  type NotificationTone,
} from "@/components/notifications/NotificationsProvider";

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
          <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-[#8b8b90]">{item.message}</p>
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { items, unreadCount, markAllRead } = useNotificationInbox();

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`fd-header-icon${open ? " is-open" : ""}`}
        aria-label="Notificacoes"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Bell className="h-4 w-4" strokeWidth={1.8} />
        {unreadCount > 0 ? <span className="fd-header-icon-dot" /> : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fd-notify-menu"
            role="dialog"
            aria-label="Notificacoes"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="fd-notify-head">
              <p>Notificacoes</p>
              {unreadCount > 0 ? <span>{unreadCount} nova(s)</span> : null}
            </div>
            <div className="fd-notify-list">
              {items.length ? (
                items.map((item) => <NotificationRow key={item.id} item={item} />)
              ) : (
                <p className="px-4 py-8 text-center text-[13px] text-[#7d7d82]">
                  Nenhuma notificacao por enquanto.
                </p>
              )}
            </div>
            <button
              type="button"
              className="fd-notify-footer"
              onClick={() => {
                markAllRead();
                onOpenChange(false);
              }}
            >
              Ver todas as notificacoes
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
