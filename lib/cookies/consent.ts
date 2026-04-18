export const COOKIE_CONSENT_COOKIE_NAME = "flowdesk_cookie_preferences";
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const DEFAULT_PRODUCTION_COOKIE_DOMAIN = "flwdesk.com";
const DEFAULT_LOCAL_COOKIE_DOMAIN = "localhost";

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

function normalizeCookieHostname(hostname: string | null | undefined) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .split(":")[0];
}

function resolveConfiguredCookieBaseDomain() {
  return normalizeCookieHostname(
    process.env.NEXT_PUBLIC_APP_COOKIE_BASE_DOMAIN ||
      process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ||
      DEFAULT_PRODUCTION_COOKIE_DOMAIN,
  );
}

function isIpHostname(hostname: string) {
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":")
  );
}

export function resolveCookieConsentDomain(hostname: string | null | undefined) {
  const normalizedHostname = normalizeCookieHostname(hostname);
  if (!normalizedHostname || isIpHostname(normalizedHostname)) {
    return null;
  }

  if (
    normalizedHostname === DEFAULT_LOCAL_COOKIE_DOMAIN ||
    normalizedHostname.endsWith(`.${DEFAULT_LOCAL_COOKIE_DOMAIN}`)
  ) {
    return DEFAULT_LOCAL_COOKIE_DOMAIN;
  }

  const configuredBaseDomain = resolveConfiguredCookieBaseDomain();
  if (
    normalizedHostname === configuredBaseDomain ||
    normalizedHostname.endsWith(`.${configuredBaseDomain}`)
  ) {
    return configuredBaseDomain;
  }

  if (
    normalizedHostname === DEFAULT_PRODUCTION_COOKIE_DOMAIN ||
    normalizedHostname.endsWith(`.${DEFAULT_PRODUCTION_COOKIE_DOMAIN}`)
  ) {
    return DEFAULT_PRODUCTION_COOKIE_DOMAIN;
  }

  return null;
}

export function buildCookieConsentDocumentCookie(
  value: CookieConsentPreferences | string,
  input?: {
    hostname?: string | null;
    secure?: boolean;
  },
) {
  const serialized =
    typeof value === "string" ? value : serializeCookieConsent(value);
  const domain = resolveCookieConsentDomain(input?.hostname);
  const domainAttribute = domain ? `; Domain=${domain}` : "";
  const secureAttribute = input?.secure ? "; Secure" : "";

  return `${COOKIE_CONSENT_COOKIE_NAME}=${serialized}; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax; Priority=Low${domainAttribute}${secureAttribute}`;
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
