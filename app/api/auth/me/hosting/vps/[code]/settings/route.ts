import { NextRequest, NextResponse } from "next/server";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  appendVpsEvent,
  getHostingProjectForUser,
  normalizeVpsCode,
  requestVpsAgent,
} from "@/lib/hosting/vpsRuntime";
import {
  createSettingsId,
  defaultFlowdeskDomain,
  normalizeDomainHost,
  normalizeFlowdeskSubdomain,
  readText,
  resolveVpsProjectSettings,
  writeVpsSettingsToPayload,
  type VpsDomain,
  type VpsFirewallMode,
  type VpsMemberRole,
  type VpsProjectSettings,
} from "@/lib/hosting/vpsSettings";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  createCloudflareDnsRecord,
  deleteCloudflareDnsRecord,
  getCloudflareZone,
  listCloudflareDnsRecords,
  updateCloudflareDnsRecord,
} from "@/lib/domains/cloudflare";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

type RouteProps = {
  params: Promise<{ code: string }>;
};

const SETTINGS_ACTIONS = [
  "hostname",
  "add_domain",
  "update_domain",
  "remove_domain",
  "refresh_domain",
  "primary_domain",
  "add_member",
  "remove_member",
  "member_role",
  "add_firewall",
  "remove_firewall",
  "repository_remove",
  "repository_update",
] as const;

type RepositoryInput = {
  owner: string;
  name: string;
  id: string | null;
  branch: string;
  fullName: string;
  description: string | null;
  language: string | null;
  htmlUrl: string;
  private: boolean | null;
};

type SettingsPatchBody = {
  action: (typeof SETTINGS_ACTIONS)[number];
  hostName?: string;
  hostname?: string;
  id?: string;
  email?: string;
  role?: VpsMemberRole;
  value?: string;
  mode?: VpsFirewallMode;
  note?: string;
  redirectTo?: string | null;
  redirectStatus?: number | null;
  repository?: unknown;
};

const FLOWDESK_FREE_DOMAIN = "flwdesk.com";
const MINECRAFT_DOMAIN_SUFFIX = "mine.flwdesk.com";
const MINECRAFT_RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "account",
  "status",
  "fdesk",
  "mail",
  "smtp",
  "minecraft",
  "mine",
  "play",
  "server",
]);

function normalizeDnsTarget(value: unknown) {
  const text = readText(value, 253)?.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return text || "www.flwdesk.com";
}

function resolveDefaultVpsDnsTarget() {
  return normalizeDnsTarget(
    process.env.VPS_DOMAIN_CNAME_TARGET ||
      process.env.VPS_DNS_TARGET ||
      process.env.HOSTING_PUBLIC_DNS_TARGET ||
      process.env.MINECRAFT_DNS_TARGET ||
      process.env.APP_PUBLIC_HOST ||
      process.env.NEXT_PUBLIC_APP_URL,
  );
}

function resolveManagedDnsRecordInput(hostname: string, target: string) {
  const isIpTarget = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(target);
  return {
    type: isIpTarget ? "A" : "CNAME",
    name: hostname,
    content: target,
    proxied: isIpTarget ? false : true,
    ttl: 1,
  };
}

function isFlowdeskManagedDomain(hostname: string) {
  return hostname.endsWith(`.${FLOWDESK_FREE_DOMAIN}`);
}

function isMinecraftProjectKind(loaded: NonNullable<Awaited<ReturnType<typeof load>>>) {
  return loaded.project.hosting_kind === "minecraft";
}

function isMinecraftManagedDomain(hostname: string) {
  return hostname.endsWith(`.${MINECRAFT_DOMAIN_SUFFIX}`);
}

function normalizeMinecraftDomainLabel(value: unknown) {
  const raw = readText(value, 253)
    ?.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (!raw) return null;
  const suffix = `.${MINECRAFT_DOMAIN_SUFFIX}`;
  const label = raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw;
  if (label.includes(".") || label.includes("*")) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(label)) return null;
  if (MINECRAFT_RESERVED_SUBDOMAINS.has(label)) return null;
  return label;
}

function normalizeRequestedDomainHost(value: unknown, minecraftProject: boolean) {
  if (!minecraftProject) return normalizeDomainHost(value);
  const label = normalizeMinecraftDomainLabel(value);
  return label ? `${label}.${MINECRAFT_DOMAIN_SUFFIX}` : null;
}

function isFlowdeskManagedSettingsDomain(domain: VpsDomain) {
  return domain.source === "flowdesk_subdomain" || isFlowdeskManagedDomain(domain.hostname);
}

function isProjectManagedSettingsDomain(domain: VpsDomain, minecraftProject: boolean) {
  if (!minecraftProject) return isFlowdeskManagedSettingsDomain(domain);
  return domain.source === "flowdesk_subdomain" && isMinecraftManagedDomain(domain.hostname);
}

function normalizePrimaryDomainState(domains: VpsDomain[]) {
  if (!domains.length) return domains;
  if (domains.some((domain) => domain.primary)) return domains;
  return domains.map((domain, index) => ({ ...domain, primary: index === 0 }));
}

async function findFlowdeskRecord(zoneId: string, hostname: string) {
  const records = await listCloudflareDnsRecords(zoneId);
  return records.find((record) =>
    String(record.name || "").toLowerCase() === hostname &&
    ["CNAME", "A", "AAAA"].includes(String(record.type || "").toUpperCase())
  ) || null;
}

async function findFlowdeskRecords(zoneId: string, hostname: string) {
  const records = await listCloudflareDnsRecords(zoneId);
  return records.filter((record) =>
    String(record.name || "").toLowerCase() === hostname &&
    ["CNAME", "A", "AAAA"].includes(String(record.type || "").toUpperCase())
  );
}

function minecraftSrvName(hostname: string) {
  return `_minecraft._tcp.${hostname}`;
}

async function findFlowdeskSrvRecord(zoneId: string, hostname: string) {
  const records = await listCloudflareDnsRecords(zoneId);
  const srvName = minecraftSrvName(hostname).toLowerCase();
  return records.find((record) =>
    String(record.name || "").toLowerCase() === srvName &&
    String(record.type || "").toUpperCase() === "SRV"
  ) || null;
}

async function findFlowdeskSrvRecords(zoneId: string, hostname: string) {
  const records = await listCloudflareDnsRecords(zoneId);
  const srvName = minecraftSrvName(hostname).toLowerCase();
  return records.filter((record) =>
    String(record.name || "").toLowerCase() === srvName &&
    String(record.type || "").toUpperCase() === "SRV"
  );
}

async function ensureMinecraftSrvRecord(zoneId: string, hostname: string, port = 25565) {
  const recordInput = {
    type: "SRV",
    name: minecraftSrvName(hostname),
    content: hostname,
    ttl: 1,
    proxied: false,
    priority: 0,
    data: {
      service: "_minecraft",
      proto: "_tcp",
      name: hostname,
      priority: 0,
      weight: 0,
      port,
      target: hostname,
    },
  };
  const existing = await findFlowdeskSrvRecord(zoneId, hostname);
  const record = existing?.id
    ? await updateCloudflareDnsRecord(zoneId, String(existing.id), recordInput)
    : await createCloudflareDnsRecord(zoneId, recordInput);
  return { srvRecordId: String(record.id || existing?.id || "") };
}

async function ensureFlowdeskDnsRecord(
  hostname: string,
  target: string,
  options: { minecraft?: boolean; minecraftPort?: number } = {},
) {
  if (!isFlowdeskManagedDomain(hostname)) return null;
  const zone = await getCloudflareZone(FLOWDESK_FREE_DOMAIN);
  if (!zone?.id) throw new Error("Zona Cloudflare flwdesk.com nao encontrada.");
  const existingRecords = await findFlowdeskRecords(zone.id, hostname);
  const existing = existingRecords[0] || null;
  const recordInput = resolveManagedDnsRecordInput(hostname, target);
  const record = existing?.id
    ? await updateCloudflareDnsRecord(zone.id, String(existing.id), recordInput)
    : await createCloudflareDnsRecord(zone.id, recordInput);
  await Promise.all(
    existingRecords
      .slice(1)
      .map((duplicate) => deleteCloudflareDnsRecord(zone.id, String(duplicate.id || "")).catch(() => null)),
  );
  const srv = options.minecraft ? await ensureMinecraftSrvRecord(zone.id, hostname, options.minecraftPort || 25565) : null;
  return { recordId: String(record.id || existing?.id || ""), target, zoneId: zone.id, srvRecordId: srv?.srvRecordId || null };
}

async function deleteFlowdeskDnsRecord(input: { hostname: string; recordId?: string | null; minecraft?: boolean }) {
  if (!isFlowdeskManagedDomain(input.hostname)) return;
  const zone = await getCloudflareZone(FLOWDESK_FREE_DOMAIN);
  if (!zone?.id) return;
  const records = await findFlowdeskRecords(zone.id, input.hostname);
  const recordIds = new Set([
    input.recordId || "",
    ...records.map((record) => String(record.id || "")),
  ].filter(Boolean));
  await Promise.all([...recordIds].map((recordId) => deleteCloudflareDnsRecord(zone.id, recordId).catch(() => null)));
  if (input.minecraft) {
    const srvRecords = await findFlowdeskSrvRecords(zone.id, input.hostname);
    await Promise.all(srvRecords.map((record) => deleteCloudflareDnsRecord(zone.id, String(record.id || "")).catch(() => null)));
  }
}

async function deleteFlowdeskSettingsDomainRecord(domain: VpsDomain, minecraftProject = false) {
  if (!isFlowdeskManagedSettingsDomain(domain)) return;
  await deleteFlowdeskDnsRecord({
    hostname: domain.hostname,
    recordId: domain.cloudflareRecordId,
    minecraft: minecraftProject && isMinecraftManagedDomain(domain.hostname),
  }).catch(() => null);
}

async function load(code: string) {
  const session = await getCurrentAuthSessionFromCookie();
  const vpsCode = normalizeVpsCode(code);
  if (!session || !vpsCode) return null;
  const project = await getHostingProjectForUser({ userId: session.user.id, vpsCode });
  return project ? { session, project, vpsCode } : null;
}

function projectFallback(loaded: NonNullable<Awaited<ReturnType<typeof load>>>) {
  return {
    vpsCode: loaded.project.vps_code,
    repositoryName: loaded.project.github_repo || `vps-${loaded.project.vps_code.slice(0, 8)}`,
    repositoryFullName: loaded.project.github_owner && loaded.project.github_repo
      ? `${loaded.project.github_owner}/${loaded.project.github_repo}`
      : "Repository disconnected",
    repositoryBranch: loaded.project.github_branch || "main",
    repositoryHtmlUrl: loaded.project.github_owner && loaded.project.github_repo
      ? `https://github.com/${loaded.project.github_owner}/${loaded.project.github_repo}`
      : null,
    ownerEmail: loaded.session.user.email || loaded.session.user.username || null,
  };
}

function normalizeRepositoryInput(value: unknown): RepositoryInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const owner = readText(source.owner, 80);
  const name = readText(source.name, 120);
  if (!owner || !name) return null;
  return {
    owner,
    name,
    id: readText(source.id, 100),
    branch: readText(source.branch, 120) || "main",
    fullName: readText(source.fullName, 220) || `${owner}/${name}`,
    description: readText(source.description, 400),
    language: readText(source.language, 80),
    htmlUrl: readText(source.htmlUrl, 400) || `https://github.com/${owner}/${name}`,
    private: typeof source.private === "boolean" ? source.private : null,
  };
}

function normalizeRole(value: unknown): VpsMemberRole {
  return value === "admin" || value === "developer" || value === "viewer" ? value : "viewer";
}

function normalizeFirewallMode(value: unknown): VpsFirewallMode {
  return value === "block" ? "block" : "allow";
}

function isValidIpRule(value: string) {
  return (
    /^(\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[1-2][0-9]|3[0-2]))?$/.test(value) ||
    /^[a-f0-9:]+(?:\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8]))?$/i.test(value)
  );
}

async function assertDomainAvailable(hostname: string, currentProjectId: number) {
  const supabase = getSupabaseAdminClientOrThrow();
  const { data: minecraftMatch, error: minecraftError } = await supabase
    .from("hosting_minecraft_servers")
    .select("hosting_project_id, primary_domain, fixed_domain")
    .neq("hosting_project_id", currentProjectId)
    .or(`primary_domain.eq.${hostname},fixed_domain.eq.${hostname}`)
    .limit(1);
  if (minecraftError && !/schema cache|does not exist/i.test(minecraftError.message)) {
    throw new Error(minecraftError.message);
  }
  if (minecraftMatch?.length) {
    throw new Error("Este subdominio Minecraft ja esta em uso.");
  }

  const { data, error } = await supabase
    .from("hosting_projects")
    .select("id, vps_code")
    .neq("id", currentProjectId)
    .not("status", "in", "(cancelled)")
    .contains("provisioning_payload", {
      vpsSettings: {
        domains: [{ hostname }],
      },
    })
    .limit(1);
  if (error && !/json|operator|schema cache|does not exist/i.test(error.message)) {
    throw new Error(error.message);
  }
  if (data?.length) {
    throw new Error("Este dominio ja esta em uso em outro projeto.");
  }
}

async function readMinecraftServerPort(projectId: number) {
  const supabase = getSupabaseAdminClientOrThrow();
  const { data } = await supabase
    .from("hosting_minecraft_servers")
    .select("server_port")
    .eq("hosting_project_id", projectId)
    .maybeSingle<{ server_port: number | null }>();
  return data?.server_port || 25565;
}

async function persistSettings(
  loaded: NonNullable<Awaited<ReturnType<typeof load>>>,
  settings: VpsProjectSettings,
  extraProjectUpdate: Record<string, unknown> = {},
) {
  const payload = writeVpsSettingsToPayload(loaded.project.provisioning_payload, settings);
  const supabase = getSupabaseAdminClientOrThrow();
  const { data, error } = await supabase
    .from("hosting_projects")
    .update({
      provisioning_payload: payload,
      ...extraProjectUpdate,
    })
    .eq("id", loaded.project.id)
    .select("github_owner, github_repo, github_repo_id, github_branch, provisioning_payload")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function appendSettingsEvent(
  loaded: NonNullable<Awaited<ReturnType<typeof load>>>,
  message: string,
  requestPayload?: unknown,
) {
  await appendVpsEvent({
    projectId: loaded.project.id,
    userId: loaded.session.user.id,
    action: "sync",
    status: "succeeded",
    message,
    requestPayload,
  }).catch(() => null);
}

async function syncMinecraftDomainState(
  loaded: NonNullable<Awaited<ReturnType<typeof load>>>,
  settings: VpsProjectSettings,
) {
  if (!isMinecraftProjectKind(loaded)) return;
  const primaryDomain = settings.domains.find((domain) => isMinecraftManagedDomain(domain.hostname))?.hostname;
  const label = primaryDomain ? normalizeMinecraftDomainLabel(primaryDomain) : null;
  if (primaryDomain && !label) return;

  const supabase = getSupabaseAdminClientOrThrow();
  const { data: server } = await supabase
    .from("hosting_minecraft_servers")
    .select("id, server_name, minecraft_version, server_type, fixed_domain, limits, server_port, rcon_port")
    .eq("hosting_project_id", loaded.project.id)
    .maybeSingle<{
      id: number;
      server_name: string;
      minecraft_version: string;
      server_type: string;
      fixed_domain: string | null;
      limits: Record<string, unknown> | null;
      server_port: number | null;
      rcon_port: number | null;
    }>();
  if (!server?.id) return;

  if (!primaryDomain || !label) {
    await supabase
      .from("hosting_minecraft_servers")
      .update({
        primary_domain: null,
        cloudflare_status: "removed",
        cloudflare_payload: {
          managed: true,
          status: "removed",
          source: "settings",
          updatedAt: new Date().toISOString(),
        },
      })
      .eq("id", server.id);
    return;
  }

  const { data: worlds } = await supabase
    .from("hosting_minecraft_worlds")
    .select("world_name, world_slug")
    .eq("minecraft_server_id", server.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const firstWorld = Array.isArray(worlds) ? worlds[0] as { world_name?: string; world_slug?: string } | undefined : undefined;

  await supabase
    .from("hosting_minecraft_servers")
    .update({
      server_slug: label,
      primary_domain: primaryDomain,
      cloudflare_status: "active",
      cloudflare_payload: {
        managed: true,
        status: "active",
        source: "settings",
        primary: primaryDomain,
        updatedAt: new Date().toISOString(),
      },
    })
    .eq("id", server.id);

  await requestVpsAgent({
    project: loaded.project,
    method: "POST",
    path: "/v1/minecraft/servers",
    body: {
      projectCode: loaded.project.vps_code,
      server: {
        serverName: server.server_name,
        serverType: server.server_type,
        version: server.minecraft_version,
        subdomain: label,
        firstWorldName: firstWorld?.world_name || firstWorld?.world_slug || "world",
        serverPort: server.server_port || 25565,
        rconPort: server.rcon_port || 30000,
      },
      limits: server.limits || {},
    },
    timeoutMs: 30_000,
  }).catch(() => null);
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }
  const settings = resolveVpsProjectSettings(loaded.project.provisioning_payload, projectFallback(loaded));
  return applyNoStoreHeaders(NextResponse.json({ ok: true, settings }));
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }

  try {
    const body = parseFlowSecureDto<SettingsPatchBody>(
      await request.json().catch(() => ({})),
      {
        action: flowSecureDto.enum(SETTINGS_ACTIONS),
        hostName: flowSecureDto.optional(flowSecureDto.string({ maxLength: 64, normalizeWhitespace: true })),
        hostname: flowSecureDto.optional(flowSecureDto.string({ maxLength: 253, rejectThreatPatterns: false })),
        id: flowSecureDto.optional(flowSecureDto.string({ maxLength: 100, rejectThreatPatterns: false })),
        email: flowSecureDto.optional(flowSecureDto.email()),
        role: flowSecureDto.optional(flowSecureDto.enum(["owner", "admin", "developer", "viewer"] as const)),
        value: flowSecureDto.optional(flowSecureDto.string({ maxLength: 80, rejectThreatPatterns: false })),
        mode: flowSecureDto.optional(flowSecureDto.enum(["allow", "block"] as const)),
        note: flowSecureDto.optional(flowSecureDto.string({ maxLength: 160, normalizeWhitespace: true })),
        redirectTo: flowSecureDto.optional(flowSecureDto.nullable(flowSecureDto.string({ maxLength: 253, rejectThreatPatterns: false }))),
        redirectStatus: flowSecureDto.optional(flowSecureDto.nullable(flowSecureDto.number({ min: 301, max: 308 }))),
        repository: flowSecureDto.optional(flowSecureDto.unknown()),
      },
      { rejectUnknown: true },
    );
    const action = body.action;
    let settings = resolveVpsProjectSettings(loaded.project.provisioning_payload, projectFallback(loaded));
    const minecraftProject = isMinecraftProjectKind(loaded);
    let extraUpdate: Record<string, unknown> = {};
    let message = "Settings atualizadas.";

    if (action === "hostname") {
      const hostName = readText(body.hostName, 64);
      if (!hostName || hostName.length < 2) throw new Error("Nome do host invalido.");
      const previousDefault = defaultFlowdeskDomain({ hostName: settings.hostName, vpsCode: loaded.project.vps_code });
      const nextDefault = defaultFlowdeskDomain({ hostName, vpsCode: loaded.project.vps_code });
      settings = {
        ...settings,
        hostName,
        domains: settings.domains.map((domain) =>
          domain.hostname === previousDefault
            ? { ...domain, hostname: nextDefault, source: "flowdesk_subdomain", status: "active", verifiedAt: domain.verifiedAt || new Date().toISOString() }
            : domain,
        ),
      };
      message = "Nome do host atualizado.";
    } else if (action === "add_domain") {
      const requested = normalizeRequestedDomainHost(body.hostname, minecraftProject);
      if (!requested) throw new Error("Dominio invalido.");
      const flowdeskHost = requested.endsWith(".flwdesk.com")
        ? (minecraftProject ? requested : normalizeFlowdeskSubdomain(requested))
        : null;
      if (requested.endsWith(".flwdesk.com") && !flowdeskHost) {
        throw new Error(minecraftProject
          ? "Use somente o primeiro nome do servidor, sem ponto. O .mine.flwdesk.com e automatico."
          : "Subdominio flwdesk.com indisponivel ou reservado.");
      }
      await assertDomainAvailable(requested, loaded.project.id);
      const requestedIsFreeFlowdeskDomain = isFlowdeskManagedDomain(requested);
      if (
        settings.domains.some((domain) => domain.hostname === requested) &&
        !requestedIsFreeFlowdeskDomain
      ) {
        throw new Error("Este dominio ja esta neste projeto.");
      }
      const domain: VpsDomain = {
        id: createSettingsId("domain"),
        hostname: requested,
        source: requested.endsWith(".flwdesk.com") ? "flowdesk_subdomain" : "custom",
        status: requested.endsWith(".flwdesk.com") ? "active" : "pending",
        primary: settings.domains.length === 0,
        createdAt: new Date().toISOString(),
        verifiedAt: requested.endsWith(".flwdesk.com") ? new Date().toISOString() : null,
        redirectTo: minecraftProject ? null : normalizeDomainHost(body.redirectTo),
        redirectStatus: !minecraftProject && (body.redirectStatus === 301 || body.redirectStatus === 302 || body.redirectStatus === 307 || body.redirectStatus === 308)
          ? body.redirectStatus
          : null,
      };
      if (isFlowdeskManagedDomain(requested)) {
        const existingFreeDomains = settings.domains.filter((domain) =>
          isProjectManagedSettingsDomain(domain, minecraftProject)
        );
        for (const existingDomain of existingFreeDomains) {
          if (existingDomain.hostname !== requested) {
            await deleteFlowdeskSettingsDomainRecord(existingDomain, minecraftProject);
          }
        }
        const dnsTarget = minecraftProject
          ? normalizeDnsTarget(process.env.MINECRAFT_DNS_TARGET || process.env.HOSTING_MINECRAFT_DNS_TARGET)
          : resolveDefaultVpsDnsTarget();
        const minecraftPort = minecraftProject ? await readMinecraftServerPort(loaded.project.id) : undefined;
        const dns = await ensureFlowdeskDnsRecord(requested, dnsTarget, { minecraft: minecraftProject, minecraftPort });
        const previousFreeDomain = existingFreeDomains[0] || null;
        if (previousFreeDomain) {
          domain.id = previousFreeDomain.id;
          domain.primary = previousFreeDomain.primary;
          domain.createdAt = previousFreeDomain.createdAt || domain.createdAt;
        }
        domain.cloudflareRecordId = dns?.recordId || null;
        domain.dnsTarget = dnsTarget;
        domain.status = "active";
        domain.verifiedAt = new Date().toISOString();
        settings = {
          ...settings,
          domains: normalizePrimaryDomainState([
            ...settings.domains.filter((item) => !isProjectManagedSettingsDomain(item, minecraftProject)),
            domain,
          ]),
        };
        message = previousFreeDomain
          ? (minecraftProject ? "Subdominio Minecraft atualizado." : "Subdominio gratuito atualizado.")
          : "Dominio adicionado.";
      } else {
        settings = { ...settings, domains: normalizePrimaryDomainState([...settings.domains, domain]) };
        message = "Dominio adicionado.";
      }
    } else if (action === "remove_domain") {
      const hostname = normalizeDomainHost(body.hostname);
      if (!hostname) throw new Error("Dominio invalido.");
      const removing = settings.domains.find((domain) => domain.hostname === hostname);
      const remaining = settings.domains.filter((domain) => domain.hostname !== hostname);
      if (!remaining.length && !minecraftProject) throw new Error("Mantenha ao menos um dominio no projeto.");
      if (removing && isFlowdeskManagedDomain(removing.hostname)) {
        await deleteFlowdeskDnsRecord({
          hostname: removing.hostname,
          recordId: removing.cloudflareRecordId,
          minecraft: minecraftProject && isMinecraftManagedDomain(removing.hostname),
        }).catch((error) => {
          throw new Error(error instanceof Error ? error.message : "Nao foi possivel remover o registro Cloudflare.");
        });
      }
      settings = {
        ...settings,
        domains: remaining.some((domain) => domain.primary)
          ? remaining
          : remaining.map((domain, index) => ({ ...domain, primary: index === 0 })),
      };
      message = "Dominio removido.";
    } else if (action === "update_domain") {
      const previousHostname = normalizeDomainHost(body.id);
      const requested = normalizeRequestedDomainHost(body.hostname, minecraftProject);
      if (!previousHostname || !requested) throw new Error("Dominio invalido.");
      const currentDomain = settings.domains.find((domain) => domain.hostname === previousHostname);
      if (!currentDomain) throw new Error("Dominio nao encontrado.");
      if (requested !== previousHostname) {
        const flowdeskHost = requested.endsWith(".flwdesk.com")
          ? (minecraftProject ? requested : normalizeFlowdeskSubdomain(requested))
          : null;
        if (requested.endsWith(".flwdesk.com") && !flowdeskHost) {
          throw new Error(minecraftProject
            ? "Use somente o primeiro nome do servidor, sem ponto. O .mine.flwdesk.com e automatico."
            : "Subdominio flwdesk.com indisponivel ou reservado.");
        }
        await assertDomainAvailable(requested, loaded.project.id);
        if (settings.domains.some((domain) => domain.hostname === requested)) {
          throw new Error("Este dominio ja esta neste projeto.");
        }
      }
      let nextDomain: VpsDomain = {
        ...currentDomain,
        hostname: requested,
        source: requested.endsWith(".flwdesk.com") ? "flowdesk_subdomain" : "custom",
        status: requested.endsWith(".flwdesk.com") ? "active" : "pending",
        verifiedAt: requested.endsWith(".flwdesk.com") ? new Date().toISOString() : null,
        redirectTo: minecraftProject ? null : normalizeDomainHost(body.redirectTo),
        redirectStatus: !minecraftProject && (body.redirectStatus === 301 || body.redirectStatus === 302 || body.redirectStatus === 307 || body.redirectStatus === 308)
          ? body.redirectStatus
          : null,
      };
      if (currentDomain.hostname !== requested && currentDomain.source === "flowdesk_subdomain") {
        await deleteFlowdeskDnsRecord({
          hostname: currentDomain.hostname,
          recordId: currentDomain.cloudflareRecordId,
          minecraft: minecraftProject && isMinecraftManagedDomain(currentDomain.hostname),
        }).catch(() => null);
      }
      if (isFlowdeskManagedDomain(requested)) {
        for (const domain of settings.domains) {
          if (domain.hostname !== previousHostname && isProjectManagedSettingsDomain(domain, minecraftProject)) {
            await deleteFlowdeskSettingsDomainRecord(domain, minecraftProject);
          }
        }
        const dnsTarget = minecraftProject
          ? normalizeDnsTarget(process.env.MINECRAFT_DNS_TARGET || process.env.HOSTING_MINECRAFT_DNS_TARGET)
          : nextDomain.dnsTarget
            ? normalizeDnsTarget(nextDomain.dnsTarget)
            : resolveDefaultVpsDnsTarget();
        const minecraftPort = minecraftProject ? await readMinecraftServerPort(loaded.project.id) : undefined;
        const dns = await ensureFlowdeskDnsRecord(requested, dnsTarget, { minecraft: minecraftProject, minecraftPort });
        nextDomain = {
          ...nextDomain,
          status: "active",
          verifiedAt: new Date().toISOString(),
          cloudflareRecordId: dns?.recordId || nextDomain.cloudflareRecordId || null,
          dnsTarget,
        };
        settings = {
          ...settings,
          domains: normalizePrimaryDomainState([
            nextDomain,
            ...settings.domains.filter((domain) =>
              domain.hostname !== previousHostname &&
              !isProjectManagedSettingsDomain(domain, minecraftProject),
            ),
          ]),
        };
      } else {
        nextDomain = {
          ...nextDomain,
          cloudflareRecordId: null,
          dnsTarget: null,
        };
        settings = {
          ...settings,
          domains: normalizePrimaryDomainState(settings.domains.map((domain) =>
            domain.hostname === previousHostname ? nextDomain : domain,
          )),
        };
      }
      message = "Dominio atualizado.";
    } else if (action === "refresh_domain") {
      const hostname = normalizeDomainHost(body.hostname);
      if (!hostname) throw new Error("Dominio invalido.");
      const domain = settings.domains.find((item) => item.hostname === hostname);
      if (!domain) throw new Error("Dominio nao encontrado.");
      if (domain.source === "flowdesk_subdomain") {
        const dnsTarget = minecraftProject && isMinecraftManagedDomain(domain.hostname)
          ? normalizeDnsTarget(process.env.MINECRAFT_DNS_TARGET || process.env.HOSTING_MINECRAFT_DNS_TARGET)
          : domain.dnsTarget
            ? normalizeDnsTarget(domain.dnsTarget)
            : resolveDefaultVpsDnsTarget();
        const minecraftPort = minecraftProject ? await readMinecraftServerPort(loaded.project.id) : undefined;
        const dns = await ensureFlowdeskDnsRecord(domain.hostname, dnsTarget, {
          minecraft: minecraftProject && isMinecraftManagedDomain(domain.hostname),
          minecraftPort,
        });
        settings = {
          ...settings,
          domains: settings.domains.map((item) =>
            item.hostname === hostname
              ? {
                ...item,
                status: "active",
                verifiedAt: new Date().toISOString(),
                cloudflareRecordId: dns?.recordId || item.cloudflareRecordId || null,
                dnsTarget,
              }
              : item,
          ),
        };
      } else {
        settings = {
          ...settings,
          domains: settings.domains.map((item) =>
            item.hostname === hostname
              ? { ...item, status: item.status === "active" ? "active" : "pending" }
              : item,
          ),
        };
      }
      message = "Dominio revalidado.";
    } else if (action === "primary_domain") {
      const hostname = normalizeDomainHost(body.hostname);
      if (!hostname || !settings.domains.some((domain) => domain.hostname === hostname)) {
        throw new Error("Dominio nao encontrado.");
      }
      settings = {
        ...settings,
        domains: settings.domains.map((domain) => ({ ...domain, primary: domain.hostname === hostname })),
      };
      message = "Dominio principal atualizado.";
    } else if (action === "add_member") {
      const email = readText(body.email, 160)?.toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email invalido.");
      if (settings.members.some((member) => member.email === email)) throw new Error("Membro ja adicionado.");
      settings = {
        ...settings,
        members: [
          ...settings.members,
          {
            id: createSettingsId("member"),
            email,
            role: normalizeRole(body.role),
            status: "invited",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      message = "Membro convidado.";
    } else if (action === "remove_member") {
      const id = readText(body.id, 80);
      if (!id) throw new Error("Membro invalido.");
      const target = settings.members.find((member) => member.id === id);
      if (target?.role === "owner") throw new Error("O owner nao pode ser removido por esta tela.");
      settings = { ...settings, members: settings.members.filter((member) => member.id !== id) };
      message = "Membro removido.";
    } else if (action === "member_role") {
      const id = readText(body.id, 80);
      if (!id) throw new Error("Membro invalido.");
      settings = {
        ...settings,
        members: settings.members.map((member) =>
          member.id === id && member.role !== "owner" ? { ...member, role: normalizeRole(body.role) } : member,
        ),
      };
      message = "Permissao do membro atualizada.";
    } else if (action === "add_firewall") {
      const value = readText(body.value, 80);
      if (!value || !isValidIpRule(value)) throw new Error("IP ou CIDR invalido.");
      if (settings.firewall.some((rule) => rule.value === value)) throw new Error("Regra de IP ja cadastrada.");
      settings = {
        ...settings,
        firewall: [
          ...settings.firewall,
          {
            id: createSettingsId("ip"),
            value,
            mode: normalizeFirewallMode(body.mode),
            note: readText(body.note, 160),
            createdAt: new Date().toISOString(),
          },
        ],
      };
      message = "Regra de rede adicionada.";
    } else if (action === "remove_firewall") {
      const id = readText(body.id, 80);
      if (!id) throw new Error("Regra invalida.");
      settings = { ...settings, firewall: settings.firewall.filter((rule) => rule.id !== id) };
      message = "Regra de rede removida.";
    } else if (action === "repository_remove") {
      settings = {
        ...settings,
        repository: {
          ...settings.repository,
          connected: false,
          disconnectedAt: new Date().toISOString(),
          lastChangedAt: new Date().toISOString(),
        },
      };
      message = "Repositorio desconectado do projeto.";
    } else if (action === "repository_update") {
      const repository = normalizeRepositoryInput(body.repository);
      if (!repository) throw new Error("Repositorio invalido.");
      const supabase = getSupabaseAdminClientOrThrow();
      const duplicate = await supabase
        .from("hosting_projects")
        .select("vps_code")
        .eq("user_id", loaded.session.user.id)
        .neq("id", loaded.project.id)
        .not("status", "in", "(cancelled)")
        .or([
          repository.id ? `github_repo_id.eq.${repository.id}` : "",
          `and(github_owner.eq.${repository.owner},github_repo.eq.${repository.name})`,
        ].filter(Boolean).join(","))
        .maybeSingle<{ vps_code: string }>();
      if (duplicate.error) throw new Error(duplicate.error.message);
      if (duplicate.data?.vps_code) {
        throw new Error(`Este repositorio ja esta vinculado a VPS ${duplicate.data.vps_code}.`);
      }
      settings = {
        ...settings,
        repository: {
          connected: true,
          fullName: repository.fullName,
          branch: repository.branch,
          htmlUrl: repository.htmlUrl,
          disconnectedAt: null,
          lastChangedAt: new Date().toISOString(),
        },
      };
      extraUpdate = {
        github_owner: repository.owner,
        github_repo: repository.name,
        github_repo_id: repository.id,
        github_branch: repository.branch,
      };
      const payloadRoot = loaded.project.provisioning_payload && typeof loaded.project.provisioning_payload === "object"
        ? loaded.project.provisioning_payload as Record<string, unknown>
        : {};
      loaded.project.provisioning_payload = {
        ...payloadRoot,
        repository,
      };
      message = "Repositorio conectado ao projeto.";
    } else {
      throw new Error("Acao de settings invalida.");
    }

    const updated = await persistSettings(loaded, settings, extraUpdate);
    if (
      minecraftProject &&
      ["add_domain", "update_domain", "remove_domain", "refresh_domain", "primary_domain"].includes(action)
    ) {
      await syncMinecraftDomainState(loaded, settings);
    }
    const nextSettings = resolveVpsProjectSettings(updated.provisioning_payload, {
      ...projectFallback(loaded),
      repositoryName: String(updated.github_repo || loaded.project.github_repo || ""),
      repositoryFullName: updated.github_owner && updated.github_repo
        ? `${updated.github_owner}/${updated.github_repo}`
        : projectFallback(loaded).repositoryFullName,
      repositoryBranch: String(updated.github_branch || loaded.project.github_branch || "main"),
      repositoryHtmlUrl: updated.github_owner && updated.github_repo
        ? `https://github.com/${updated.github_owner}/${updated.github_repo}`
        : projectFallback(loaded).repositoryHtmlUrl,
    });
    await appendSettingsEvent(loaded, message, { action });
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: nextSettings,
        project: {
          repository: {
            fullName: nextSettings.repository.connected ? nextSettings.repository.fullName : "Repository disconnected",
            name: String(updated.github_repo || loaded.project.github_repo || ""),
            branch: nextSettings.repository.branch,
            htmlUrl: nextSettings.repository.htmlUrl,
            connected: nextSettings.repository.connected,
          },
        },
        message,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Nao foi possivel salvar settings.",
        },
        { status: 400 },
      ),
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }

  try {
    const body = parseFlowSecureDto<{ securityProof?: string }>(
      await request.json().catch(() => ({})),
      {
        securityProof: flowSecureDto.optional(
          flowSecureDto.string({ maxLength: 220, rejectThreatPatterns: false, disallowAngleBrackets: true }),
        ),
      },
      { rejectUnknown: true },
    );
    await requireSensitiveActionProof(
      loaded.session.user.id,
      "vps_delete",
      body.securityProof,
      { target: loaded.vpsCode },
    );

    const now = new Date().toISOString();
    await requestVpsAgent({
      project: loaded.project,
      method: "POST",
      path: `/v1/vps/${loaded.project.vps_code}/actions/delete`,
      body: { reason: "user_deleted_project" },
      timeoutMs: 30_000,
    }).catch(() => null);

    const supabase = getSupabaseAdminClientOrThrow();
    await Promise.allSettled([
      supabase.from("hosting_vps_env_vars").delete().eq("hosting_project_id", loaded.project.id),
      supabase.from("hosting_vps_deployments").delete().eq("hosting_project_id", loaded.project.id),
      supabase.from("hosting_vps_logs").delete().eq("hosting_project_id", loaded.project.id),
      supabase.from("hosting_vps_action_events").delete().eq("hosting_project_id", loaded.project.id),
      supabase.from("hosting_vps_flow_chats").delete().eq("hosting_project_id", loaded.project.id),
      supabase.from("hosting_vps_flow_chat_messages").delete().eq("hosting_project_id", loaded.project.id),
    ]);

    const settings = resolveVpsProjectSettings(loaded.project.provisioning_payload, projectFallback(loaded));
    const deletedPayload = writeVpsSettingsToPayload(loaded.project.provisioning_payload, {
      ...settings,
      repository: {
        ...settings.repository,
        connected: false,
        disconnectedAt: now,
        lastChangedAt: now,
      },
    });

    const update = await supabase
      .from("hosting_projects")
      .update({
        status: "cancelled",
        runtime_status: "offline",
        payment_order_id: null,
        runtime_status_payload: {
          deletedAt: now,
          deletedByUserId: loaded.session.user.id,
        },
        provisioning_payload: {
          ...(deletedPayload as Record<string, unknown>),
          deletedAt: now,
          deletedPaymentOrderId: loaded.project.payment_order_id,
        },
      })
      .eq("id", loaded.project.id);
    if (update.error) throw new Error(update.error.message);

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        redirectUrl: "/dashboard/hosting",
        message: "Projeto e VPS removidos. O periodo pago continua disponivel para criar outra VPS.",
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Nao foi possivel deletar a VPS.",
        },
        { status: 400 },
      ),
    );
  }
}
