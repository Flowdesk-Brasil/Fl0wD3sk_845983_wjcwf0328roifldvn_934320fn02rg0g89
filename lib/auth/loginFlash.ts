import { NextResponse, type NextRequest } from "next/server";
import { buildCanonicalUrlFromInternalPath } from "@/lib/routing/subdomains";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { buildLoginHref, type LoginIntentMode } from "@/lib/auth/paths";

export const LOGIN_ERROR_FLASH_COOKIE_NAME = "flowdesk_login_error_flash";
export const LOGIN_ERROR_FLASH_HEADER_NAME = "x-flowdesk-login-error-flash";

export type LoginErrorFlashPayload = {
  id: string;
  code: string;
  createdAt: number;
};

function isValidLoginErrorFlashPayload(
  value: unknown,
): value is LoginErrorFlashPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LoginErrorFlashPayload>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.code === "string" &&
    candidate.code.length > 0 &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt)
  );
}

export function encodeLoginErrorFlashPayload(
  payload: LoginErrorFlashPayload,
) {
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeLoginErrorFlashPayload(
  value: string | null | undefined,
) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    return isValidLoginErrorFlashPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createLoginErrorFlashPayload(code: string): LoginErrorFlashPayload {
  return {
    id: crypto.randomUUID(),
    code,
    createdAt: Date.now(),
  };
}

export function buildLoginRedirectLocation(
  request: NextRequest,
  input: {
    nextPath?: string | null;
    mode?: LoginIntentMode;
  } = {},
) {
  const loginPath = buildLoginHref(input.nextPath, input.mode ?? "login");
  return buildCanonicalUrlFromInternalPath(request, loginPath, {
    fallbackArea: "account",
  });
}

export function setLoginErrorFlashCookie(
  response: NextResponse,
  code: string,
) {
  response.cookies.set(
    LOGIN_ERROR_FLASH_COOKIE_NAME,
    encodeLoginErrorFlashPayload(createLoginErrorFlashPayload(code)),
    {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60,
      priority: "high",
    },
  );
}

export function buildLoginRedirectResponse(
  request: NextRequest,
  input: {
    nextPath?: string | null;
    mode?: LoginIntentMode;
    error?: string | null;
    status?: number;
  } = {},
) {
  const response = applyNoStoreHeaders(
    new NextResponse(null, {
      status: input.status ?? 302,
      headers: {
        Location: buildLoginRedirectLocation(request, input),
      },
    }),
  );

  if (input.error) {
    setLoginErrorFlashCookie(response, input.error);
  }

  return response;
}
