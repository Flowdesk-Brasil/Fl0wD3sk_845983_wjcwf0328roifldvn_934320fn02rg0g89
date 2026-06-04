function normalizeBase64Url(value: string) {
  try {
    return Buffer.from(value, "base64url").toString("base64url");
  } catch {
    return null;
  }
}

export function resolveWebAuthnRpId(request: Request) {
  const configured = process.env.WEBAUTHN_RP_ID?.trim();
  if (configured) return configured;

  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === "flwdesk.com" || hostname.endsWith(".flwdesk.com")) {
    return "flwdesk.com";
  }
  return hostname;
}

export function normalizeWebAuthnCredentialId(value: string) {
  return normalizeBase64Url(value);
}
