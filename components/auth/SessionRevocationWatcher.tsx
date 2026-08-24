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

const SESSION_STATE_POLL_INTERVAL_MS = 5_000;

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

    async function validateSession(options?: { force?: boolean }) {
      if (
        cancelled ||
        redirecting ||
        inFlight ||
        (!options?.force && document.visibilityState === "hidden")
      ) {
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
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ forgetTrustedDevice: false }),
          });
        } catch {
          // O redirecionamento abaixo encerra o uso da area protegida mesmo se o logout falhar.
        }
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
        void validateSession({ force: true });
      }
    };
    const handleFocus = () => void validateSession({ force: true });
    const handlePageShow = () => void validateSession({ force: true });

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleFocus);
    void validateSession({ force: true });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleFocus);
    };
  }, [enabled, pathname]);

  return null;
}
