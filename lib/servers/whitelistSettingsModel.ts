import type { TicketPanelLayout } from "@/lib/servers/ticketPanelBuilder";
import {
  createEmptyWhitelistMapping,
  normalizeIdentifierKind,
  normalizeWhitelistMapping,
  type WhitelistConnectionMode,
  type WhitelistDbEngine,
  type WhitelistIdentifierKind,
  type WhitelistMapping,
  type WhitelistMappingStatus,
} from "@/lib/servers/whitelistMapping";
import {
  createDefaultWhitelistPanelLayout,
  normalizeWhitelistPanelLayout,
} from "@/lib/servers/whitelistPanelBuilder";
import {
  isLoopbackCityDbHost,
  looksLikePublicCityDbHost,
  normalizeCityDbHost,
} from "@/lib/servers/whitelistHost";

export type WhitelistSettingsDraft = {
  enabled: boolean;
  panelChannelId: string | null;
  reviewChannelId: string | null;
  logsChannelId: string | null;
  panelLayout: TicketPanelLayout;
  approvedRoleIds: string[];
  deniedRoleIds: string[];
  reviewRoleIds: string[];
  identifierKind: WhitelistIdentifierKind;
  identifierLabel: string;
  identifierPlaceholder: string;
  approvalMode: "manual" | "automatic";
  connectionMode: WhitelistConnectionMode;
  dbEngine: WhitelistDbEngine;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbSsl: boolean;
  dbPassword: string;
  hasDbPassword: boolean;
  mapping: WhitelistMapping;
  mappingStatus: WhitelistMappingStatus;
  lastHealthOk: boolean;
  lastHealthAt: string | null;
  lastHealthError: string | null;
  agentPublicId: string | null;
  agentPaired: boolean;
  agentOnline: boolean;
  agentLastSeenAt: string | null;
  agentPublicIp: string | null;
};

export function normalizeWhitelistSettingsDraft(
  input: Partial<WhitelistSettingsDraft> | null | undefined,
): WhitelistSettingsDraft {
  const port = Number(input?.dbPort ?? 3306);
  const engine = String(input?.dbEngine || "mysql");
  const status = String(input?.mappingStatus || "draft");
  const publicIp = looksLikePublicCityDbHost(String(input?.agentPublicIp || ""))
    ? normalizeCityDbHost(String(input?.agentPublicIp || ""))
    : "";
  const requestedHost = normalizeCityDbHost(String(input?.dbHost || ""));
  const dbHost = looksLikePublicCityDbHost(requestedHost)
    ? requestedHost
    : publicIp;
  return {
    enabled: input?.enabled === true,
    panelChannelId:
      typeof input?.panelChannelId === "string" && input.panelChannelId.trim()
        ? input.panelChannelId.trim()
        : null,
    reviewChannelId:
      typeof input?.reviewChannelId === "string" && input.reviewChannelId.trim()
        ? input.reviewChannelId.trim()
        : null,
    logsChannelId:
      typeof input?.logsChannelId === "string" && input.logsChannelId.trim()
        ? input.logsChannelId.trim()
        : null,
    panelLayout: normalizeWhitelistPanelLayout(input?.panelLayout),
    approvedRoleIds: Array.isArray(input?.approvedRoleIds)
      ? input.approvedRoleIds.filter((id): id is string => typeof id === "string")
      : [],
    deniedRoleIds: Array.isArray(input?.deniedRoleIds)
      ? input.deniedRoleIds.filter((id): id is string => typeof id === "string")
      : [],
    reviewRoleIds: Array.isArray(input?.reviewRoleIds)
      ? input.reviewRoleIds.filter((id): id is string => typeof id === "string")
      : [],
    identifierKind: normalizeIdentifierKind(input?.identifierKind),
    identifierLabel: String(input?.identifierLabel || "ID / License").slice(0, 45),
    identifierPlaceholder: String(
      input?.identifierPlaceholder || "Ex: 1 ou license:xxxx",
    ).slice(0, 80),
    approvalMode: String(input?.approvalMode || "manual") === "automatic" ? "automatic" : "manual",
    connectionMode: "direct",
    dbEngine:
      engine === "postgres" || engine === "mariadb" ? engine : "mysql",
    dbHost: isLoopbackCityDbHost(dbHost) ? "" : dbHost,
    dbPort: Number.isFinite(port) && port >= 1 && port <= 65535 ? Math.floor(port) : 3306,
    dbName: String(input?.dbName || "").trim(),
    dbUser: String(input?.dbUser || "").trim(),
    dbSsl: input?.dbSsl === true,
    dbPassword: "",
    hasDbPassword: input?.hasDbPassword === true,
    mapping: input?.mapping
      ? normalizeWhitelistMapping(input.mapping)
      : createEmptyWhitelistMapping(),
    mappingStatus:
      status === "validated" || status === "invalid" ? status : "draft",
    lastHealthOk: input?.lastHealthOk === true,
    lastHealthAt: typeof input?.lastHealthAt === "string" ? input.lastHealthAt : null,
    lastHealthError:
      typeof input?.lastHealthError === "string" ? input.lastHealthError : null,
    agentPublicId:
      typeof input?.agentPublicId === "string" && input.agentPublicId.trim()
        ? input.agentPublicId.trim()
        : null,
    agentPaired: input?.agentPaired === true,
    agentOnline: input?.agentOnline === true,
    agentLastSeenAt: typeof input?.agentLastSeenAt === "string" ? input.agentLastSeenAt : null,
    agentPublicIp: publicIp || null,
  };
}

export function createEmptyWhitelistSettingsDraft(): WhitelistSettingsDraft {
  return normalizeWhitelistSettingsDraft({
    enabled: false,
    panelLayout: createDefaultWhitelistPanelLayout(),
  });
}

export function areWhitelistSettingsDraftsEqual(
  left: WhitelistSettingsDraft | null | undefined,
  right: WhitelistSettingsDraft | null | undefined,
) {
  if (!left || !right) return false;
  const strip = (draft: WhitelistSettingsDraft) => ({
    ...draft,
    dbPassword: "",
    agentOnline: false,
    agentLastSeenAt: null,
    agentPublicIp: null,
  });
  return JSON.stringify(strip(left)) === JSON.stringify(strip(right));
}
