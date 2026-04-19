import { NextResponse, type NextRequest } from "next/server";
import { getRequestOrigin, resolveAuthOrigin } from "@/lib/routing/subdomains";
import { applyNoStoreHeaders } from "@/lib/security/http";

export function buildAuthOriginRedirectResponse(request: NextRequest) {
  const targetOrigin = resolveAuthOrigin(request);
  const currentOrigin = getRequestOrigin(request);

  if (!targetOrigin || targetOrigin === currentOrigin) {
    return null;
  }

  return applyNoStoreHeaders(
    NextResponse.redirect(
      new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, targetOrigin),
      302,
    ),
  );
}
