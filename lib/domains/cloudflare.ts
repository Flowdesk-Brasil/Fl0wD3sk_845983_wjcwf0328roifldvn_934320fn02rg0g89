type CloudflareEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ message?: string }>;
};

type CloudflareZone = {
  id: string;
  name: string;
  name_servers?: string[];
  status?: string;
};

function configured() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim() && process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
}

async function request<T>(path: string, init: RequestInit) {
  if (!configured()) {
    throw new Error("Cloudflare DNS nao configurada.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN!.trim()}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const envelope = (await response.json().catch(() => ({}))) as CloudflareEnvelope<T>;
    if (!response.ok || envelope.success === false || envelope.result === undefined) {
      throw new Error(
        envelope.errors?.map((item) => item.message).filter(Boolean).join("; ") ||
          `Cloudflare respondeu com HTTP ${response.status}.`,
      );
    }
    return envelope.result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Cloudflare excedeu o tempo limite.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createCloudflareZone(fqdn: string) {
  const zone = await request<CloudflareZone>("/zones", {
    method: "POST",
    body: JSON.stringify({
      name: fqdn,
      account: { id: process.env.CLOUDFLARE_ACCOUNT_ID!.trim() },
      type: "full",
      jump_start: false,
    }),
  });

  let dnssec: Record<string, unknown> | null = null;
  try {
    dnssec = await request<Record<string, unknown>>(`/zones/${zone.id}/dnssec`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
  } catch {
    dnssec = null;
  }

  return {
    zoneId: zone.id,
    nameservers: zone.name_servers || [],
    status: zone.status || "pending",
    dnssec,
  };
}

export async function getCloudflareZone(fqdn: string) {
  const zones = await request<CloudflareZone[]>(
    `/zones?name=${encodeURIComponent(fqdn)}&account.id=${encodeURIComponent(
      process.env.CLOUDFLARE_ACCOUNT_ID!.trim(),
    )}`,
    { method: "GET" },
  );
  return zones[0] || null;
}

export async function ensureCloudflareZone(fqdn: string) {
  const existing = await getCloudflareZone(fqdn);
  if (!existing) {
    const created = await createCloudflareZone(fqdn);
    if (created.nameservers.length < 2) {
      throw new Error("Cloudflare nao retornou nameservers suficientes para a zona.");
    }
    return created;
  }

  let dnssec: Record<string, unknown> | null = null;
  try {
    dnssec = await request<Record<string, unknown>>(`/zones/${existing.id}/dnssec`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
  } catch {
    dnssec = null;
  }

  const resolved = {
    zoneId: existing.id,
    nameservers: existing.name_servers || [],
    status: existing.status || "pending",
    dnssec,
  };
  if (resolved.nameservers.length < 2) {
    throw new Error("Cloudflare nao retornou nameservers suficientes para a zona.");
  }
  return resolved;
}

export async function listCloudflareDnsRecords(zoneId: string) {
  return request<Array<Record<string, unknown>>>(`/zones/${zoneId}/dns_records`, {
    method: "GET",
  });
}

export async function createCloudflareDnsRecord(
  zoneId: string,
  input: {
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
    priority?: number | null;
  },
) {
  return request<Record<string, unknown>>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: input.type,
      name: input.name,
      content: input.content,
      ttl: input.ttl || 1,
      proxied: input.proxied ?? false,
      priority: input.priority ?? undefined,
    }),
  });
}

export async function updateCloudflareDnsRecord(
  zoneId: string,
  recordId: string,
  input: {
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
    priority?: number | null;
  },
) {
  return request<Record<string, unknown>>(
    `/zones/${zoneId}/dns_records/${encodeURIComponent(recordId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: input.type,
        name: input.name,
        content: input.content,
        ttl: input.ttl || 1,
        proxied: input.proxied ?? false,
        priority: input.priority ?? undefined,
      }),
    },
  );
}

export async function deleteCloudflareDnsRecord(zoneId: string, recordId: string) {
  return request<Record<string, unknown>>(
    `/zones/${zoneId}/dns_records/${encodeURIComponent(recordId)}`,
    { method: "DELETE" },
  );
}

export function isCloudflareDnsConfigured() {
  return configured();
}
