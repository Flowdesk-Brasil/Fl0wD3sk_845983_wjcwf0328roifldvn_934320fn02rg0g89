export type SiteHttpProbe = {
  hostname: string;
  url: string;
  status: number | null;
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
  error: string | null;
};

export async function probeSiteHttp(hostname: string, timeoutMs = 2500): Promise<SiteHttpProbe> {
  const host = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const url = `https://${host}/`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    });
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
    return {
      hostname: host,
      url,
      status: null,
      ok: false,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.name === "AbortError" ? "timeout" : error.message : "offline",
    };
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
