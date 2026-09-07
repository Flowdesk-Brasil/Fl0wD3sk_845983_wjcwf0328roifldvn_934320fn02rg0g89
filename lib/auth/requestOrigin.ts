import { NextResponse, type NextRequest } from "next/server";
import { getRequestOrigin, resolveAuthOrigin } from "@/lib/routing/subdomains";
import { applyNoStoreHeaders } from "@/lib/security/http";

function isLoopbackOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function buildAuthOriginRedirectResponse(request: NextRequest) {
  const targetOrigin = resolveAuthOrigin(request);
  const currentOrigin = getRequestOrigin(request);

  if (!targetOrigin || targetOrigin === currentOrigin) {
    return null;
  }

  // 127.0.0.1 e localhost viram Location relativa e o login entra em loop.
  if (isLoopbackOrigin(targetOrigin) && isLoopbackOrigin(currentOrigin)) {
    return null;
  }

  return applyNoStoreHeaders(
    NextResponse.redirect(
      new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, targetOrigin),
      302,
    ),
  );
}
