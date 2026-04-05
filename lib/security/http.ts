import { NextResponse } from "next/server";

export function isSameOriginRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const originHeader = request.headers.get("origin");

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (originUrl.host !== requestUrl.host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (
    secFetchSite &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "same-site" &&
    secFetchSite !== "none"
  ) {
    return false;
  }

  return true;
}

export function buildContentSecurityPolicy(input?: { isDevelopment?: boolean }) {
  const isDevelopment = input?.isDevelopment === true;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://www.mercadopago.com${
      isDevelopment ? " 'unsafe-eval'" : ""
    }`,
    "connect-src 'self' https://discord.com https://api.discord.com https://api.mercadopago.com https://*.mercadopago.com https://*.mercadolibre.com",
    "frame-src 'self' https://*.mercadopago.com https://*.mercadolibre.com",
    "worker-src 'self' blob:",
    "media-src 'self' data: blob:",
    "manifest-src 'self'",
  ];

  if (!isDevelopment) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function applyStandardSecurityHeaders<T extends NextResponse>(
  response: T,
  input?: {
    contentSecurityPolicy?: string | null;
    requestId?: string | null;
    noIndex?: boolean;
  },
) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("X-Download-Options", "noopen");

  if (input?.contentSecurityPolicy) {
    response.headers.set(
      "Content-Security-Policy",
      input.contentSecurityPolicy,
    );
  }

  if (input?.requestId) {
    response.headers.set("X-Request-Id", input.requestId);
  }

  if (input?.noIndex) {
    response.headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive, nosnippet",
    );
  }

  return response;
}

export function ensureSameOriginJsonMutationRequest(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, message: "Origem da requisicao invalida." },
      { status: 403 },
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { ok: false, message: "Content-Type invalido." },
      { status: 415 },
    );
  }

  return null;
}

export function applyNoStoreHeaders<T extends NextResponse>(response: T) {
  applyStandardSecurityHeaders(response);
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
