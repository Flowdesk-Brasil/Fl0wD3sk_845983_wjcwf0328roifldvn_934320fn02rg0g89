export function resolveWebAuthnRpId(request: Request) {
  const configured = process.env.WEBAUTHN_RP_ID?.trim();
  if (configured) return configured;

  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === "flwdesk.com" || hostname.endsWith(".flwdesk.com")) {
    return "flwdesk.com";
  }
  return hostname;
}
