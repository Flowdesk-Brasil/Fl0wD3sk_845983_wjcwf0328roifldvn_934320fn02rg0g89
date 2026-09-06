"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { configStepTwoScale } from "@/components/config/configStepTwoScale";
import { resolveConfigStepDropdownRect } from "@/components/config/configStepDropdownPosition";
import { useDiscordGuildResourcesRefreshOnMenuOpen } from "@/components/config/discordGuildResourcesRefreshContext";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import {
  panelSelectItemClassName,
  panelSelectMenuClassName,
  panelSelectTriggerClassName,
} from "@/components/servers/PanelSelectMenu";
import { panelSelectMenuScale } from "@/components/servers/panelSelectMenuScale";

type SelectOption = {
  id: string;
  name: string;
};

type ConfigStepSelectProps = {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  controlHeightPx?: number;
  variant?: "default" | "immersive" | "config";
};

export function ConfigStepSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  controlHeightPx,
  variant = "default",
}: ConfigStepSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "top" | "bottom";
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const refreshResourcesOnMenuOpen = useDiscordGuildResourcesRefreshOnMenuOpen();
  const isBlocked = disabled || loading;
  const isDropdownOpen = isOpen && !isBlocked;
  const isConfigVariant = variant === "config";
  const isImmersive = variant === "immersive";
  const shouldRenderLabel = Boolean(String(label || "").trim()) && !isImmersive;
  const scale = isConfigVariant ? configStepTwoScale : panelSelectMenuScale;
  const visibleRows = Math.min(
    Math.max(options.length, 1),
    scale.maxVisibleOptions,
  );
  const dropdownHeight =
    visibleRows * scale.optionHeight + (isConfigVariant ? 0 : panelSelectMenuScale.menuPadding * 2);

  useEffect(() => {
    if (!isDropdownOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    function syncDropdownRect() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      setDropdownRect(
        resolveConfigStepDropdownRect({
          triggerRect: rect,
          desiredHeight: dropdownHeight,
        }),
      );
    }

    syncDropdownRect();
    window.addEventListener("resize", syncDropdownRect);
    window.addEventListener("scroll", syncDropdownRect, true);

    return () => {
      window.removeEventListener("resize", syncDropdownRect);
      window.removeEventListener("scroll", syncDropdownRect, true);
    };
  }, [dropdownHeight, isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    refreshResourcesOnMenuOpen?.();
  }, [isDropdownOpen, refreshResourcesOnMenuOpen]);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) || null,
    [options, value],
  );

  const labelClassName = isImmersive
    ? "mb-[12px] text-[11px] font-medium tracking-[0.18em] uppercase text-[#6E6E6E]"
    : "mb-[8px] block text-[12px] font-medium text-[#5F5F5F]";

  const triggerClassName = isConfigVariant
    ? `fd-select-trigger flex w-full items-center text-left transition-colors disabled:cursor-not-allowed disabled:opacity-65 ${
        loading ? "justify-center" : ""
      }`
    : `${panelSelectTriggerClassName(isBlocked)} ${loading ? "justify-center" : ""}`;

  const triggerStyle = isConfigVariant
    ? {
        height: `${controlHeightPx ?? configStepTwoScale.controlHeight}px`,
        borderRadius: `${isImmersive ? 18 : 16}px`,
        paddingLeft: `${isImmersive ? 16 : 14}px`,
        paddingRight: `${isImmersive ? 14 : 12}px`,
      }
    : undefined;

  const dropdownShellClassName = isConfigVariant
    ? "fd-select-menu flowdesk-selectmenu-scrollbar flowdesk-scale-in-soft fixed z-[6200] overflow-y-auto overscroll-contain shadow-[0_24px_64px_rgba(0,0,0,0.5)] transition-all duration-200 ease-out [touch-action:pan-y]"
    : `${panelSelectMenuClassName()} flowdesk-selectmenu-scrollbar fixed z-[6200] overflow-hidden transition-all duration-200 ease-out [touch-action:pan-y]`;

  const configOptionClassName = (selected: boolean) =>
    `mx-[6px] my-[4px] flex w-[calc(100%-12px)] items-center rounded-[12px] px-[14px] text-left transition-colors ${
      selected
        ? "bg-[#141414] text-[#F2F2F3]"
        : "text-[#C4C4C8] hover:bg-[#141414] hover:text-[#F2F2F3]"
    }`;

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${isDropdownOpen ? "z-[260]" : "z-[1]"}`}
    >
      {shouldRenderLabel ? (
        <p
          className={labelClassName}
          style={
            isConfigVariant
              ? { fontSize: `${configStepTwoScale.labelSize}px` }
              : undefined
          }
        >
          {label}
        </p>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (isBlocked) return;
          setIsOpen((current) => !current);
        }}
        disabled={isBlocked}
        aria-busy={loading}
        className={triggerClassName}
        style={triggerStyle}
      >
        {loading ? (
          <ButtonLoader size={20} />
        ) : (
          <>
            <span
              className={`truncate pr-3 ${
                selectedOption
                  ? isConfigVariant
                    ? "text-[#F2F2F3]"
                    : "text-[#EDEDED]"
                  : isConfigVariant
                    ? "text-[#6F6F74]"
                    : "text-[#9A9A9A]"
              }`}
              style={
                isConfigVariant
                  ? { fontSize: `${configStepTwoScale.controlTextSize}px` }
                  : { fontSize: `${panelSelectMenuScale.controlTextSize}px` }
              }
            >
              {selectedOption ? selectedOption.name : placeholder}
            </span>

            <ChevronDown
              className={`ml-auto shrink-0 transition-transform duration-300 ease-out ${
                isConfigVariant
                  ? `h-[18px] w-[18px] text-[#8B8B8B] ${isDropdownOpen ? "rotate-180" : "rotate-0"}`
                  : `h-[16px] w-[16px] bg-transparent text-[#9A9A9A] ${isDropdownOpen ? "rotate-180 text-[#DADADA]" : ""}`
              }`}
              strokeWidth={isConfigVariant ? 2.2 : 1.9}
            />
          </>
        )}
      </button>

      {isDropdownOpen && dropdownRect
        ? createPortal(
            <div
              ref={dropdownRef}
              className={dropdownShellClassName}
              style={{
                top: `${dropdownRect.top}px`,
                left: `${dropdownRect.left}px`,
                width: `${dropdownRect.width}px`,
                maxHeight: `${dropdownRect.maxHeight}px`,
                opacity: 1,
                transform: "translateY(0)",
                transformOrigin:
                  dropdownRect.placement === "top" ? "bottom center" : "top center",
                borderRadius: isConfigVariant
                  ? `${isImmersive ? 18 : 16}px`
                  : undefined,
              }}
            >
              <div
                className={isConfigVariant ? undefined : "thin-scrollbar overflow-y-auto pr-[2px]"}
                style={
                  isConfigVariant
                    ? undefined
                    : { maxHeight: `${dropdownRect.maxHeight}px` }
                }
              >
                {options.length ? (
                  options.map((option) => {
                    const selected = value === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          onChange(option.id);
                          setIsOpen(false);
                        }}
                        className={
                          isConfigVariant
                            ? configOptionClassName(selected)
                            : panelSelectItemClassName(selected)
                        }
                        style={
                          isConfigVariant
                            ? {
                                height: `${configStepTwoScale.optionHeight}px`,
                                fontSize: `${configStepTwoScale.optionTextSize}px`,
                              }
                            : undefined
                        }
                      >
                        <span className="truncate">{option.name}</span>
                        {!isConfigVariant && selected ? (
                          <Check className="h-[15px] w-[15px] shrink-0" />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <div
                    className={`flex items-center justify-center px-4 py-[10px] text-center text-[#8A8A8A] ${
                      isConfigVariant ? "h-full" : ""
                    }`}
                    style={{
                      fontSize: `${isConfigVariant ? configStepTwoScale.optionTextSize : panelSelectMenuScale.optionTextSize}px`,
                    }}
                  >
                    Nenhuma opcao disponivel
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
