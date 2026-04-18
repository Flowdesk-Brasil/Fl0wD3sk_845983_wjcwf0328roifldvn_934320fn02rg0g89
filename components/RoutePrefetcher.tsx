"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { buildBrowserRoutingTargetFromInternalPath } from "@/lib/routing/subdomains";

export function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    ["/dashboard", "/dashboard/", "/servers", "/servers/", "/account", "/account/"].forEach(
      (href) => {
        const target = buildBrowserRoutingTargetFromInternalPath(href);
        if (target.sameOrigin) {
          router.prefetch(target.path);
        }
      },
    );
  }, [router]);

  return null;
}
