import type { NextResponse } from "next/server";
import {
  getRequestProtocol,
  resolveCookieDomainForRequest,
} from "@/lib/routing/subdomains";

type RequestLike = Pick<Request, "headers" | "url">;

type SharedAuthCookieOptions = {
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  priority?: "low" | "medium" | "high";
  sameSite?: "lax" | "strict" | "none";
};

function buildSharedCookieOptions(
  request: RequestLike,
  options: SharedAuthCookieOptions,
) {
  const domain = resolveCookieDomainForRequest(request);

  return {
    ...options,
    path: options.path || "/",
    secure: getRequestProtocol(request) === "https",
    ...(domain ? { domain } : {}),
  };
}

export function setSharedAuthCookie(
  request: RequestLike,
  response: NextResponse,
  name: string,
  value: string,
  options: SharedAuthCookieOptions,
) {
  response.cookies.set(name, value, buildSharedCookieOptions(request, options));
}

export function clearSharedAuthCookie(
  request: RequestLike,
  response: NextResponse,
  name: string,
  options: SharedAuthCookieOptions = {},
) {
  response.cookies.delete(name);
  response.cookies.set(name, "", {
    ...buildSharedCookieOptions(request, options),
    expires: new Date(0),
    maxAge: 0,
  });
}
