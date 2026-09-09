import type { ReactNode } from "react";

export function VpsDetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-[16px] border-b border-[var(--fd-line)] py-[12px] last:border-b-0">
      <p className="text-[13px] text-[var(--fd-muted)]">{label}</p>
      <div className="max-w-[70%] text-right text-[13px] font-semibold text-[var(--fd-text)]">{value}</div>
    </div>
  );
}

export function VpsSectionCard({
  kicker,
  title,
  description,
  children,
}: {
  kicker?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-[var(--fd-line)] bg-[var(--fd-elevated)]">
      <div className="border-b border-[var(--fd-line)] px-[22px] py-[20px]">
        {kicker ? <p className="text-[12px] font-medium text-[var(--fd-muted)]">{kicker}</p> : null}
        <h2 className={`${kicker ? "mt-[6px]" : ""} text-[22px] font-semibold tracking-[-0.04em] text-[var(--fd-text)]`}>
          {title}
        </h2>
        {description ? (
          <p className="mt-[8px] max-w-[640px] text-[13px] leading-[1.55] text-[var(--fd-muted)]">{description}</p>
        ) : null}
      </div>
      <div className="px-[22px] py-[8px]">{children}</div>
    </section>
  );
}

export function VpsSegmentedNav<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-[4px] overflow-auto rounded-[16px] bg-[#141414] p-[5px]">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`shrink-0 rounded-[12px] px-[12px] py-[8px] text-[13px] font-semibold transition ${
              active
                ? "bg-[#1D1D1D] text-[#F5F5F5] shadow-[0_1px_0_rgba(255,255,255,0.04)]"
                : "text-[#8A8A8E] hover:text-[#D4D4D8]"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function VpsStatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "ok" | "warn" | "neutral";
  children: ReactNode;
}) {
  const className =
    tone === "ok"
      ? "border-[#1E3425] bg-[#07140B] text-[#9BE7AC]"
      : tone === "warn"
        ? "border-[#3B2E16] bg-[#120D04] text-[#FFD28A]"
        : "border-[var(--fd-line)] bg-[#111111] text-[var(--fd-soft)]";
  return (
    <span className={`rounded-full border px-[8px] py-[3px] text-[10px] font-bold uppercase tracking-[0.12em] ${className}`}>
      {children}
    </span>
  );
}
