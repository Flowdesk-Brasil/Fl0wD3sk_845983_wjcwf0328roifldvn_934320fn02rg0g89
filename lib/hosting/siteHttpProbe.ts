export type SiteHttpProbe = {
  hostname: string;
  url: string;
  status: number | null;
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
  error: string | null;
};

function emptyProbe(hostname: string, url: string, error: string, started?: number): SiteHttpProbe {
  return {
    hostname,
    url,
    status: null,
    ok: false,
    latencyMs: started ? Date.now() - started : null,
    checkedAt: new Date().toISOString(),
    error,
  };
}

async function discardBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    /* ignore */
  }
}

async function fetchSite(url: string, method: "GET" | "HEAD", signal: AbortSignal) {
  return fetch(url, {
    method,
    cache: "no-store",
    redirect: "follow",
    signal,
    headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
  });
}

export async function probeSiteHttp(hostname: string, timeoutMs = 2500): Promise<SiteHttpProbe> {
  const host = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const url = host ? `https://${host}/` : "";
  if (!host) return emptyProbe("", "", "invalid-host");

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetchSite(url, "HEAD", controller.signal);
    if (response.status === 405 || response.status === 501) {
      await discardBody(response);
      response = await fetchSite(url, "GET", controller.signal);
    }
    await discardBody(response);
    return {
      hostname: host,
      url,
      status: response.status,
      ok: response.ok,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return emptyProbe(
      host,
      url,
      error instanceof Error ? (error.name === "AbortError" ? "timeout" : error.message) : "offline",
      started,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function siteHttpTone(status: number | null, ok: boolean) {
  if (status && status >= 200 && status < 400) return "ok" as const;
  if (status && status >= 400 && status < 500) return "warn" as const;
  if (status && status >= 500) return "error" as const;
  return ok ? "ok" as const : "idle" as const;
}
