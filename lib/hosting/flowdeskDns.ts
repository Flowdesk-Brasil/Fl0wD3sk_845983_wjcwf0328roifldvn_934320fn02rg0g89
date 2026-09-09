import {
  createCloudflareDnsRecord,
  deleteCloudflareDnsRecord,
  getCloudflareZone,
  isCloudflareDnsConfigured,
  listCloudflareDnsRecords,
  updateCloudflareDnsRecord,
} from "@/lib/domains/cloudflare";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  createSettingsId,
  defaultFlowdeskDomain,
  slugifyHostName,
  type VpsDomain,
} from "@/lib/hosting/vpsSettings";

export const FLOWDESK_FREE_DOMAIN = "flwdesk.com";

const RESERVED_LABELS = new Set([
  "www",
  "api",
  "admin",
  "account",
  "status",
  "fdesk",
  "mail",
  "smtp",
  "app",
  "cdn",
  "agent",
  "panel",
]);

export function resolveVpsPublicDnsTarget() {
  const text = String(
    process.env.VPS_DOMAIN_CNAME_TARGET ||
      process.env.VPS_DNS_TARGET ||
      process.env.HOSTING_PUBLIC_DNS_TARGET ||
      process.env.MINECRAFT_DNS_TARGET ||
      process.env.HOSTING_MINECRAFT_DNS_TARGET ||
      "",
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return text || null;
}

function isIpTarget(value: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
}

export function isFlowdeskManagedHostname(hostname: string) {
  return hostname.toLowerCase().endsWith(`.${FLOWDESK_FREE_DOMAIN}`);
}

export function buildFlowdeskHostname(label: string) {
  return `${label}.${FLOWDESK_FREE_DOMAIN}`;
}

export function sanitizeSubdomainLabel(value: string, fallback: string) {
  return slugifyHostName(value, fallback).replace(/^www-/, "").slice(0, 48);
}

async function listManagedRecords(zoneId: string, hostname: string) {
  const records = await listCloudflareDnsRecords(zoneId);
  return records.filter((record) =>
    String(record.name || "").toLowerCase() === hostname.toLowerCase() &&
    ["CNAME", "A", "AAAA"].includes(String(record.type || "").toUpperCase()),
  );
}

export async function isFlowdeskHostnameTaken(hostname: string, excludeProjectId?: number) {
  if (!isFlowdeskManagedHostname(hostname)) return false;
  const label = hostname.slice(0, -`.${FLOWDESK_FREE_DOMAIN}`.length);
  if (RESERVED_LABELS.has(label)) return true;

  const supabase = getSupabaseAdminClientOrThrow();
  const { data: minecraftMatch } = await supabase
    .from("hosting_minecraft_servers")
    .select("hosting_project_id")
    .neq("hosting_project_id", excludeProjectId || 0)
    .or(`primary_domain.eq.${hostname},fixed_domain.eq.${hostname}`)
    .limit(1);
  if (minecraftMatch?.length) return true;

  const { data: projects } = await supabase
    .from("hosting_projects")
    .select("id, provisioning_payload")
    .not("status", "in", "(cancelled)")
    .limit(400);
  const used = (projects || []).some((project) => {
    if (excludeProjectId && project.id === excludeProjectId) return false;
    const payload = project.provisioning_payload && typeof project.provisioning_payload === "object"
      ? project.provisioning_payload as { vpsSettings?: { domains?: Array<{ hostname?: string }> } }
      : {};
    return (payload.vpsSettings?.domains || []).some((domain) => domain.hostname === hostname);
  });
  if (used) return true;

  if (!isCloudflareDnsConfigured()) return false;
  const zone = await getCloudflareZone(FLOWDESK_FREE_DOMAIN).catch(() => null);
  if (!zone?.id) return false;
  const records = await listManagedRecords(zone.id, hostname);
  return records.length > 0;
}

export async function allocateAvailableFlowdeskHostname(input: {
  preferredLabel: string;
  fallbackLabel: string;
  excludeProjectId?: number;
}) {
  const base = sanitizeSubdomainLabel(input.preferredLabel, input.fallbackLabel);
  const candidates = [
    base,
    `${base}-app`,
    `${base}-${input.fallbackLabel.slice(0, 4)}`,
    `${base}-${Date.now().toString(36).slice(-4)}`,
  ];
  for (const label of candidates) {
    const hostname = buildFlowdeskHostname(label);
    const taken = await isFlowdeskHostnameTaken(hostname, input.excludeProjectId);
    if (!taken) return hostname;
  }
  return buildFlowdeskHostname(`${input.fallbackLabel.slice(0, 10)}${Date.now().toString(36).slice(-3)}`);
}

async function upsertManagedRecord(zoneId: string, hostname: string, target: string) {
  const existingRecords = await listManagedRecords(zoneId, hostname);
  const existing = existingRecords[0] || null;
  const recordInput = {
    type: isIpTarget(target) ? "A" : "CNAME",
    name: hostname,
    content: target,
    proxied: true,
    ttl: 1,
  };
  const record = existing?.id
    ? await updateCloudflareDnsRecord(zoneId, String(existing.id), recordInput)
    : await createCloudflareDnsRecord(zoneId, recordInput);
  await Promise.all(
    existingRecords
      .slice(1)
      .map((duplicate) => deleteCloudflareDnsRecord(zoneId, String(duplicate.id || "")).catch(() => null)),
  );
  return String(record.id || existing?.id || "");
}

export async function ensureFlowdeskWildcardRecord(target = resolveVpsPublicDnsTarget()) {
  if (!target) return null;
  const zone = await getCloudflareZone(FLOWDESK_FREE_DOMAIN);
  if (!zone?.id) return null;
  const recordId = await upsertManagedRecord(zone.id, `*.${FLOWDESK_FREE_DOMAIN}`, target);
  return { recordId, target, zoneId: zone.id, hostname: `*.${FLOWDESK_FREE_DOMAIN}` };
}

export async function ensureFlowdeskSiteRecord(hostname: string, target = resolveVpsPublicDnsTarget()) {
  if (!isFlowdeskManagedHostname(hostname) && hostname !== `*.${FLOWDESK_FREE_DOMAIN}`) return null;
  if (!target) throw new Error("Alvo DNS da VPS nao configurado.");
  const zone = await getCloudflareZone(FLOWDESK_FREE_DOMAIN);
  if (!zone?.id) throw new Error("Zona Cloudflare flwdesk.com nao encontrada.");
  const recordId = await upsertManagedRecord(zone.id, hostname, target);
  await ensureFlowdeskWildcardRecord(target).catch(() => null);
  return {
    recordId,
    target,
    zoneId: zone.id,
    hostname,
  };
}

export function toManagedDomainRecord(hostname: string, extra: Partial<VpsDomain> = {}): VpsDomain {
  return {
    id: extra.id || createSettingsId("domain"),
    hostname,
    status: extra.status || "active",
    source: "flowdesk_subdomain",
    primary: extra.primary !== false,
    createdAt: extra.createdAt || new Date().toISOString(),
    verifiedAt: extra.verifiedAt || new Date().toISOString(),
    cloudflareRecordId: extra.cloudflareRecordId || null,
    dnsTarget: extra.dnsTarget || resolveVpsPublicDnsTarget(),
    redirectTo: extra.redirectTo || null,
    redirectStatus: extra.redirectStatus || null,
  };
}

export function defaultHostnameForProject(input: { hostName?: string | null; repoName?: string | null; vpsCode: string }) {
  return defaultFlowdeskDomain({
    hostName: input.hostName || input.repoName || `vps-${input.vpsCode.slice(0, 8)}`,
    vpsCode: input.vpsCode,
  });
}
