type NextDataRequestLike = {
  headers: Pick<Headers, "get">;
  nextUrl?: {
    searchParams: Pick<URLSearchParams, "has">;
  };
};

export function isNextAppRouterDataRequest(request: NextDataRequestLike) {
  if (request.headers.get("RSC") === "1") {
    return true;
  }

  if (request.headers.get("Next-Router-Prefetch") === "1") {
    return true;
  }

  if (request.headers.get("Next-Router-State-Tree")) {
    return true;
  }

  if (request.nextUrl?.searchParams.has("_rsc")) {
    return true;
  }

  const accept = request.headers.get("accept") || "";
  return accept.includes("text/x-component");
}
