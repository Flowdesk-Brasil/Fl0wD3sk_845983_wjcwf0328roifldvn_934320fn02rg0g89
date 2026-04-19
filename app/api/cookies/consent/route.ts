import { NextRequest, NextResponse } from "next/server";
import { resolveCookieDomainForRequest } from "@/lib/routing/subdomains";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  buildCookieConsentPreferences,
  parseCookieConsent,
  serializeCookieConsent,
} from "@/lib/cookies/consent";
import { applyNoStoreHeaders } from "@/lib/security/http";

function buildConsentCookieOptions(request: NextRequest) {
  const domain = resolveCookieDomainForRequest(request);

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
    maxAge: COOKIE_CONSENT_MAX_AGE_SECONDS,
    priority: "low" as const,
    ...(domain ? { domain } : {}),
  };
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: "Payload JSON invalido." },
        { status: 400 },
      ),
    );
  }

  const nextConsent = buildCookieConsentPreferences({
    preferences: Boolean((rawBody as { preferences?: unknown })?.preferences),
    analytics: Boolean((rawBody as { analytics?: unknown })?.analytics),
    marketing: Boolean((rawBody as { marketing?: unknown })?.marketing),
  });

  const response = applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      consent: nextConsent,
    }),
  );

  response.cookies.set(
    COOKIE_CONSENT_COOKIE_NAME,
    serializeCookieConsent(nextConsent),
    buildConsentCookieOptions(request),
  );

  return response;
}

export async function GET(request: NextRequest) {
  const currentConsent = parseCookieConsent(
    request.cookies.get(COOKIE_CONSENT_COOKIE_NAME)?.value ?? null,
  );

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      consent: currentConsent,
    }),
  );
}
