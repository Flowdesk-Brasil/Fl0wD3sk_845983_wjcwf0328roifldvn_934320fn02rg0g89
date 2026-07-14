export type VpsDomainStatus = "active" | "pending" | "error";
export type VpsDomainSource = "flowdesk_subdomain" | "custom";
export type VpsMemberRole = "owner" | "admin" | "developer" | "viewer";
export type VpsMemberStatus = "active" | "invited";
export type VpsFirewallMode = "allow" | "block";

export type VpsDomain = {
  id: string;
  hostname: string;
  status: VpsDomainStatus;
  source: VpsDomainSource;
  primary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  cloudflareRecordId?: string | null;
  dnsTarget?: string | null;
  redirectTo?: string | null;
  redirectStatus?: 301 | 302 | 307 | 308 | null;
};

export type VpsProjectMember = {
  id: string;
  email: string;
  role: VpsMemberRole;
  status: VpsMemberStatus;
  addedAt: string;
};

export type VpsFirewallRule = {
  id: string;
  value: string;
  mode: VpsFirewallMode;
  note: string | null;
  createdAt: string;
};

export type VpsProjectSettings = {
  hostName: string;
  domains: VpsDomain[];
  members: VpsProjectMember[];
  firewall: VpsFirewallRule[];
  repository: {
    connected: boolean;
    fullName: string;
    branch: string;
    htmlUrl: string | null;
    lastChangedAt: string | null;
    disconnectedAt: string | null;
  };
  security: {
    envSecretsLocked: boolean;
    internalAgentOnly: boolean;
    signedAgentRequests: boolean;
    publicIpProtected: boolean;
    twoFactorRequiredForDanger: boolean;
  };
};

export type VpsRuntimeHealth = {
  agentConnected: boolean;
  regionLabel: string;
  latencyMs: number | null;
  checkedAt: string | null;
  source: "agent" | "cached" | "catalog";
  publicIp: string | null;
  host: string | null;
};

type SettingsFallback = {
  vpsCode: string;
  repositoryName: string;
  repositoryFullName: string;
  repositoryBranch: string;
  repositoryHtmlUrl: string | null;
  ownerEmail?: string | null;
  ownerLabel?: string | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function readText(value: unknown, maxLength = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

export function createSettingsId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
}

export function slugifyHostName(value: string, fallback: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  return slug || fallback.slice(0, 12);
}

export function normalizeDomainHost(value: unknown) {
  const host = readText(value, 253)?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
    return null;
  }
  return host;
}

export function normalizeFlowdeskSubdomain(value: unknown) {
  const host = normalizeDomainHost(value);
  if (!host || !host.endsWith(".flwdesk.com")) return null;
  const label = host.slice(0, -".flwdesk.com".length);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(label)) return null;
  if (["www", "api", "admin", "account", "status", "fdesk", "mail", "smtp"].includes(label)) return null;
  return host;
}

export function defaultFlowdeskDomain(input: { hostName: string; vpsCode: string }) {
  return `${slugifyHostName(input.hostName, input.vpsCode.replace(/-/g, "").slice(0, 12))}.flwdesk.com`;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeDomain(value: unknown, fallbackDomain: string, index: number): VpsDomain | null {
  if (!isRecord(value)) return null;
  const hostname = normalizeDomainHost(value.hostname);
  if (!hostname) return null;
  const source: VpsDomainSource = hostname.endsWith(".flwdesk.com") ? "flowdesk_subdomain" : "custom";
  const status = value.status === "error" || value.status === "pending" || value.status === "active" ? value.status : "pending";
  return {
    id: readText(value.id, 80) || createSettingsId("domain"),
    hostname,
    status,
    source,
    primary: Boolean(value.primary) || (hostname === fallbackDomain && index === 0),
    createdAt: readText(value.createdAt, 40) || new Date().toISOString(),
    verifiedAt: readText(value.verifiedAt, 40),
    cloudflareRecordId: readText(value.cloudflareRecordId, 120),
    dnsTarget: readText(value.dnsTarget, 253),
    redirectTo: readText(value.redirectTo, 253),
    redirectStatus: value.redirectStatus === 301 || value.redirectStatus === 302 || value.redirectStatus === 307 || value.redirectStatus === 308
      ? value.redirectStatus
      : null,
  };
}

function normalizeMember(value: unknown): VpsProjectMember | null {
  if (!isRecord(value)) return null;
  const email = readText(value.email, 160)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const role: VpsMemberRole =
    value.role === "admin" || value.role === "developer" || value.role === "viewer" || value.role === "owner"
      ? value.role
      : "viewer";
  return {
    id: readText(value.id, 80) || createSettingsId("member"),
    email,
    role,
    status: value.status === "active" ? "active" : "invited",
    addedAt: readText(value.addedAt, 40) || new Date().toISOString(),
  };
}

function normalizeFirewall(value: unknown): VpsFirewallRule | null {
  if (!isRecord(value)) return null;
  const raw = readText(value.value, 80);
  if (!raw) return null;
  const mode: VpsFirewallMode = value.mode === "block" ? "block" : "allow";
  return {
    id: readText(value.id, 80) || createSettingsId("ip"),
    value: raw,
    mode,
    note: readText(value.note, 160),
    createdAt: readText(value.createdAt, 40) || new Date().toISOString(),
  };
}

export function resolveVpsProjectSettings(payload: unknown, fallback: SettingsFallback): VpsProjectSettings {
  const root = isRecord(payload) ? payload : {};
  const raw = isRecord(root.vpsSettings) ? root.vpsSettings : {};
  const hostName = readText(raw.hostName, 64) || fallback.repositoryName || `vps-${fallback.vpsCode.slice(0, 8)}`;
  const fallbackDomain = defaultFlowdeskDomain({ hostName, vpsCode: fallback.vpsCode });
  const domainMap = new Map<string, VpsDomain>();
  readArray(raw.domains).forEach((item, index) => {
    const domain = normalizeDomain(item, fallbackDomain, index);
    if (domain) domainMap.set(domain.hostname, domain);
  });
  const hasFlowdeskSubdomain = [...domainMap.values()].some((domain) =>
    domain.source === "flowdesk_subdomain" || domain.hostname.endsWith(".flwdesk.com"),
  );
  if (!domainMap.has(fallbackDomain) && !hasFlowdeskSubdomain) {
    domainMap.set(fallbackDomain, {
      id: createSettingsId("domain"),
      hostname: fallbackDomain,
      source: "flowdesk_subdomain",
      status: "active",
      primary: domainMap.size === 0,
      createdAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      cloudflareRecordId: null,
      dnsTarget: null,
    });
  }
  let domains = [...domainMap.values()];
  const firstFlowdeskSubdomain = domains.find((domain) =>
    domain.source === "flowdesk_subdomain" || domain.hostname.endsWith(".flwdesk.com"),
  );
  if (firstFlowdeskSubdomain) {
    domains = domains.filter((domain) =>
      !(domain.source === "flowdesk_subdomain" || domain.hostname.endsWith(".flwdesk.com")) ||
      domain.hostname === firstFlowdeskSubdomain.hostname,
    );
  }
  if (!domains.some((domain) => domain.primary)) {
    domains = domains.map((domain, index) => ({ ...domain, primary: index === 0 }));
  }

  const members = readArray(raw.members).map(normalizeMember).filter((item): item is VpsProjectMember => Boolean(item));
  if (!members.length) {
    members.push({
      id: createSettingsId("member"),
      email: fallback.ownerEmail || "owner@flowdesk.local",
      role: "owner",
      status: "active",
      addedAt: new Date().toISOString(),
    });
  }

  const repository = isRecord(raw.repository) ? raw.repository : {};
  const disconnectedAt = readText(repository.disconnectedAt, 40);
  const connected = repository.connected === false || Boolean(disconnectedAt) ? false : true;

  return {
    hostName,
    domains,
    members,
    firewall: readArray(raw.firewall).map(normalizeFirewall).filter((item): item is VpsFirewallRule => Boolean(item)),
    repository: {
      connected,
      fullName: connected ? readText(repository.fullName, 220) || fallback.repositoryFullName : fallback.repositoryFullName,
      branch: readText(repository.branch, 120) || fallback.repositoryBranch,
      htmlUrl: readText(repository.htmlUrl, 400) || fallback.repositoryHtmlUrl,
      lastChangedAt: readText(repository.lastChangedAt, 40),
      disconnectedAt,
    },
    security: {
      envSecretsLocked: true,
      internalAgentOnly: true,
      signedAgentRequests: true,
      publicIpProtected: repository.publicIpProtected !== false,
      twoFactorRequiredForDanger: true,
    },
  };
}

export function writeVpsSettingsToPayload(payload: unknown, settings: VpsProjectSettings) {
  const root = isRecord(payload) ? { ...payload } : {};
  return {
    ...root,
    vpsSettings: settings,
  };
}

export function resolveRuntimeHealth(input: {
  runtimePayload: unknown;
  regionLabel: string;
  lastSeenAt?: string | null;
}): VpsRuntimeHealth {
  const payload = isRecord(input.runtimePayload) ? input.runtimePayload : {};
  const health = isRecord(payload.agentHealth) ? payload.agentHealth : {};
  const latencyMs = typeof health.latencyMs === "number" && Number.isFinite(health.latencyMs)
    ? Math.max(1, Math.round(health.latencyMs))
    : null;
  const checkedAt = readText(health.checkedAt, 40) || input.lastSeenAt || null;
  const connected = health.connected === true || Boolean(latencyMs && checkedAt);
  return {
    agentConnected: connected,
    regionLabel: readText(health.regionLabel, 120) || input.regionLabel,
    latencyMs,
    checkedAt,
    source: connected ? "agent" : checkedAt ? "cached" : "catalog",
    publicIp: readText(health.publicIp, 80),
    host: readText(health.host, 120),
  };
}
