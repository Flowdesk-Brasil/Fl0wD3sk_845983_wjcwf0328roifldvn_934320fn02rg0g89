"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ChevronDown, Power, RotateCcw } from "lucide-react";
import type { ServerEditorModuleActions } from "@/lib/servers/serverEditorChrome";

export const moduleEase = [0.22, 1, 0.36, 1] as const;

export const MODULE_CARD_CLASS =
  "rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[16px] transition-colors";

type NamedOption = {
  id: string;
  name: string;
};

export function optionLabel(
  options: NamedOption[],
  value: string | null | undefined,
  empty = "Nao definido",
) {
  if (!value) return empty;
  return options.find((option) => option.id === value)?.name || empty;
}

export function optionLabels(
  options: NamedOption[],
  values: string[],
  empty = "Nenhum selecionado",
) {
  if (!values.length) return empty;
  if (values.length === 1) return optionLabel(options, values[0], empty);
  return `${values.length} selecionados`;
}

export function ModulePage({ children }: { children: ReactNode }) {
  return <div className="space-y-[14px]">{children}</div>;
}

export function ModuleActionsMenu({
  actions,
}: {
  actions: ServerEditorModuleActions;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const toggleLabel = actions.enabled ? "Desativar módulo" : "Ativar módulo";

  return (
    <div ref={menuRef} className={open ? "relative z-[620]" : "relative shrink-0"}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={actions.disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-[42px] items-center gap-[8px] rounded-[14px] border border-[#1C1C1C] bg-[#141414] px-[14px] text-[14px] font-medium text-[#E8E8EA] transition-colors hover:border-[#2A2A2E] hover:bg-[#171717] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Ações
        <ChevronDown
          className={`h-[16px] w-[16px] text-[#8B8B90] transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="flowdesk-scale-in-soft absolute right-0 top-[calc(100%+8px)] z-[620] min-w-[220px] overflow-hidden rounded-[16px] border border-[#242424] bg-[#0A0A0A] p-[6px] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              actions.onToggle();
              setOpen(false);
            }}
            disabled={actions.disabled}
            className="flex w-full items-center gap-[10px] rounded-[10px] px-[12px] py-[10px] text-left text-[13px] text-[#E4E4E7] transition-colors hover:bg-[#141414] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Power className="h-[15px] w-[15px] text-[#9A9AA0]" strokeWidth={1.9} />
            {toggleLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (!actions.canReset) return;
              actions.onReset();
              setOpen(false);
            }}
            disabled={actions.disabled || !actions.canReset}
            className="flex w-full items-center gap-[10px] rounded-[10px] px-[12px] py-[10px] text-left text-[13px] transition-colors hover:bg-[#141414] disabled:cursor-not-allowed disabled:text-[#55555A] disabled:hover:bg-transparent text-[#C8C8CC]"
          >
            <RotateCcw className="h-[15px] w-[15px] text-[#9A9AA0]" strokeWidth={1.9} />
            Resetar módulo
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ModuleStat({
  label,
  value,
  hint,
  icon: Icon,
  delay = 0,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: moduleEase }}
      className={`${MODULE_CARD_CLASS} hover:border-[#2A2A2E] hover:bg-[#111111]`}
    >
      <div className="flex items-start justify-between gap-[12px]">
        <p className="text-[12px] font-medium text-[#8B8B90]">{label}</p>
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#C4C4C8]">
          <Icon className="h-[16px] w-[16px]" strokeWidth={1.85} />
        </span>
      </div>
      <p className="mt-[14px] truncate text-[22px] leading-none font-semibold tracking-[-0.04em] text-[#F2F2F3]">
        {value}
      </p>
      <p className="mt-[10px] text-[12px] text-[#6F6F74]">{hint}</p>
    </motion.div>
  );
}

export function ModuleCard({
  label,
  title,
  description,
  action,
  children,
  delay = 0.08,
}: {
  label?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.44, delay, ease: moduleEase }}
      className={MODULE_CARD_CLASS}
    >
      <div className="flex flex-col gap-[12px] lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {label ? (
            <p className="text-[12px] font-medium text-[#8B8B90]">{label}</p>
          ) : null}
          <h3 className={`${label ? "mt-[10px]" : ""} text-[18px] font-semibold tracking-[-0.03em] text-[#F2F2F3]`}>
            {title}
          </h3>
          {description ? (
            <p className="mt-[8px] max-w-[720px] text-[13px] leading-[1.6] text-[#8B8B90]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children ? <div className="mt-[16px]">{children}</div> : null}
    </motion.section>
  );
}

export const MODULE_FIELDS_GRID_CLASS =
  "grid grid-cols-1 gap-[16px] xl:grid-cols-2";

export function ModuleFieldsGrid({ children }: { children: ReactNode }) {
  return <div className={MODULE_FIELDS_GRID_CLASS}>{children}</div>;
}

export function ModuleSetting({
  label,
  value,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className={`${MODULE_CARD_CLASS} bg-[#0B0B0B]`}>
      <div className="flex items-start justify-between gap-[12px]">
        <p className="text-[12px] font-medium text-[#8B8B90]">{label}</p>
        {Icon ? (
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-[#1C1C1C] bg-[#141414] text-[#C4C4C8]">
            <Icon className="h-[14px] w-[14px]" strokeWidth={1.85} />
          </span>
        ) : (
          <ArrowUpRight className="h-[14px] w-[14px] text-[#5A5A5E]" strokeWidth={2} />
        )}
      </div>
      <p className="mt-[12px] truncate text-[18px] leading-none font-semibold tracking-[-0.03em] text-[#F2F2F3]">
        {value}
      </p>
      {hint ? <p className="mt-[8px] text-[12px] text-[#6F6F74]">{hint}</p> : null}
      <div className="mt-[14px]">{children}</div>
    </div>
  );
}

export function ModuleSkel({
  className,
}: {
  className: string;
}) {
  return <div className={`flowdesk-shimmer bg-[#171717] ${className}`.trim()} />;
}

export function ModuleSettingsSkeleton({
  stats = 4,
  fields = 4,
}: {
  stats?: number;
  fields?: number;
}) {
  return (
    <div className="space-y-[18px]" aria-hidden="true">
      <div className="space-y-[10px]">
        <ModuleSkel className="h-[12px] w-[88px] rounded-full" />
        <ModuleSkel className="h-[28px] w-[min(320px,70vw)] max-w-full rounded-full" />
        <ModuleSkel className="h-[12px] w-[min(520px,82vw)] max-w-full rounded-full" />
      </div>
      <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: stats }, (_, index) => (
          <div key={index} className="space-y-[12px]">
            <ModuleSkel className="h-[10px] w-[72px] rounded-full" />
            <ModuleSkel className="h-[22px] w-[58%] rounded-full" />
            <ModuleSkel className="h-[10px] w-[46%] rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-[16px] xl:grid-cols-2">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-[10px]">
            <ModuleSkel className="h-[10px] w-[40%] rounded-full" />
            <ModuleSkel className="h-[48px] w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
