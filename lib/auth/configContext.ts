export type ConfigStep = 1 | 2 | 3 | 4;

export type StepTwoDraft = {
  menuChannelId: string | null;
  ticketsCategoryId: string | null;
  logsCreatedChannelId: string | null;
  logsClosedChannelId: string | null;
};

export type StepThreeDraft = {
  adminRoleId: string | null;
  claimRoleIds: string[];
  closeRoleIds: string[];
  notifyRoleIds: string[];
};

export type ConfigDraft = {
  stepTwoByGuild: Record<string, StepTwoDraft>;
  stepThreeByGuild: Record<string, StepThreeDraft>;
};

export type StoredConfigContext = {
  activeGuildId: string | null;
  activeStep: ConfigStep;
  draft: ConfigDraft;
  updatedAt: string | null;
};

const SNOWFLAKE_REGEX = /^\d{10,25}$/;

export const CONFIG_CONTEXT_STORAGE_KEY = "flowdesk_config_context_v2";
export const LEGACY_GUILD_STORAGE_KEY = "flowdesk_config_guild_id";

export function isSnowflakeId(value: string) {
  return SNOWFLAKE_REGEX.test(value);
}

function normalizeIdOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return isSnowflakeId(id) ? id : null;
}

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  const ids = new Set<string>();
  for (const item of value) {
    const id = normalizeIdOrNull(item);
    if (id) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

export function normalizeConfigStep(value: unknown): ConfigStep | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : Number.NaN;

  if (!Number.isInteger(numeric)) return null;
  if (numeric < 1 || numeric > 4) return null;

  return numeric as ConfigStep;
}

function sanitizeStepTwoDraft(value: unknown): StepTwoDraft | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;

  return {
    menuChannelId: normalizeIdOrNull(data.menuChannelId),
    ticketsCategoryId: normalizeIdOrNull(data.ticketsCategoryId),
    logsCreatedChannelId: normalizeIdOrNull(data.logsCreatedChannelId),
    logsClosedChannelId: normalizeIdOrNull(data.logsClosedChannelId),
  };
}

function sanitizeStepThreeDraft(value: unknown): StepThreeDraft | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;

  return {
    adminRoleId: normalizeIdOrNull(data.adminRoleId),
    claimRoleIds: normalizeIdArray(data.claimRoleIds),
    closeRoleIds: normalizeIdArray(data.closeRoleIds),
    notifyRoleIds: normalizeIdArray(data.notifyRoleIds),
  };
}

function sanitizeDraftMap<T>(
  value: unknown,
  itemSanitizer: (input: unknown) => T | null,
) {
  const output: Record<string, T> = {};
  if (!value || typeof value !== "object") return output;

  for (const [guildId, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (!isSnowflakeId(guildId)) continue;
    const sanitized = itemSanitizer(rawValue);
    if (!sanitized) continue;
    output[guildId] = sanitized;
  }

  return output;
}

export function createEmptyConfigDraft(): ConfigDraft {
  return {
    stepTwoByGuild: {},
    stepThreeByGuild: {},
  };
}

export function sanitizeConfigDraft(value: unknown): ConfigDraft {
  if (!value || typeof value !== "object") {
    return createEmptyConfigDraft();
  }

  const data = value as Record<string, unknown>;

  return {
    stepTwoByGuild: sanitizeDraftMap(data.stepTwoByGuild, sanitizeStepTwoDraft),
    stepThreeByGuild: sanitizeDraftMap(data.stepThreeByGuild, sanitizeStepThreeDraft),
  };
}

export function mergeConfigDraft(base: ConfigDraft, override: ConfigDraft): ConfigDraft {
  return {
    stepTwoByGuild: {
      ...base.stepTwoByGuild,
      ...override.stepTwoByGuild,
    },
    stepThreeByGuild: {
      ...base.stepThreeByGuild,
      ...override.stepThreeByGuild,
    },
  };
}

export function hasStepTwoDraftValues(value: StepTwoDraft | null | undefined) {
  if (!value) return false;

  return Boolean(
    value.menuChannelId ||
      value.ticketsCategoryId ||
      value.logsCreatedChannelId ||
      value.logsClosedChannelId,
  );
}

export function hasStepThreeDraftValues(value: StepThreeDraft | null | undefined) {
  if (!value) return false;

  return Boolean(
    value.adminRoleId ||
      value.claimRoleIds.length ||
      value.closeRoleIds.length ||
      value.notifyRoleIds.length,
  );
}

function normalizeUpdatedAt(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

export function sanitizeStoredConfigContext(value: unknown): StoredConfigContext | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;

  const step = normalizeConfigStep(data.activeStep) || 1;
  const draft = sanitizeConfigDraft(data.draft);
  const activeGuildId = normalizeIdOrNull(data.activeGuildId);
  const updatedAt = normalizeUpdatedAt(data.updatedAt);

  return {
    activeGuildId,
    activeStep: step,
    draft,
    updatedAt,
  };
}
