"use client";

import type { CSSProperties } from "react";
import { ModuleSettingsSkeleton, ModuleSkel } from "@/components/servers/module-ui/ModuleUi";
import type { HostingStep } from "@/lib/hosting/catalog";

const STAGGER_OPACITY = [1, 0.76, 0.58] as const;

export function HostingSkeletonBar({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`flowdesk-shimmer rounded-[12px] bg-[#171717] ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}

function HostingStepHeaderSkeleton() {
  return (
    <div className="space-y-[10px]" aria-hidden="true">
      <HostingSkeletonBar className="h-[11px] w-[88px] rounded-full bg-[#111111]" />
      <HostingSkeletonBar className="h-[28px] w-[min(360px,72vw)] max-w-full rounded-full" />
      <HostingSkeletonBar className="h-[12px] w-[min(560px,88vw)] max-w-full rounded-full bg-[#111111]" />
      <HostingSkeletonBar className="h-[12px] w-[min(420px,70vw)] max-w-full rounded-full bg-[#101010]" />
    </div>
  );
}

export function HostingStepRailSkeleton({ stepCount = 7 }: { stepCount?: number }) {
  return (
    <div
      className="flex w-full gap-[8px] overflow-x-auto rounded-[18px] border border-[#171717] bg-[#080808] p-[8px]"
      aria-hidden="true"
    >
      {Array.from({ length: stepCount }, (_, index) => (
        <HostingSkeletonBar
          key={index}
          className={`h-[38px] min-w-[88px] flex-1 rounded-[12px] ${index === 0 ? "bg-[#151515]" : "bg-[#111111]"}`}
        />
      ))}
    </div>
  );
}

function HostingSummaryAsideSkeleton() {
  return (
    <aside className="rounded-[22px] border border-[#171717] bg-[#080808] p-[18px]" aria-hidden="true">
      <HostingSkeletonBar className="h-[12px] w-[72px] rounded-full bg-[#111111]" />
      <div className="mt-[14px] space-y-[10px]">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="rounded-[14px] border border-[#151515] bg-[#0B0B0B] p-[12px]">
            <HostingSkeletonBar className="h-[10px] w-[56px] rounded-full bg-[#111111]" />
            <HostingSkeletonBar className="mt-[8px] h-[13px] w-[78%] rounded-full" />
          </div>
        ))}
      </div>
    </aside>
  );
}

export function HostingKindStepSkeleton() {
  return (
    <div className="space-y-[22px]" aria-hidden="true">
      <HostingStepHeaderSkeleton />
      <div className="grid gap-[14px] lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="min-h-[230px] rounded-[20px] border border-[#171717] bg-[#080808] p-[18px]"
            style={{
              opacity: STAGGER_OPACITY[Math.min(index, STAGGER_OPACITY.length - 1)],
              animationDelay: `${index * 36}ms`,
            }}
          >
            <div className="flex items-start justify-between gap-[16px]">
              <HostingSkeletonBar className="h-[48px] w-[48px] rounded-[14px]" />
              <HostingSkeletonBar className="h-[24px] w-[24px] rounded-full bg-[#111111]" />
            </div>
            <HostingSkeletonBar className="mt-[20px] h-[20px] w-[72%] rounded-full" />
            <HostingSkeletonBar className="mt-[10px] h-[12px] w-full rounded-full bg-[#111111]" />
            <HostingSkeletonBar className="mt-[8px] h-[12px] w-[88%] rounded-full bg-[#101010]" />
            <div className="mt-[18px] flex flex-wrap gap-[8px]">
              {Array.from({ length: 3 }, (_, chipIndex) => (
                <HostingSkeletonBar key={chipIndex} className="h-[28px] w-[74px] rounded-full bg-[#111111]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HostingGithubStepSkeleton() {
  return (
    <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]" aria-hidden="true">
      <div className="rounded-[22px] border border-[#171717] bg-[#080808] p-[22px]">
        <HostingStepHeaderSkeleton />
        <div className="mt-[24px] rounded-[18px] border border-[#1A1A1A] bg-[#0B0B0B] p-[18px]">
          <div className="flex flex-col gap-[16px] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-[14px]">
              <HostingSkeletonBar className="h-[52px] w-[52px] rounded-[16px]" />
              <div className="space-y-[8px]">
                <HostingSkeletonBar className="h-[15px] w-[180px] rounded-full" />
                <HostingSkeletonBar className="h-[12px] w-[min(320px,70vw)] max-w-full rounded-full bg-[#111111]" />
              </div>
            </div>
            <HostingSkeletonBar className="h-[44px] w-[164px] rounded-[12px] bg-[#151515]" />
          </div>
        </div>
      </div>
      <HostingSummaryAsideSkeleton />
    </div>
  );
}

export function HostingMinecraftStepSkeleton() {
  return (
    <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_390px]" aria-hidden="true">
      <div className="rounded-[22px] border border-[#171717] bg-[#080808] p-[22px]">
        <HostingStepHeaderSkeleton />
        <div className="mt-[22px] grid gap-[14px] md:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="space-y-[8px]">
              <HostingSkeletonBar className="h-[10px] w-[42%] rounded-full bg-[#111111]" />
              <HostingSkeletonBar className="h-[48px] w-full rounded-[14px] bg-[#111111]" />
            </div>
          ))}
        </div>
      </div>
      <HostingSummaryAsideSkeleton />
    </div>
  );
}

export function HostingRepositoryStepSkeleton() {
  return (
    <div className="space-y-[18px]" aria-hidden="true">
      <HostingStepHeaderSkeleton />
      <div className="grid gap-[10px] md:grid-cols-[minmax(0,1fr)_260px]">
        <HostingSkeletonBar className="h-[46px] w-full rounded-[14px] bg-[#111111]" />
        <HostingSkeletonBar className="h-[46px] w-full rounded-[14px] bg-[#111111]" />
      </div>
      <div className="overflow-hidden rounded-[20px] border border-[#171717] bg-[#080808]">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-[16px] border-b border-[#151515] px-[18px] py-[16px] last:border-b-0"
            style={{
              opacity: STAGGER_OPACITY[Math.min(index, STAGGER_OPACITY.length - 1)],
              animationDelay: `${index * 36}ms`,
            }}
          >
            <div className="flex min-w-0 items-center gap-[14px]">
              <HostingSkeletonBar className="h-[42px] w-[42px] shrink-0 rounded-[13px]" />
              <div className="min-w-0 flex-1 space-y-[8px]">
                <HostingSkeletonBar className="h-[14px] w-[min(260px,56vw)] max-w-full rounded-full" />
                <HostingSkeletonBar className="h-[11px] w-[min(180px,42vw)] max-w-full rounded-full bg-[#111111]" />
                <div className="flex flex-wrap gap-[7px]">
                  {Array.from({ length: 3 }, (_, chipIndex) => (
                    <HostingSkeletonBar key={chipIndex} className="h-[24px] w-[64px] rounded-full bg-[#111111]" />
                  ))}
                </div>
              </div>
            </div>
            <HostingSkeletonBar className="hidden h-[12px] w-[88px] rounded-full bg-[#111111] md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HostingRegionPlanStepSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-[18px]" aria-hidden="true">
      <HostingStepHeaderSkeleton />
      <div className={`grid gap-[14px] ${cards === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        {Array.from({ length: cards }, (_, index) => (
          <div
            key={index}
            className="rounded-[20px] border border-[#171717] bg-[#080808] p-[18px]"
            style={{
              opacity: STAGGER_OPACITY[Math.min(index, STAGGER_OPACITY.length - 1)],
              animationDelay: `${index * 36}ms`,
            }}
          >
            <HostingSkeletonBar className="h-[18px] w-[58%] rounded-full" />
            <HostingSkeletonBar className="mt-[10px] h-[12px] w-[82%] rounded-full bg-[#111111]" />
            <HostingSkeletonBar className="mt-[18px] h-[34px] w-[44%] rounded-full" />
            <div className="mt-[16px] space-y-[8px]">
              {Array.from({ length: 4 }, (_, lineIndex) => (
                <HostingSkeletonBar key={lineIndex} className="h-[10px] w-full rounded-full bg-[#111111]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HostingPaymentStepSkeleton() {
  return (
    <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_390px]" aria-hidden="true">
      <div className="rounded-[22px] border border-[#171717] bg-[#080808] p-[22px]">
        <HostingStepHeaderSkeleton />
        <div className="mt-[22px] grid gap-[12px] md:grid-cols-[minmax(0,360px)]">
          <HostingSkeletonBar className="h-[52px] w-full rounded-[14px] bg-[#202020]" />
        </div>
        <HostingSkeletonBar className="mt-[12px] h-[12px] w-[min(320px,72vw)] max-w-full rounded-full bg-[#111111]" />
      </div>
      <HostingSummaryAsideSkeleton />
    </div>
  );
}

export function HostingProjectsOverviewSkeleton() {
  return (
    <div className="mt-[26px] space-y-[18px] pb-[96px]" aria-hidden="true">
      <div className="flex flex-col gap-[14px] md:flex-row md:items-end md:justify-between">
        <div className="space-y-[10px]">
          <HostingSkeletonBar className="h-[11px] w-[96px] rounded-full bg-[#111111]" />
          <HostingSkeletonBar className="h-[28px] w-[min(320px,70vw)] max-w-full rounded-full" />
          <HostingSkeletonBar className="h-[12px] w-[min(460px,82vw)] max-w-full rounded-full bg-[#111111]" />
        </div>
        <HostingSkeletonBar className="h-[44px] w-[168px] rounded-[12px] bg-[#151515]" />
      </div>
      <div className="grid gap-[14px] xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <article
            key={index}
            className="rounded-[24px] border border-[#171717] bg-[#080808] p-[18px]"
            style={{
              opacity: STAGGER_OPACITY[Math.min(index, STAGGER_OPACITY.length - 1)],
              animationDelay: `${index * 36}ms`,
            }}
          >
            <div className="flex items-start justify-between gap-[14px]">
              <div className="flex min-w-0 items-start gap-[14px]">
                <HostingSkeletonBar className="h-[48px] w-[48px] rounded-full" />
                <div className="min-w-0 flex-1 space-y-[8px]">
                  <HostingSkeletonBar className="h-[16px] w-[160px] max-w-full rounded-full" />
                  <HostingSkeletonBar className="h-[12px] w-[122px] max-w-full rounded-full bg-[#111111]" />
                </div>
              </div>
              <HostingSkeletonBar className="h-[28px] w-[72px] rounded-full bg-[#111111]" />
            </div>
            <div className="mt-[18px] grid gap-[10px] sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, chipIndex) => (
                <HostingSkeletonBar key={chipIndex} className="h-[58px] rounded-[14px] bg-[#111111]" />
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function HostingOnboardingStepSkeleton({ step }: { step: HostingStep }) {
  switch (step) {
    case "kind":
      return <HostingKindStepSkeleton />;
    case "github":
      return <HostingGithubStepSkeleton />;
    case "repository":
      return <HostingRepositoryStepSkeleton />;
    case "region":
      return <HostingRegionPlanStepSkeleton cards={3} />;
    case "plan":
      return <HostingRegionPlanStepSkeleton cards={3} />;
    case "payment":
      return <HostingPaymentStepSkeleton />;
    case "ready":
      return (
        <div className="rounded-[22px] border border-[#171717] bg-[#080808] p-[28px]" aria-hidden="true">
          <div className="mx-auto flex max-w-[520px] flex-col items-center text-center">
            <HostingSkeletonBar className="h-[64px] w-[64px] rounded-[20px]" />
            <HostingSkeletonBar className="mt-[20px] h-[24px] w-[min(280px,70vw)] rounded-full" />
            <HostingSkeletonBar className="mt-[12px] h-[12px] w-full rounded-full bg-[#111111]" />
            <HostingSkeletonBar className="mt-[8px] h-[12px] w-[82%] rounded-full bg-[#101010]" />
            <HostingSkeletonBar className="mt-[24px] h-[44px] w-[180px] rounded-[12px] bg-[#151515]" />
          </div>
        </div>
      );
    default:
      return <HostingKindStepSkeleton />;
  }
}

export function HostingOnboardingShellSkeleton({ step = "kind" }: { step?: HostingStep }) {
  return (
    <div className="mt-[26px] space-y-[18px] pb-[96px] flowdesk-fade-up-soft">
      <HostingStepRailSkeleton />
      <HostingOnboardingStepSkeleton step={step} />
    </div>
  );
}

export function HostingDashboardContentSkeleton() {
  return <HostingProjectsOverviewSkeleton />;
}

export function HostingProvisioningSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] p-6 font-sans">
      <div
        className="w-full max-w-[500px] rounded-[24px] border border-[#171717] bg-[#0A0A0A] p-[38px] text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        aria-hidden="true"
      >
        <HostingSkeletonBar className="mx-auto h-[64px] w-[64px] rounded-[20px]" />
        <HostingSkeletonBar className="mx-auto mt-[24px] h-[24px] w-[min(260px,70vw)] rounded-full" />
        <HostingSkeletonBar className="mx-auto mt-[12px] h-[12px] w-full rounded-full bg-[#111111]" />
        <HostingSkeletonBar className="mx-auto mt-[8px] h-[12px] w-[88%] rounded-full bg-[#101010]" />
        <HostingSkeletonBar className="mx-auto mt-[8px] h-[12px] w-[72%] rounded-full bg-[#101010]" />
        <div className="mt-[36px] space-y-[14px]">
          <HostingSkeletonBar className="mx-auto h-[24px] w-[24px] rounded-full bg-[#151515]" />
          <HostingSkeletonBar className="mx-auto h-[11px] w-[180px] rounded-full bg-[#111111]" />
        </div>
      </div>
    </div>
  );
}

export type HostingVpsTabId =
  | "overview"
  | "metrics"
  | "console"
  | "files"
  | "deploys"
  | "env"
  | "library"
  | "installed"
  | "minecraft"
  | "domains"
  | "settings";

export function HostingVpsTabSkeleton({ tab }: { tab: HostingVpsTabId }) {
  if (tab === "metrics") {
    return (
      <section className="grid gap-[14px] lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <article key={index} className="rounded-[22px] border border-[#171717] bg-[#080808] p-[16px]">
            <div className="flex items-center justify-between">
              <div className="space-y-[10px]">
                <ModuleSkel className="h-[11px] w-[72px] rounded-full" />
                <ModuleSkel className="h-[28px] w-[104px] rounded-full" />
              </div>
              <ModuleSkel className="h-[38px] w-[38px] rounded-[14px]" />
            </div>
            <ModuleSkel className="mt-[18px] h-[42px] w-full rounded-[12px]" />
            <ModuleSkel className="mt-[10px] h-[10px] w-[126px] rounded-full" />
          </article>
        ))}
      </section>
    );
  }

  if (tab === "files") {
    return (
      <section className="grid h-[calc(100dvh-var(--fd-header-h,56px))] min-h-0 grid-cols-[300px_minmax(0,1fr)] bg-[#050505] max-md:grid-cols-1" aria-hidden="true">
        <aside className="min-h-0 border-r border-[#171717] bg-[#080808] p-[10px]">
          <ModuleSkel className="h-[38px] w-full rounded-[10px]" />
          <div className="mt-[14px] space-y-[8px]">
            {Array.from({ length: 12 }, (_, index) => (
              <ModuleSkel
                key={index}
                className={`h-[26px] rounded-[9px] ${index % 3 === 0 ? "ml-0 w-[82%]" : "ml-[18px] w-[70%]"}`}
              />
            ))}
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col bg-[#050505]">
          <div className="h-[48px] border-b border-[#171717] bg-[#080808] p-[12px]">
            <ModuleSkel className="h-[22px] w-[min(360px,60%)] rounded-full" />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)]">
            <div className="border-r border-[#111111] bg-[#070707] p-[12px]">
              <ModuleSkel className="h-full w-full rounded-[8px]" />
            </div>
            <div className="space-y-[10px] p-[12px]">
              {Array.from({ length: 16 }, (_, index) => (
                <ModuleSkel
                  key={index}
                  className={`h-[14px] rounded-full ${index % 4 === 0 ? "w-[42%]" : index % 2 === 0 ? "w-[76%]" : "w-[58%]"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (tab === "deploys") {
    return (
      <section className="h-[calc(100dvh-var(--fd-header-h,56px))] bg-[#050505] p-[16px]" aria-hidden="true">
        <ModuleSkel className="h-[26px] w-[170px] rounded-full" />
        <ModuleSkel className="mt-[10px] h-[12px] w-[min(420px,80%)] rounded-full" />
        <div className="mt-[18px] space-y-[10px]">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="rounded-[18px] border border-[#151515] bg-[#0B0B0B] p-[14px]">
              <div className="flex items-center justify-between gap-[14px]">
                <div className="min-w-0 flex-1 space-y-[10px]">
                  <ModuleSkel className="h-[24px] w-[184px] rounded-full" />
                  <ModuleSkel className="h-[14px] w-[70%] rounded-full" />
                  <ModuleSkel className="h-[11px] w-[48%] rounded-full" />
                </div>
                <ModuleSkel className="h-[34px] w-[96px] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (tab === "domains") {
    return (
      <section className="min-h-[calc(100dvh-var(--fd-header-h,56px))] bg-[#050505]" aria-hidden="true">
        <div className="flex h-[54px] items-center justify-between border-b border-[#171717] px-[14px]">
          <ModuleSkel className="h-[16px] w-[180px] rounded-full" />
          <ModuleSkel className="h-[16px] w-[88px] rounded-full" />
        </div>
        <div className="flex gap-[10px] border-b border-[#171717] p-[12px]">
          <ModuleSkel className="h-[42px] w-[42px] rounded-[10px]" />
          <ModuleSkel className="h-[42px] min-w-0 flex-1 rounded-[10px]" />
          <ModuleSkel className="h-[42px] w-[120px] rounded-[10px]" />
          <ModuleSkel className="h-[42px] w-[88px] rounded-[10px]" />
        </div>
        <div className="divide-y divide-[#171717]">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="px-[18px] py-[18px]">
              <ModuleSkel className="h-[16px] w-[min(280px,50%)] rounded-full" />
              <ModuleSkel className="mt-[8px] h-[12px] w-[160px] rounded-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (tab === "env") {
    return (
      <section className="rounded-[24px] border border-[#171717] bg-[#080808] p-[16px]" aria-hidden="true">
        <div className="flex items-center justify-between gap-[14px]">
          <div className="space-y-[10px]">
            <ModuleSkel className="h-[26px] w-[230px] rounded-full" />
            <ModuleSkel className="h-[12px] w-[min(460px,70vw)] rounded-full" />
          </div>
          <ModuleSkel className="h-[42px] w-[150px] rounded-[12px]" />
        </div>
        <div className="mt-[16px] grid gap-[8px] xl:grid-cols-[minmax(220px,1fr)_250px_250px_230px]">
          {Array.from({ length: 4 }, (_, index) => (
            <ModuleSkel key={index} className="h-[42px] rounded-[14px]" />
          ))}
        </div>
        <div className="mt-[18px] space-y-[8px]">
          {Array.from({ length: 4 }, (_, index) => (
            <ModuleSkel key={index} className="h-[86px] rounded-[16px]" />
          ))}
        </div>
      </section>
    );
  }

  if (tab === "console") {
    return (
      <section className="h-[calc(100dvh-var(--fd-header-h,56px))] bg-[#050505] p-[16px]" aria-hidden="true">
        <div className="flex items-center justify-between gap-[14px]">
          <ModuleSkel className="h-[26px] w-[180px] rounded-full" />
          <div className="flex gap-[8px]">
            <ModuleSkel className="h-[36px] w-[92px] rounded-[12px]" />
            <ModuleSkel className="h-[36px] w-[92px] rounded-[12px]" />
          </div>
        </div>
        <ModuleSkel className="mt-[16px] h-[min(520px,58vh)] w-full rounded-[18px]" />
      </section>
    );
  }

  if (tab === "overview") {
    return (
      <section className="space-y-[14px]" aria-hidden="true">
        <div className="rounded-[24px] border border-[#171717] bg-[#080808] p-[18px]">
          <div className="flex flex-col gap-[16px] lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-[10px]">
              <ModuleSkel className="h-[12px] w-[96px] rounded-full" />
              <ModuleSkel className="h-[28px] w-[min(280px,60vw)] rounded-full" />
              <ModuleSkel className="h-[12px] w-[min(420px,72vw)] rounded-full" />
            </div>
            <div className="flex flex-wrap gap-[8px]">
              {Array.from({ length: 3 }, (_, index) => (
                <ModuleSkel key={index} className="h-[40px] w-[112px] rounded-[12px]" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-[20px] border border-[#171717] bg-[#080808] p-[16px]">
              <ModuleSkel className="h-[10px] w-[72px] rounded-full" />
              <ModuleSkel className="mt-[14px] h-[22px] w-[58%] rounded-full" />
              <ModuleSkel className="mt-[12px] h-[10px] w-[72%] rounded-full" />
            </div>
          ))}
        </div>
        <div className="rounded-[24px] border border-[#171717] bg-[#080808] p-[16px]">
          <ModuleSettingsSkeleton stats={0} fields={4} />
        </div>
      </section>
    );
  }

  if (tab === "library" || tab === "installed" || tab === "minecraft") {
    return (
      <section className="rounded-[24px] border border-[#171717] bg-[#080808] p-[16px]" aria-hidden="true">
        <div className="flex flex-col gap-[12px] md:flex-row md:items-center md:justify-between">
          <ModuleSkel className="h-[26px] w-[220px] rounded-full" />
          <div className="flex gap-[8px]">
            <ModuleSkel className="h-[42px] w-[140px] rounded-[12px]" />
            <ModuleSkel className="h-[42px] w-[120px] rounded-[12px]" />
          </div>
        </div>
        <ModuleSkel className="mt-[16px] h-[42px] w-full rounded-[14px]" />
        <div className="mt-[16px] grid gap-[10px] lg:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <ModuleSkel key={index} className="h-[92px] rounded-[16px]" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-[#171717] bg-[#080808] p-[16px]" aria-hidden="true">
      <ModuleSettingsSkeleton stats={4} fields={6} />
    </section>
  );
}

export function HostingVpsShellSkeleton({ tab = "overview" }: { tab?: HostingVpsTabId }) {
  return (
    <main className="flowdesk-vps-ui min-h-screen bg-[#050505] text-[#F1F1F1]">
      <div className="flex h-screen min-h-screen overflow-hidden">
        <aside className="hidden h-screen w-[318px] shrink-0 lg:block" aria-hidden="true">
          <div className="flex h-full flex-col border-r border-[#151515] bg-[#060606] px-[14px] py-[14px]">
            <HostingSkeletonBar className="h-[54px] w-full rounded-[18px]" />
            <HostingSkeletonBar className="mt-[16px] h-[38px] w-full rounded-[12px] bg-[#111111]" />
            <div className="mt-[18px] space-y-[8px]">
              {Array.from({ length: 9 }, (_, index) => (
                <HostingSkeletonBar
                  key={index}
                  className={`h-[38px] w-full rounded-[12px] ${index === 0 ? "bg-[#151515]" : "bg-[#111111]"}`}
                />
              ))}
            </div>
            <div className="mt-auto space-y-[8px] pt-[18px]">
              {Array.from({ length: 4 }, (_, index) => (
                <HostingSkeletonBar key={index} className="h-[38px] w-full rounded-[12px] bg-[#111111]" />
              ))}
            </div>
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="flex h-[56px] items-center justify-between border-b border-[#171717] bg-[#080808] px-[18px] lg:px-[24px]"
            aria-hidden="true"
          >
            <HostingSkeletonBar className="h-[32px] w-[min(280px,50vw)] rounded-full" />
            <HostingSkeletonBar className="hidden h-[34px] w-[34px] rounded-full md:block" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-[18px] lg:p-[24px]">
            <div className="mx-auto w-full max-w-[1180px] flowdesk-fade-up-soft">
              <HostingVpsTabSkeleton tab={tab} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
