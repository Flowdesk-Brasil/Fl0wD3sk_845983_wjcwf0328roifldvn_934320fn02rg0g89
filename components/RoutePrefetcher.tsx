"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  buildBrowserRoutingTargetFromInternalPath,
  isCanonicalPublicPath,
} from "@/lib/routing/subdomains";
import { scheduleWarmBrowserRoutes } from "@/lib/routing/browserWarmup";

const ROUTE_PREFETCH_CANDIDATES = [
  "/dashboard",
  "/dashboard/",
  "/dashboard/hosting",
  "/servers",
  "/servers/",
  "/servers/plans",
  "/account",
  "/account/",
  "/account/personal_data",
  "/account/sessions",
  "/account/plans",
  "/account/payment_history",
  "/account/payment_methods",
  "/account/tickets",
  "/account/status",
] as const;

export function RoutePrefetcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (
      pathname === "/payment" ||
      pathname?.startsWith("/payment/") ||
      pathname === "/config" ||
      pathname?.startsWith("/config/")
    ) {
      return;
    }

    const sameOriginRoutes = ROUTE_PREFETCH_CANDIDATES.filter((href) => {
      const target = buildBrowserRoutingTargetFromInternalPath(href);
      const targetPathname = target.path.split("?")[0]?.split("#")[0] || target.path;
      return target.sameOrigin && !isCanonicalPublicPath(targetPathname);
    });

    if (!sameOriginRoutes.length) {
      return;
    }

    return scheduleWarmBrowserRoutes([...sameOriginRoutes], {
      router,
      delayMs: 90,
      prefetchDocument: false,
    });
  }, [pathname, router]);

  return null;
}
