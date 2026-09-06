"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

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

export function ModuleHero({
  label,
  title,
  description,
  icon: Icon,
  action,
  delay = 0,
}: {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay, ease: moduleEase }}
      className={`${MODULE_CARD_CLASS} hover:border-[#2A2A2E]`}
    >
      <div className="flex items-start justify-between gap-[16px]">
        <div className="flex min-w-0 items-start gap-[14px]">
          <span className="mt-[2px] flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#C4C4C8]">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#8B8B90]">{label}</p>
            <h2 className="mt-[8px] text-[22px] leading-[1.15] font-semibold tracking-[-0.04em] text-[#F2F2F3] md:text-[26px]">
              {title}
            </h2>
            <p className="mt-[8px] max-w-[720px] text-[13px] leading-[1.6] text-[#8B8B90] md:text-[14px]">
              {description}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0 pt-[2px]">{action}</div> : null}
      </div>
    </motion.div>
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
