import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  HOSTING_PLANS,
  resolveHostingRegion,
  type HostingKind,
} from "@/lib/hosting/catalog";
import {
  createCloudflareDnsRecord,
  getCloudflareZone,
  listCloudflareDnsRecords,
  updateCloudflareDnsRecord,
} from "@/lib/domains/cloudflare";
import { readHostingGitHubToken } from "@/lib/hosting/github";
import { appendVpsEvent, requestVpsAgent } from "@/lib/hosting/vpsRuntime";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

function isHostingKind(value: unknown): value is HostingKind {
  return value === "site" || value === "bot" || value === "minecraft";
}

function normalizeText(value: unknown, maxLength = 160) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeOrderNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRepository(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const owner = normalizeText(record.owner, 80);
  const name = normalizeText(record.name, 120);
  if (!owner || !name) return null;
  return {
    owner,
    name,
    id: normalizeText(record.id, 80),
    nodeId: normalizeText(record.nodeId, 160),
    branch: normalizeText(record.branch, 120) || "main",
    fullName: `${owner}/${name}`,
    description: normalizeText(record.description, 400),
    language: normalizeText(record.language, 80),
    htmlUrl: normalizeText(record.htmlUrl, 300),
    private: typeof record.private === "boolean" ? record.private : null,
  };
}

function normalizeMinecraftSlug(value: unknown) {
  const source = normalizeText(value, 64);
  if (!source) return null;
  const normalized = source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(normalized)) return null;
  return normalized;
}

function normalizeMinecraftConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const serverName = normalizeText(record.serverName, 80) || "Servidor Minecraft";
  const version = normalizeText(record.version, 24) || "1.21.1";
  const requestedType = normalizeText(record.serverType, 40) || "paper";
  const allowedTypes = new Set(["paper", "purpur", "fabric", "forge", "neoforge", "vanilla"]);
  const serverType = allowedTypes.has(requestedType) ? requestedType : "paper";
  const subdomain = normalizeMinecraftSlug(record.subdomain) || normalizeMinecraftSlug(serverName);
  const firstWorldName = normalizeText(record.firstWorldName, 80) || "world";
  if (!subdomain) return null;

  return {
    serverName,
    version,
    serverType,
    subdomain,
    firstWorldName,
    domains: {
      primary: `${subdomain}.mine.flwdesk.com`,
    },
  };
}

function normalizeMinecraftConfigFromPurchaseContext(context: Record<string, unknown> | null) {
  if (!context) return null;
  return normalizeMinecraftConfig({
    serverName: context.minecraftServerName,
    version: context.minecraftVersion,
    serverType: context.minecraftServerType,
    subdomain: context.minecraftSubdomain,
    firstWorldName: context.minecraftFirstWorldName,
  });
}

function parseFirstNumber(input: string | null | undefined) {
  if (!input) return null;
  const match = input.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function readPositiveInteger(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function resolveMinecraftProvisionPorts(
  payload: Record<string, unknown> | null | undefined,
  fallback: { serverPort: number; rconPort: number } | null,
) {
  const ports = payload?.ports && typeof payload.ports === "object" && !Array.isArray(payload.ports)
    ? payload.ports as Record<string, unknown>
    : null;
  const server = payload?.server && typeof payload.server === "object" && !Array.isArray(payload.server)
    ? payload.server as Record<string, unknown>
    : null;
  return {
    serverPort:
      readPositiveInteger(ports?.serverPort) ||
      readPositiveInteger(server?.serverPort) ||
      fallback?.serverPort ||
      25565,
    rconPort:
      readPositiveInteger(ports?.rconPort) ||
      readPositiveInteger(server?.rconPort) ||
      fallback?.rconPort ||
      30000,
  };
}

function resolveMinecraftPlanLimits(plan: { specs?: string[] }) {
  const specs = plan.specs || [];
  const readSpec = (needle: string) => specs.find((item) => item.toLowerCase().includes(needle));
  return {
    ramMb: (parseFirstNumber(readSpec("gb ram")) || 1) * 1024,
    storageGb: parseFirstNumber(readSpec("ssd")) || 5,
    maxPlayers: readSpec("ilimitado")?.toLowerCase().includes("jogadores") ? null : parseFirstNumber(readSpec("jogadores")),
    maxWorlds: readSpec("mundos ilimitados") ? null : parseFirstNumber(readSpec("mundos")),
    maxMods: readSpec("mods ilimitados") ? null : parseFirstNumber(readSpec("mods")),
    maxPlugins: readSpec("plugins ilimitados") ? null : parseFirstNumber(readSpec("plugins")),
  };
}

async function allocateMinecraftPorts(supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>) {
  const { data } = await supabase
    .from("hosting_minecraft_servers")
    .select("server_port, rcon_port")
    .not("status", "in", "(deleted,cancelled)");
  const usedServerPorts = new Set((data || []).map((row) => Number(row.server_port)).filter(Number.isFinite));
  const usedRconPorts = new Set((data || []).map((row) => Number(row.rcon_port)).filter(Number.isFinite));
  const pick = (start: number, end: number, used: Set<number>) => {
    for (let port = start; port <= end; port += 1) {
      if (!used.has(port)) return port;
    }
    throw new Error(`Sem portas Minecraft livres entre ${start}-${end}.`);
  };
  return {
    serverPort: pick(25565, 29999, usedServerPorts),
    rconPort: pick(30000, 34999, usedRconPorts),
  };
}

async function provisionMinecraftDnsRecords(
  minecraft: NonNullable<ReturnType<typeof normalizeMinecraftConfig>>,
  fixedDomain: string,
  serverPort = 25565,
) {
  const target = normalizeText(
    process.env.MINECRAFT_DNS_TARGET ||
      process.env.HOSTING_MINECRAFT_DNS_TARGET ||
      process.env.HOSTING_PUBLIC_DNS_TARGET,
    253,
  );
  if (!target) {
    return {
      status: "pending_dns_target",
      records: [],
    };
  }

  const configuredZoneId = normalizeText(process.env.CLOUDFLARE_ZONE_ID, 120);
  const zone = configuredZoneId ? { id: configuredZoneId } : await getCloudflareZone("flwdesk.com");
  if (!zone?.id) {
    return {
      status: "pending_cloudflare_zone",
      records: [],
      target,
    };
  }

  const existing = await listCloudflareDnsRecords(zone.id);
  const hostnames = [minecraft.domains.primary, fixedDomain];
  const isIpTarget = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(target);
  const recordType = isIpTarget ? "A" : "CNAME";
  const records: Array<Record<string, unknown>> = [];
  const srvRecords: Array<Record<string, unknown>> = [];
  const ensureSrvRecord = async (hostname: string) => {
    const srvName = `_minecraft._tcp.${hostname}`;
    const currentSrv = existing.find((record) =>
      String(record.name || "").toLowerCase() === srvName.toLowerCase() &&
      String(record.type || "").toUpperCase() === "SRV"
    );
    const input = {
      type: "SRV",
      name: srvName,
      content: hostname,
      proxied: false,
      ttl: 1,
      priority: 0,
      data: {
        service: "_minecraft",
        proto: "_tcp",
        name: hostname,
        priority: 0,
        weight: 0,
        port: serverPort,
        target: hostname,
      },
    };
    const record = currentSrv?.id
      ? await updateCloudflareDnsRecord(zone.id, String(currentSrv.id), input)
      : await createCloudflareDnsRecord(zone.id, input);
    srvRecords.push({
      hostname: srvName,
      recordId: String(record.id || currentSrv?.id || ""),
      reused: Boolean(currentSrv?.id),
    });
  };

  for (const hostname of hostnames) {
    const current = existing.find((record) =>
      String(record.name || "").toLowerCase() === hostname.toLowerCase() &&
      String(record.type || "").toUpperCase() === recordType
    );
    if (current?.id) {
      if (String(current.content || "") !== target || Boolean(current.proxied) !== false) {
        const updated = await updateCloudflareDnsRecord(zone.id, String(current.id), {
          type: recordType,
          name: hostname,
          content: target,
          proxied: false,
          ttl: 1,
        });
        records.push({ hostname, recordId: String(updated.id || current.id), updated: true });
      } else {
        records.push({ hostname, recordId: String(current.id), reused: true });
      }
      await ensureSrvRecord(hostname);
      continue;
    }
    const record = await createCloudflareDnsRecord(zone.id, {
      type: recordType,
      name: hostname,
      content: target,
      proxied: false,
      ttl: 1,
    });
    records.push({ hostname, recordId: String(record.id || ""), reused: false });
    await ensureSrvRecord(hostname);
  }

  return {
    status: "active",
    zoneId: zone.id,
    target,
    records: [...records, ...srvRecords],
  };
}

function slugifyMinecraftWorld(value: string) {
  return (
    normalizeMinecraftSlug(value) ||
    normalizeMinecraftSlug("world") ||
    "world"
  );
}

async function persistMinecraftControlPlaneRecord(input: {
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>;
  projectId: number;
  paymentOrderId: number;
  userId: number;
  minecraft: NonNullable<ReturnType<typeof normalizeMinecraftConfig>>;
  fixedDomain: string | null;
  limits: ReturnType<typeof resolveMinecraftPlanLimits> | null;
  dns: Record<string, unknown> | null;
  serverPort: number;
  rconPort: number;
}) {
  const { data: minecraftServer, error } = await input.supabase
    .from("hosting_minecraft_servers")
    .upsert(
      {
        hosting_project_id: input.projectId,
        payment_order_id: input.paymentOrderId,
        user_id: input.userId,
        server_name: input.minecraft.serverName,
        server_slug: input.minecraft.subdomain,
        minecraft_version: input.minecraft.version,
        server_type: input.minecraft.serverType,
        primary_domain: input.minecraft.domains.primary,
        fixed_domain: input.fixedDomain,
        server_port: input.serverPort,
        rcon_port: input.rconPort,
        cloudflare_status: typeof input.dns?.status === "string" ? input.dns.status : "pending",
        cloudflare_payload: input.dns || {},
        limits: input.limits || {},
        status: "created",
      },
      { onConflict: "hosting_project_id" },
    )
    .select("id")
    .maybeSingle();

  if (error || !minecraftServer?.id) {
    throw new Error(error?.message || "Nao foi possivel registrar o servidor Minecraft.");
  }

  const firstWorldSlug = slugifyMinecraftWorld(input.minecraft.firstWorldName);
  const { error: worldError } = await input.supabase
    .from("hosting_minecraft_worlds")
    .upsert(
      {
        minecraft_server_id: minecraftServer.id,
        hosting_project_id: input.projectId,
        world_slug: firstWorldSlug,
        world_name: input.minecraft.firstWorldName,
        status: "created",
        metadata: {
          source: "onboarding",
          initial: true,
        },
      },
      { onConflict: "minecraft_server_id,world_slug" },
    );
  if (worldError) {
    throw new Error(worldError.message || "Nao foi possivel registrar o mundo Minecraft.");
  }
}

function readPurchaseContext(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const context = (payload as Record<string, unknown>).purchase_context;
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  return context as Record<string, unknown>;
}

function addDaysIso(base: string | null | undefined, days: number) {
  const baseMs = base ? Date.parse(base) : Number.NaN;
  const startMs = Number.isFinite(baseMs) ? baseMs : Date.now();
  return new Date(startMs + days * 86_400_000).toISOString();
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  let body: Record<string, unknown>;
  try {
    body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        orderNumber: flowSecureDto.unknown(),
        kind: flowSecureDto.enum(["site", "bot", "minecraft"] as const),
        planId: flowSecureDto.string({ maxLength: 80 }),
        regionId: flowSecureDto.string({ maxLength: 80 }),
        repository: flowSecureDto.optional(flowSecureDto.unknown()),
        minecraft: flowSecureDto.optional(flowSecureDto.unknown()),
      },
      { rejectUnknown: true },
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 }),
    );
  }

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message: "Entre na sua conta para liberar a VPS.",
      }, { status: 401 }),
    );
  }
  const orderNumber = normalizeOrderNumber(body.orderNumber);
  const kind = isHostingKind(body.kind) ? body.kind : null;
  const planId = normalizeText(body.planId, 80);
  const regionId = normalizeText(body.regionId, 80);
  const repository = normalizeRepository(body.repository);
  const minecraft = normalizeMinecraftConfig(body.minecraft);
  const plan = kind && planId
    ? HOSTING_PLANS[kind].find((item) => item.id === planId)
    : null;
  const region = regionId ? resolveHostingRegion(regionId) : null;

  if (!orderNumber || !kind || !plan || !region || (kind !== "minecraft" && !repository)) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message:
          "Complete tipo, repositorio, regiao, plano e pedido antes de provisionar.",
      }, { status: 400 }),
    );
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const { data: order, error: orderError } = await supabase
    .from("payment_orders")
    .select("id, order_number, user_id, status, amount, plan_code, plan_name, provider_payload, paid_at, expires_at")
    .eq("order_number", orderNumber)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (orderError) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: orderError.message }, { status: 500 }),
    );
  }

  if (!order || order.status !== "approved") {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message: "O pedido ainda nao esta aprovado para liberar a VPS.",
      }, { status: 409 }),
    );
  }

  const purchaseContext = readPurchaseContext(order.provider_payload);
  if (
    purchaseContext?.type !== "hosting" ||
    purchaseContext.hostingKind !== kind ||
    purchaseContext.hostingPlanId !== plan.id ||
    purchaseContext.hostingRegionId !== region.id
  ) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message: "Esse pagamento nao pertence a esta compra de VPS. Gere um checkout novo pela tela de hospedagem.",
      }, { status: 409 }),
    );
  }

  const paidMinecraft = kind === "minecraft"
    ? normalizeMinecraftConfigFromPurchaseContext(purchaseContext)
    : null;
  const effectiveMinecraft = kind === "minecraft" ? paidMinecraft || minecraft : null;
  if (kind === "minecraft" && !effectiveMinecraft) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message: "Esse pagamento nao possui os dados do servidor Minecraft. Volte ao onboarding e gere um checkout novo.",
      }, { status: 409 }),
    );
  }

  const accessExpiresAt = order.expires_at || addDaysIso(order.paid_at, 30);

  const { data: existingProject, error: existingError } = await supabase
    .from("hosting_projects")
    .select("id, vps_code, user_id, payment_order_id, hosting_kind, hosting_plan_id, hosting_region_id, github_owner, github_repo, github_repo_id, github_branch, status, runtime_status, runtime_status_payload, runtime_last_seen_at, billing_status, access_expires_at, refund_access_until, refunded_at, suspended_at, suspension_reason, windows_runtime, provisioning_payload, created_at, updated_at")
    .eq("payment_order_id", order.id)
    .not("status", "in", "(cancelled)")
    .maybeSingle();

  if (existingError) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: existingError.message }, { status: 500 }),
    );
  }

  if (existingProject?.vps_code) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        reused: true,
        vpsCode: existingProject.vps_code,
        status: existingProject.status,
        redirectUrl: `https://fdesk.flwdesk.com/vps/${existingProject.vps_code}`,
      }),
    );
  }

  if (kind !== "minecraft" && repository) {
    const { data: duplicateRepositoryProject, error: duplicateRepositoryError } = await supabase
      .from("hosting_projects")
      .select("vps_code, github_owner, github_repo, status")
      .eq("user_id", session.user.id)
      .not("status", "in", "(deleted,cancelled)")
      .or(
        [
          `github_repo_id.eq.${repository.id}`,
          `and(github_owner.eq.${repository.owner},github_repo.eq.${repository.name})`,
        ].join(","),
      )
      .maybeSingle();

    if (duplicateRepositoryError) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: duplicateRepositoryError.message }, { status: 500 }),
      );
    }

    if (duplicateRepositoryProject?.vps_code) {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: false,
          duplicateRepository: true,
          vpsCode: duplicateRepositoryProject.vps_code,
          message: `Este repositorio ja esta vinculado a VPS ${duplicateRepositoryProject.vps_code}. Escolha outro repositorio para criar uma nova hospedagem.`,
        }, { status: 409 }),
      );
    }
  }

  const minecraftLimits = kind === "minecraft" ? resolveMinecraftPlanLimits(plan) : null;
  const minecraftPorts = kind === "minecraft" ? await allocateMinecraftPorts(supabase) : null;
  const repositoryForProject = repository || {
    owner: "flowdesk-minecraft",
    name: effectiveMinecraft?.subdomain || "minecraft",
    id: `minecraft:${effectiveMinecraft?.subdomain || "server"}`,
    nodeId: null,
    branch: "minecraft",
    fullName: `flowdesk-minecraft/${effectiveMinecraft?.subdomain || "minecraft"}`,
    description: effectiveMinecraft?.serverName || "Servidor Minecraft Flowdesk",
    language: "Minecraft",
    htmlUrl: null,
    private: null,
  };

  const { data: project, error: insertError } = await supabase
    .from("hosting_projects")
    .insert({
      user_id: session.user.id,
      payment_order_id: order.id,
      hosting_kind: kind,
      hosting_plan_id: plan.id,
      hosting_region_id: region.id,
      github_owner: repositoryForProject.owner,
      github_repo: repositoryForProject.name,
      github_repo_id: repositoryForProject.id,
      github_branch: repositoryForProject.branch,
      status: "pending_provision",
      billing_status: "active",
      access_expires_at: accessExpiresAt,
      provisioning_payload: {
        source: "dashboard_hosting",
        windowsRuntime: "windows-vps",
        controlPlane: kind === "minecraft" ? "minecraft" : "git",
        access: {
          startsAt: order.paid_at || new Date().toISOString(),
          expiresAt: accessExpiresAt,
          sourceOrderNumber: order.order_number,
        },
        repository,
        minecraft: effectiveMinecraft,
        limits: minecraftLimits,
        ports: minecraftPorts,
        plan,
        region,
      },
    })
    .select("id, vps_code, user_id, payment_order_id, hosting_kind, hosting_plan_id, hosting_region_id, github_owner, github_repo, github_repo_id, github_branch, status, runtime_status, runtime_status_payload, runtime_last_seen_at, billing_status, access_expires_at, refund_access_until, refunded_at, suspended_at, suspension_reason, windows_runtime, provisioning_payload, created_at, updated_at")
    .single();

  if (insertError) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: insertError.message }, { status: 500 }),
    );
  }

  const { data: deployment } = await supabase
    .from("hosting_vps_deployments")
    .insert({
      hosting_project_id: project.id,
      environment: "production",
      status: "deploying",
      branch: repositoryForProject.branch || "main",
      commit_message: kind === "minecraft" ? "Minecraft server provisioning" : "Initial automatic deploy",
      metadata: {
        source: kind === "minecraft" ? "minecraft_control_plane" : "provision_auto_deploy",
        minecraft: effectiveMinecraft,
        limits: minecraftLimits,
        ports: minecraftPorts,
      },
    })
    .select("*")
    .single();

  await appendVpsEvent({
    projectId: project.id,
    userId: session.user.id,
    action: kind === "minecraft" ? "minecraft_provision" : "deploy",
    status: "running",
    message: kind === "minecraft" ? "Provisionamento Minecraft iniciado." : "Deploy inicial automatico iniciado.",
    responsePayload: { deploymentId: deployment?.id || null },
  }).catch(() => null);

  let autoDeployMessage: string | null = null;
  const minecraftFixedDomain = kind === "minecraft"
    ? `${String(project.vps_code).toLowerCase()}.mine.flwdesk.com`
    : null;
  const minecraftDns = kind === "minecraft" && effectiveMinecraft && minecraftFixedDomain
    ? await provisionMinecraftDnsRecords(effectiveMinecraft, minecraftFixedDomain, minecraftPorts?.serverPort || 25565).catch((error) => ({
        status: "failed",
        message: error instanceof Error ? error.message : "Falha ao configurar DNS Cloudflare.",
        records: [],
      }))
    : null;
  if (kind === "minecraft" && effectiveMinecraft) {
    await persistMinecraftControlPlaneRecord({
      supabase,
      projectId: project.id,
      paymentOrderId: order.id,
      userId: session.user.id,
      minecraft: effectiveMinecraft,
      fixedDomain: minecraftFixedDomain,
      limits: minecraftLimits,
      dns: minecraftDns,
      serverPort: minecraftPorts?.serverPort || 25565,
      rconPort: minecraftPorts?.rconPort || 30000,
    }).catch((error) => {
      throw new Error(error instanceof Error ? error.message : "Nao foi possivel registrar o servidor Minecraft.");
    });
  }
  try {
    const deployPayload = kind === "minecraft" && effectiveMinecraft
      ? await requestVpsAgent<Record<string, unknown>>({
          project,
          method: "POST",
          path: `/v1/minecraft/servers`,
          body: {
            projectCode: project.vps_code,
            deploymentId: deployment?.id || null,
            server: {
              ...effectiveMinecraft,
              serverPort: minecraftPorts?.serverPort,
              rconPort: minecraftPorts?.rconPort,
              domains: {
                ...effectiveMinecraft.domains,
                fixed: minecraftFixedDomain,
              },
            },
            plan: {
              id: plan.id,
              name: plan.name,
              monthlyAmount: plan.monthlyAmount,
              currency: plan.currency,
            },
            region: {
              id: region.id,
              name: region.name,
              city: region.city,
              country: region.country,
            },
            limits: minecraftLimits,
            ports: minecraftPorts,
            dns: minecraftDns,
          },
          timeoutMs: 120_000,
        })
      : await (async () => {
          if (!repository) {
            throw new Error("Repositorio nao informado para deploy.");
          }
          const githubToken = await readHostingGitHubToken(session.user.id).catch(() => null);
          const tokenPart = githubToken ? `${encodeURIComponent(githubToken)}@` : "";
          return requestVpsAgent<Record<string, unknown>>({
            project,
            method: "POST",
            path: `/v1/vps/${project.vps_code}/actions/deploy`,
            body: {
              deploymentId: deployment?.id || null,
              gitUrl: `https://${tokenPart}github.com/${repository.owner}/${repository.name}.git`,
              branch: repository.branch || "main",
            },
            timeoutMs: 120_000,
          });
        })();
    const finalMinecraftPorts = kind === "minecraft"
      ? resolveMinecraftProvisionPorts(deployPayload, minecraftPorts)
      : null;
    const finalMinecraftDns = kind === "minecraft" && effectiveMinecraft && minecraftFixedDomain
      ? await provisionMinecraftDnsRecords(effectiveMinecraft, minecraftFixedDomain, finalMinecraftPorts?.serverPort || 25565).catch((error) => ({
          status: "failed",
          message: error instanceof Error ? error.message : "Falha ao configurar DNS Cloudflare.",
          records: [],
        }))
      : minecraftDns;
    if (kind === "minecraft" && effectiveMinecraft && finalMinecraftPorts) {
      await persistMinecraftControlPlaneRecord({
        supabase,
        projectId: project.id,
        paymentOrderId: order.id,
        userId: session.user.id,
        minecraft: effectiveMinecraft,
        fixedDomain: minecraftFixedDomain,
        limits: minecraftLimits,
        dns: finalMinecraftDns,
        serverPort: finalMinecraftPorts.serverPort,
        rconPort: finalMinecraftPorts.rconPort,
      });
    }
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase
        .from("hosting_projects")
        .update({
          status: "active",
          runtime_status: kind === "minecraft" ? "offline" : "online",
          runtime_status_payload:
            kind === "minecraft"
              ? { minecraftProvision: deployPayload, cloudflare: finalMinecraftDns, ports: finalMinecraftPorts }
              : { initialDeploy: deployPayload },
          runtime_last_seen_at: finishedAt,
        })
        .eq("id", project.id),
      deployment?.id
        ? supabase
            .from("hosting_vps_deployments")
            .update({
              status: "production",
              deployed_at: finishedAt,
              build_finished_at: finishedAt,
              metadata: {
                source: kind === "minecraft" ? "minecraft_control_plane" : "provision_auto_deploy",
                response: deployPayload,
              },
            })
            .eq("id", deployment.id)
        : Promise.resolve(null),
    ]);
    await appendVpsEvent({
      projectId: project.id,
      userId: session.user.id,
      action: kind === "minecraft" ? "minecraft_provision" : "deploy",
      status: "succeeded",
      message: kind === "minecraft" ? "Servidor Minecraft criado na VPS." : "Deploy inicial automatico concluido.",
      responsePayload: deployPayload,
    }).catch(() => null);
  } catch (err) {
    autoDeployMessage = err instanceof Error ? err.message : "Deploy inicial nao concluido.";
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase
        .from("hosting_projects")
        .update({
          status: "failed",
          runtime_status: "crashed",
          runtime_status_payload:
            kind === "minecraft"
              ? { minecraftProvisionError: autoDeployMessage }
              : { initialDeployError: autoDeployMessage },
          runtime_last_seen_at: finishedAt,
        })
        .eq("id", project.id),
      deployment?.id
        ? supabase
            .from("hosting_vps_deployments")
            .update({
              status: "failed",
              build_finished_at: finishedAt,
              logs: [{ level: "error", message: autoDeployMessage }],
            })
            .eq("id", deployment.id)
        : Promise.resolve(null),
    ]);
    await appendVpsEvent({
      projectId: project.id,
      userId: session.user.id,
      action: kind === "minecraft" ? "minecraft_provision" : "deploy",
      status: "failed",
      message: autoDeployMessage,
    }).catch(() => null);
  }

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      reused: false,
      vpsCode: project.vps_code,
      status: autoDeployMessage ? "failed" : "active",
      autoDeploy: {
        ok: !autoDeployMessage,
        message: autoDeployMessage,
      },
      redirectUrl: `https://fdesk.flwdesk.com/vps/${project.vps_code}`,
    }),
  );
}
