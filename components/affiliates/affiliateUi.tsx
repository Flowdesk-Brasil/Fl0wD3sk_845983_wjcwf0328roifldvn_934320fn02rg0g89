"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Check, Copy, TrendingUp, type LucideIcon } from "lucide-react";
import { getLevelConfig } from "@/lib/affiliates/affiliateLevels";
import type { AffiliateLevel } from "@/lib/affiliates/affiliateTypes";
import type { AffiliateTab } from "@/components/affiliates/affiliateConfig";

export const AFF_CARD =
  "rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] transition-colors duration-200";
export const AFF_CARD_INNER = "rounded-[14px] border border-[#1C1C1C] bg-[#141414]";
export const AFF_EMPTY =
  "flex min-h-[280px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[#1C1C1C] bg-[#0D0D0D] p-[40px] text-center";
export const AFF_TABLE_WRAP = `${AFF_CARD} overflow-hidden`;
export const AFF_TABLE_HEAD = "border-b border-[#1C1C1C] bg-[#141414] text-[#737373]";
export const AFF_TABLE_ROW = "transition-colors duration-150 hover:bg-[#141414]/60";

export function SkeletonBar({
  width,
  height,
  className = "",
}: {
  width: number | string;
  height: number | string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-[8px] bg-[#1C1C1C] ${className}`}
      style={{ width, height }}
    />
  );
}

export function TabSkeleton({ tab }: { tab: AffiliateTab }) {
  if (tab === "overview") {
    return (
      <div className="space-y-[16px]">
        <SkeletonBar width="100%" height={120} className="rounded-[20px]" />
        <div className="grid gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBar key={i} width="100%" height={110} className="rounded-[20px]" />
          ))}
        </div>
        <SkeletonBar width="100%" height={160} className="rounded-[20px]" />
      </div>
    );
  }

  if (tab === "links" || tab === "commissions" || tab === "withdrawals") {
    return (
      <div className={`${AFF_TABLE_WRAP} p-0`}>
        <div className="p-[20px] border-b border-[#1C1C1C]">
          <SkeletonBar width={120} height={16} />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between p-[20px] border-b border-[#1C1C1C]/60 last:border-0"
          >
            <SkeletonBar width="15%" height={12} />
            <SkeletonBar width="20%" height={12} />
            <SkeletonBar width="15%" height={12} />
            <SkeletonBar width="15%" height={12} />
          </div>
        ))}
      </div>
    );
  }

  if (tab === "notifications") {
    return (
      <div className="space-y-[14px]">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex items-center justify-between gap-[20px] ${AFF_CARD} p-[20px]`}
          >
            <div className="min-w-0 flex-1">
              <SkeletonBar width="30%" height={14} />
              <SkeletonBar width="60%" height={12} className="mt-[6px]" />
            </div>
            <SkeletonBar width={40} height={22} className="rounded-full" />
          </div>
        ))}
        <SkeletonBar width={160} height={44} className="rounded-[14px]" />
      </div>
    );
  }

  if (tab === "ranking") {
    return (
      <div className="space-y-[14px]">
        <div className="grid gap-[12px] sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <SkeletonBar key={i} width="100%" height={180} className="rounded-[20px]" />
          ))}
        </div>
        <SkeletonBar width="100%" height={240} className="rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="grid gap-[14px] sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <SkeletonBar key={i} width="100%" height={200} className="rounded-[22px]" />
      ))}
    </div>
  );
}

export function LevelBadge({ level, size = "sm" }: { level: AffiliateLevel; size?: "sm" | "lg" }) {
  const config = getLevelConfig(level);
  const isLg = size === "lg";
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-full font-semibold ${isLg ? "px-[14px] py-[6px] text-[13px]" : "px-[9px] py-[3px] text-[11px]"}`}
      style={{
        color: config.color,
        background: config.bgColor,
        border: `1px solid ${config.borderColor}`,
      }}
    >
      <Icon className="h-[12px] w-[12px]" strokeWidth={2.2} />
      {config.label}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  trend?: string;
  delay?: number;
}) {
  return (
    <div
      className={`${AFF_CARD} p-[20px] hover:border-[#2A2A2A]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#E5E5E5]">
          <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
        </div>
        {trend ? (
          <span className="flex items-center gap-[4px] text-[12px] text-[#8B8B90]">
            <TrendingUp className="h-[11px] w-[11px]" />
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-[14px] text-[26px] font-semibold leading-none tracking-[-0.04em] text-[#F2F2F3]">
        {value}
      </p>
      <p className="mt-[6px] text-[12px] text-[#737373]">{label}</p>
      {sub ? <p className="mt-[2px] text-[11px] text-[#5A5A5A]">{sub}</p> : null}
    </div>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-[6px] rounded-[10px] border border-[#1C1C1C] bg-[#141414] px-[10px] py-[6px] text-[12px] font-medium text-[#C4C4C8] transition-all duration-150 hover:border-[#2A2A2A] hover:text-[#F2F2F3] active:scale-[0.98]"
    >
      {copied ? (
        <>
          <Check className="h-[12px] w-[12px] text-[#FFFFFF]" strokeWidth={2.5} />
          Copiado!
        </>
      ) : (
        <>
          <Copy className="h-[12px] w-[12px]" strokeWidth={1.9} />
          {label}
        </>
      )}
    </button>
  );
}

export function AffToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-200 ${enabled ? "bg-[#F2F2F3]" : "bg-[#1C1C1C]"}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full transition-transform duration-200 ${enabled ? "translate-x-[16px] bg-[#0D0D0D]" : "translate-x-0 bg-[#737373]"}`}
      />
    </button>
  );
}

export function AffEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className={AFF_EMPTY}>
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#1C1C1C] bg-[#141414] text-[#737373]">
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
      </div>
      <p className="mt-[16px] text-[15px] font-medium text-[#ECECEE]">{title}</p>
      <p className="mt-[6px] max-w-[360px] text-[13px] leading-[1.55] text-[#737373]">{description}</p>
    </div>
  );
}

export function AffPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="group relative inline-flex h-[44px] items-center justify-center overflow-visible whitespace-nowrap rounded-[14px] px-6 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="absolute inset-0 rounded-[14px] bg-[#F3F3F3] transition-transform duration-150 group-hover:scale-[1.02] group-active:scale-[0.985]" />
      <span className="relative z-10 flex items-center gap-[7px] text-[#111]">{children}</span>
    </button>
  );
}

export function AffSecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[44px] items-center justify-center rounded-[14px] border border-[#1C1C1C] bg-[#141414] px-5 text-[13px] font-medium text-[#C4C4C8] transition-all duration-150 hover:border-[#2A2A2A] hover:text-[#F2F2F3] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function AffAvatar({
  avatarUrl,
  displayName,
  size = 38,
}: {
  avatarUrl: string | null;
  displayName: string;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={displayName}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full border border-[#1C1C1C] bg-[#141414] font-semibold text-[#8AB6FF]"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

export function StatusBadge({
  tone,
  label,
}: {
  tone: "success" | "pending" | "danger";
  label: string;
}) {
  const styles = {
    success: "border-[#FFFFFF]/20 bg-[#FFFFFF]/5 text-[#F2F2F3]",
    pending: "border-[#737373]/30 bg-[#737373]/10 text-[#8B8B90]",
    danger: "border-red-900/30 bg-red-900/10 text-red-400",
  } as const;

  return (
    <span
      className={`inline-flex rounded-full border px-[8px] py-[2px] text-[10px] font-bold uppercase tracking-[0.04em] ${styles[tone]}`}
    >
      {label}
    </span>
  );
}
