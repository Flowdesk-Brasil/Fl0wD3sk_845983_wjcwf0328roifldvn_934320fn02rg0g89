import type { TicketPanelLayout } from "@/lib/servers/ticketPanelBuilder";
import {
  createEmptyWhitelistMapping,
  normalizeIdentifierKind,
  resolveCityWhitelistMapping,
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
import { resolveCityDbLogin } from "@/lib/servers/cityDbDefaults";
import { normalizeNicknameFormat } from "@/lib/servers/whitelistNickname";

export function isWhitelistModuleActive(
  input?: {
    enabled?: boolean | null;
    panelChannelId?: string | null;
    panelMessageId?: string | null;
    mapping?: {
      playerTable?: string | null;
      whitelistColumn?: string | null;
    } | Record<string, unknown> | null;
  } | null,
) {
  if (!input) return false;
  if (input.enabled === true) return true;
  if (input.panelChannelId || input.panelMessageId) return true;
  const mapping = input.mapping && typeof input.mapping === "object" ? input.mapping : null;
  return Boolean(
    mapping &&
      "playerTable" in mapping &&
      "whitelistColumn" in mapping &&
      mapping.playerTable &&
      mapping.whitelistColumn,
  );
}

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
  nicknameFormat: string;
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
  const login = resolveCityDbLogin({
    user: input?.dbUser,
    password: input?.dbPassword,
  });
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
      input?.identifierPlaceholder || "Coloque seu ID do jogo",
    ).slice(0, 80),
    nicknameFormat: normalizeNicknameFormat(
      input?.nicknameFormat ||
        (input?.mapping && typeof input.mapping === "object"
          ? (input.mapping as { nicknameFormat?: unknown }).nicknameFormat
          : ""),
    ),
    approvalMode: String(input?.approvalMode || "manual") === "automatic" ? "automatic" : "manual",
    connectionMode: "direct",
    dbEngine:
      engine === "postgres" || engine === "mariadb" ? engine : "mysql",
    dbHost: isLoopbackCityDbHost(dbHost) ? "" : dbHost,
    dbPort: Number.isFinite(port) && port >= 1 && port <= 65535 ? Math.floor(port) : 3306,
    dbName: String(input?.dbName || "").trim(),
    dbUser: login.user,
    dbSsl: input?.dbSsl === true,
    dbPassword: login.password,
    hasDbPassword: Boolean(login.password) || input?.hasDbPassword === true,
    mapping: input?.mapping
      ? resolveCityWhitelistMapping(input.mapping)
      : createEmptyWhitelistMapping(),
    mappingStatus:
      status === "validated" || status === "invalid" ? status : "validated",
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
    lastHealthOk: false,
    lastHealthAt: null,
    lastHealthError: null,
    agentOnline: false,
    agentLastSeenAt: null,
    agentPublicIp: null,
  });
  return JSON.stringify(strip(left)) === JSON.stringify(strip(right));
}
