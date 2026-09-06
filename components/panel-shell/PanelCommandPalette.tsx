"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

export type PanelSavedAccount = {
  authUserId?: number;
  discordUserId: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

export type PanelQuickLink = {
  id: string;
  label: string;
  description?: string;
  group?: string;
  icon?: LucideIcon;
  onSelect: () => void;
};

export type PanelAccountActions = {
  onAddAccount: () => void;
  onSwitchAccount: (account: PanelSavedAccount) => void;
  onOpenMyAccount: () => void;
  onOpenSettings: () => void;
  onOpenApiDocs?: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
  isLoggingOut?: boolean;
};

type PanelCommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  links?: PanelQuickLink[];
};

export function PanelCommandPalette({
  open,
  onClose,
  links = [],
}: PanelCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useBodyScrollLock(open);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleLinks = useMemo(() => {
    if (!normalizedQuery) return links;
    return links.filter((link) =>
      `${link.group || ""} ${link.label} ${link.description || ""}`.toLowerCase().includes(normalizedQuery),
    );
  }, [links, normalizedQuery]);

  const groupedLinks = useMemo(() => {
    const groups: Array<{ name: string; items: PanelQuickLink[] }> = [];
    for (const link of visibleLinks) {
      const name = link.group || "Ir para";
      const current = groups[groups.length - 1];
      if (current && current.name === name) {
        current.items.push(link);
      } else {
        groups.push({ name, items: [link] });
      }
    }
    return groups;
  }, [visibleLinks]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, Math.max(visibleLinks.length - 1, 0)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        visibleLinks[activeIndex]?.onSelect();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeIndex, onClose, open, visibleLinks]);

  let rowIndex = -1;
  const nextIndex = () => {
    rowIndex += 1;
    return rowIndex;
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fd-palette-root" role="dialog" aria-modal="true" aria-label="Busca rapida">
          <motion.button
            type="button"
            className="fd-palette-backdrop"
            aria-label="Fechar busca"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={onClose}
          />
          <motion.div
            className="fd-palette-panel"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="fd-palette-input-row">
              <Search className="h-4 w-4 shrink-0 text-[#8b8b90]" strokeWidth={1.8} />
              <input
                ref={inputRef}
                className="fd-palette-input"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Buscar pagina, modulo ou categoria..."
                autoComplete="off"
              />
              <span className="fd-kbd">ESC</span>
            </div>

            <div className="fd-palette-list">
              {groupedLinks.length ? (
                groupedLinks.map((group) => (
                  <div key={group.name}>
                    <p className="fd-palette-group">{group.name}</p>
                    {group.items.map((link) => {
                      const index = nextIndex();
                      const Icon = link.icon;
                      return (
                        <button
                          key={link.id}
                          type="button"
                          className={`fd-palette-item${index === activeIndex ? " is-active" : ""}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={link.onSelect}
                        >
                          {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} /> : null}
                          <span className="min-w-0 flex-1 truncate">{link.label}</span>
                          {link.description && link.description !== group.name ? (
                            <span className="hidden max-w-[46%] truncate text-[12px] text-[#7d7d82] sm:block">
                              {link.description}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <p className="px-3 py-8 text-center text-[13px] text-[#7d7d82]">
                  Nenhuma pagina encontrada.
                </p>
              )}
            </div>

            <div className="fd-palette-footer">
              <span>↑↓ navegar · Enter abrir</span>
              <span>FlowDesk</span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
