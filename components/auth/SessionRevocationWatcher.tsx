"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { buildLoginHref, getCurrentBrowserInternalPath } from "@/lib/auth/paths";

const PROTECTED_PATH_PREFIXES = [
  "/account",
  "/config",
  "/dashboard",
  "/domains",
  "/servers",
  "/vps",
] as const;

const SESSION_STATE_POLL_INTERVAL_MS = 15_000;

function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function SessionRevocationWatcher({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled || !pathname || !isProtectedPath(pathname)) {
      return;
    }

    let cancelled = false;
    let redirecting = false;
    let inFlight = false;

    async function validateSession() {
      if (cancelled || redirecting || inFlight || document.visibilityState === "hidden") {
        return;
      }

      inFlight = true;
      try {
        const response = await fetch("/api/auth/me/session-state", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status !== 401 || cancelled) {
          return;
        }

        redirecting = true;
        window.location.replace(
          buildLoginHref(getCurrentBrowserInternalPath("/dashboard")),
        );
      } catch {
        // Falhas temporarias de rede nao encerram uma sessao valida.
      } finally {
        inFlight = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void validateSession();
    }, SESSION_STATE_POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void validateSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    void validateSession();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, pathname]);

  return null;
}
