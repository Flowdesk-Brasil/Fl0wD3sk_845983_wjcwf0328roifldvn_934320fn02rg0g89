export const COOKIE_CONSENT_COOKIE_NAME = "flowdesk_cookie_preferences";
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type CookieConsentPreferences = {
  version: number;
  essential: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

export const REQUIRED_ONLY_COOKIE_CONSENT: CookieConsentPreferences = {
  version: COOKIE_CONSENT_VERSION,
  essential: true,
  preferences: false,
  analytics: false,
  marketing: false,
  updatedAt: "",
};

export function buildCookieConsentPreferences(
  input?: Partial<CookieConsentPreferences>,
): CookieConsentPreferences {
  return {
    version: COOKIE_CONSENT_VERSION,
    essential: true,
    preferences: input?.preferences ?? REQUIRED_ONLY_COOKIE_CONSENT.preferences,
    analytics: input?.analytics ?? REQUIRED_ONLY_COOKIE_CONSENT.analytics,
    marketing: input?.marketing ?? REQUIRED_ONLY_COOKIE_CONSENT.marketing,
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
  };
}

export function parseCookieConsent(
  rawValue?: string | null,
): CookieConsentPreferences | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<CookieConsentPreferences>;

    if (parsed.version !== COOKIE_CONSENT_VERSION || parsed.essential !== true) {
      return null;
    }

    return buildCookieConsentPreferences({
      preferences: Boolean(parsed.preferences),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim().length > 0
          ? parsed.updatedAt
          : undefined,
    });
  } catch {
    return null;
  }
}

export function serializeCookieConsent(
  value: CookieConsentPreferences,
): string {
  return encodeURIComponent(JSON.stringify(value));
}

export function readCookieValue(
  cookieString: string,
  cookieName: string,
): string | null {
  const prefix = `${cookieName}=`;

  for (const segment of cookieString.split(";")) {
    const trimmed = segment.trim();

    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }

  return null;
}
