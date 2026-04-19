"use client";

import { useEffect, useState } from "react";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingFrameLines } from "@/components/landing/LandingFrameLines";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingSmoothScroll } from "@/components/landing/LandingSmoothScroll";
import { TopBetaBanner } from "@/components/landing/TopBetaBanner";

type LandingAuthenticatedUser = {
  username: string;
  avatarUrl: string | null;
  href?: string;
};

type LandingRuntimeResponse = {
  ok?: boolean;
  databaseAvailable?: boolean;
  authenticatedUser?: LandingAuthenticatedUser | null;
};

export type LandingServiceState = "loading" | "ready" | "degraded";

export function LandingRuntimeShell() {
  const [serviceState, setServiceState] = useState<LandingServiceState>("loading");
  const [authenticatedUser, setAuthenticatedUser] =
    useState<LandingAuthenticatedUser | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2600);

    void (async () => {
      try {
        const response = await fetch("/api/public/landing/runtime", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | LandingRuntimeResponse
          | null;

        if (!isMounted) return;

        const databaseAvailable =
          response.ok &&
          payload?.ok === true &&
          payload.databaseAvailable === true;

        setAuthenticatedUser(
          databaseAvailable ? payload?.authenticatedUser || null : null,
        );
        setServiceState(databaseAvailable ? "ready" : "degraded");
      } catch {
        if (!isMounted) return;
        setAuthenticatedUser(null);
        setServiceState("degraded");
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#040404] text-white">
      <div className="flowdesk-page-scale-80">
        <LandingSmoothScroll />
        <TopBetaBanner />
        <LandingFrameLines />

        <LandingHeader
          authenticatedUser={authenticatedUser}
          serviceState={serviceState}
        />

        <main className="w-full pb-20">
          <LandingHero serviceState={serviceState} />
        </main>

        <LandingFooter />
      </div>
    </div>
  );
}
