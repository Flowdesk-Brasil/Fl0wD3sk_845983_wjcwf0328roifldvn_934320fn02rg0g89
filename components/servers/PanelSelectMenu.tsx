"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { panelSelectMenuScale } from "@/components/servers/panelSelectMenuScale";

type PanelSelectMenuProps<T extends string> = {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
  disabled?: boolean;
  maxVisibleItems?: number;
  placeholder?: string;
  openZIndex?: number;
};

export function panelSelectTriggerClassName(disabled?: boolean) {
  return `flowdesk-server-button flex h-[42px] w-full items-center justify-between rounded-[14px] border border-[#292929] bg-[#0D0D0D] px-[14px] text-left text-[13px] text-[#EDEDED] outline-none transition hover:border-[#444] disabled:cursor-not-allowed disabled:opacity-55${
    disabled ? "" : ""
  }`;
}

export function panelSelectMenuClassName() {
  return "flowdesk-scale-in-soft rounded-[18px] border border-[#1E1E1E] bg-[#080808] p-[8px] shadow-[0_24px_70px_rgba(0,0,0,0.48)]";
}

export function panelSelectItemClassName(selected: boolean) {
  return `flex w-full items-center justify-between rounded-[13px] px-[12px] py-[10px] text-left text-[13px] transition ${
    selected
      ? "bg-[#151515] text-[#F1F1F1]"
      : "text-[#AFAFAF] hover:bg-[#111] hover:text-white"
  }`;
}

export function PanelSelectMenu<T extends string>({
  value,
  options,
  onChange,
  disabled,
  maxVisibleItems = panelSelectMenuScale.maxVisibleOptions,
  placeholder = "Selecionar",
  openZIndex = 520,
}: PanelSelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<"down" | "up">("down");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const resolveOpenDirection = useCallback(() => {
    const bounds = menuRef.current?.getBoundingClientRect();
    if (!bounds) return "down";
    const availableBelow = window.innerHeight - bounds.bottom;
    const availableAbove = bounds.top;
    const estimatedHeight =
      Math.min(options.length, maxVisibleItems) * panelSelectMenuScale.optionHeight +
      panelSelectMenuScale.menuPadding * 2;
    return availableBelow < estimatedHeight && availableAbove > availableBelow
      ? "up"
      : "down";
  }, [maxVisibleItems, options.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selectedLabel = options.find(([option]) => option === value)?.[1] || placeholder;

  return (
    <div
      ref={menuRef}
      className={open ? "relative" : "relative z-[1]"}
      style={open ? { zIndex: openZIndex } : undefined}
    >
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          if (!open) setOpenDirection(resolveOpenDirection());
          setOpen((current) => !current);
        }}
        disabled={disabled}
        className={panelSelectTriggerClassName(disabled)}
        aria-expanded={open}
      >
        <span className="truncate pr-3">{selectedLabel}</span>
        <ChevronDown
          strokeWidth={1.9}
          className={`h-[16px] w-[16px] shrink-0 bg-transparent text-[#9A9A9A] transition ${
            open ? "rotate-180 text-[#DADADA]" : ""
          }`}
        />
      </button>
      {open ? (
        <div
          className={`${panelSelectMenuClassName()} absolute left-0 right-0 z-[520] ${
            openDirection === "up" ? "bottom-[50px]" : "top-[50px]"
          }`}
        >
          <div
            className="thin-scrollbar overflow-y-auto pr-[2px]"
            style={{ maxHeight: `${maxVisibleItems * panelSelectMenuScale.optionHeight + 10}px` }}
          >
            {options.map(([option, label]) => {
              const isSelected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={panelSelectItemClassName(isSelected)}
                >
                  <span className="truncate">{label}</span>
                  {isSelected ? <Check className="h-[15px] w-[15px] shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
