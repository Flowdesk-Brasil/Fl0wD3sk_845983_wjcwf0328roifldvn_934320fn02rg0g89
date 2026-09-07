export const IDENTIFIER_KINDS = [
  "discord_id",
  "license",
  "license2",
  "steam",
  "rockstar",
  "character_id",
  "internal_id",
  "custom",
] as const;

export type WhitelistIdentifierKind = (typeof IDENTIFIER_KINDS)[number];
export type WhitelistDbEngine = "mysql" | "mariadb" | "postgres";
export type WhitelistConnectionMode = "direct" | "agent";
export type WhitelistValueType = "boolean" | "integer" | "string" | "enum";
export type WhitelistNullBehavior = "off" | "on" | "unknown";
export type WhitelistMappingStatus = "draft" | "validated" | "invalid";

export type WhitelistMapping = {
  playerTable: string;
  playerIdColumn: string;
  playerIdKind: WhitelistIdentifierKind;
  whitelistColumn: string;
  valueType: WhitelistValueType;
  valueOff: string;
  valueOn: string;
  nullBehavior: WhitelistNullBehavior;
  joinTable: string;
  joinFromColumn: string;
  joinToColumn: string;
  joinIdentifierColumn: string;
};

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSafeSqlIdentifier(value: string) {
  return IDENTIFIER_RE.test(String(value || ""));
}

export function splitQualifiedName(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw.split(".").map((part) => part.replace(/[`"]/g, "").trim()).filter(Boolean);
}

export function assertSafeQualifiedName(value: string, label: string) {
  const parts = splitQualifiedName(value);
  if (!parts.length || parts.length > 2 || !parts.every(isSafeSqlIdentifier)) {
    throw new Error(`${label} invalido.`);
  }
  return parts;
}

export function quoteSqlIdentifier(engine: WhitelistDbEngine, value: string) {
  const parts = assertSafeQualifiedName(value, "Identificador");
  if (engine === "postgres") {
    return parts.map((part) => `"${part}"`).join(".");
  }
  return parts.map((part) => `\`${part}\``).join(".");
}

export function normalizeIdentifierKind(value: unknown): WhitelistIdentifierKind {
  const kind = String(value || "").trim();
  return (IDENTIFIER_KINDS as readonly string[]).includes(kind)
    ? (kind as WhitelistIdentifierKind)
    : "discord_id";
}

export function createEmptyWhitelistMapping(): WhitelistMapping {
  return {
    playerTable: "",
    playerIdColumn: "",
    playerIdKind: "discord_id",
    whitelistColumn: "",
    valueType: "integer",
    valueOff: "0",
    valueOn: "1",
    nullBehavior: "off",
    joinTable: "",
    joinFromColumn: "",
    joinToColumn: "",
    joinIdentifierColumn: "",
  };
}

export function normalizeWhitelistMapping(value: unknown): WhitelistMapping {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const valueType = String(record.valueType || "integer");
  const nullBehavior = String(record.nullBehavior || "off");
  return {
    playerTable: String(record.playerTable || "").trim(),
    playerIdColumn: String(record.playerIdColumn || "").trim(),
    playerIdKind: normalizeIdentifierKind(record.playerIdKind),
    whitelistColumn: String(record.whitelistColumn || "").trim(),
    valueType:
      valueType === "boolean" || valueType === "string" || valueType === "enum"
        ? valueType
        : "integer",
    valueOff: String(record.valueOff ?? "0"),
    valueOn: String(record.valueOn ?? "1"),
    nullBehavior:
      nullBehavior === "on" || nullBehavior === "unknown" ? nullBehavior : "off",
    joinTable: String(record.joinTable || "").trim(),
    joinFromColumn: String(record.joinFromColumn || "").trim(),
    joinToColumn: String(record.joinToColumn || "").trim(),
    joinIdentifierColumn: String(record.joinIdentifierColumn || "").trim(),
  };
}

export function mappingUsesJoin(mapping: WhitelistMapping) {
  return Boolean(
    mapping.joinTable &&
      mapping.joinFromColumn &&
      mapping.joinToColumn &&
      mapping.joinIdentifierColumn,
  );
}

export function isMappingComplete(mapping: WhitelistMapping) {
  if (!mapping.playerTable || !mapping.playerIdColumn || !mapping.whitelistColumn) {
    return false;
  }
  if (mappingUsesJoin(mapping)) {
    return Boolean(
      mapping.joinTable &&
        mapping.joinFromColumn &&
        mapping.joinToColumn &&
        mapping.joinIdentifierColumn,
    );
  }
  return true;
}

export function coerceWhitelistValue(valueType: WhitelistValueType, raw: string) {
  const text = String(raw ?? "").trim();
  if (valueType === "boolean") {
    const lowered = text.toLowerCase();
    if (["1", "true", "yes", "on", "approved", "active"].includes(lowered)) return true;
    if (["0", "false", "no", "off", "denied", "inactive", "pending", "null", ""].includes(lowered)) {
      return false;
    }
    return lowered;
  }
  if (valueType === "integer") {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      throw new Error("Valor de whitelist incompativel com coluna numerica.");
    }
    return Math.trunc(parsed);
  }
  return text;
}

export function valuesAreEquivalent(
  valueType: WhitelistValueType,
  left: unknown,
  right: unknown,
) {
  if (left == null && right == null) return true;
  if (valueType === "boolean") {
    return Boolean(left) === Boolean(right);
  }
  if (valueType === "integer") {
    return Number(left) === Number(right);
  }
  return String(left ?? "") === String(right ?? "");
}

export function classifyWhitelistState(
  mapping: WhitelistMapping,
  current: unknown,
): "on" | "off" | "unknown" {
  if (current == null) {
    return mapping.nullBehavior === "unknown" ? "unknown" : mapping.nullBehavior;
  }
  try {
    const onValue = coerceWhitelistValue(mapping.valueType, mapping.valueOn);
    const offValue = coerceWhitelistValue(mapping.valueType, mapping.valueOff);
    if (valuesAreEquivalent(mapping.valueType, current, onValue)) return "on";
    if (valuesAreEquivalent(mapping.valueType, current, offValue)) return "off";
  } catch {
    return "unknown";
  }
  return "unknown";
}

type SchemaColumn = {
  table: string;
  column: string;
  dataType: string;
  nullable: boolean;
};

const PLAYER_TABLE_HINTS = [
  "whitelist",
  "allowlist",
  "users",
  "players",
  "characters",
  "vrp_users",
  "accounts",
  "user_whitelisted",
];

const ID_COLUMN_HINTS = [
  "discord",
  "license",
  "steam",
  "rockstar",
  "identifier",
  "citizenid",
  "user_id",
  "playerid",
  "id",
];

const WHITELIST_COLUMN_HINTS = [
  "whitelist",
  "allowlist",
  "allowed",
  "approved",
  "whitelisted",
  "is_whitelisted",
  "user_whitelisted",
  "permission",
  "status",
  "active",
];

function scoreName(name: string, hints: string[]) {
  const lowered = name.toLowerCase();
  let score = 0;
  for (const hint of hints) {
    if (lowered === hint) score += 8;
    else if (lowered.includes(hint)) score += 4;
  }
  return score;
}

export function inferWhitelistMapping(columns: SchemaColumn[]): {
  mapping: WhitelistMapping;
  confidence: number;
  notes: string[];
} {
  const notes: string[] = [];
  const tables = Array.from(new Set(columns.map((item) => item.table)));
  const tableScores = tables
    .map((table) => ({
      table,
      score: scoreName(table, PLAYER_TABLE_HINTS),
    }))
    .sort((a, b) => b.score - a.score);

  const playerTable = tableScores[0]?.score ? tableScores[0].table : "";
  const tableColumns = columns.filter((item) => item.table === playerTable);

  const idColumn =
    tableColumns
      .map((item) => ({
        column: item.column,
        score: scoreName(item.column, ID_COLUMN_HINTS),
      }))
      .sort((a, b) => b.score - a.score)[0] || null;

  const whitelistColumn =
    tableColumns
      .map((item) => ({
        column: item.column,
        dataType: columns.find((col) => col.table === playerTable && col.column === item.column)
          ?.dataType || "",
        score: scoreName(item.column, WHITELIST_COLUMN_HINTS),
      }))
      .sort((a, b) => b.score - a.score)[0] || null;

  const mapping = createEmptyWhitelistMapping();
  mapping.playerTable = playerTable;
  mapping.playerIdColumn = idColumn?.score ? idColumn.column : "";
  mapping.whitelistColumn = whitelistColumn?.score ? whitelistColumn.column : "";

  const type = String(whitelistColumn?.dataType || "").toLowerCase();
  if (type.includes("bool") || type.includes("tinyint(1)")) {
    mapping.valueType = "boolean";
    mapping.valueOff = "false";
    mapping.valueOn = "true";
  } else if (type.includes("int") || type.includes("numeric") || type.includes("decimal")) {
    mapping.valueType = "integer";
    mapping.valueOff = "0";
    mapping.valueOn = "1";
  } else {
    mapping.valueType = "string";
    mapping.valueOff = "pending";
    mapping.valueOn = "approved";
  }

  if (mapping.playerIdColumn.toLowerCase().includes("discord")) {
    mapping.playerIdKind = "discord_id";
  } else if (mapping.playerIdColumn.toLowerCase().includes("license2")) {
    mapping.playerIdKind = "license2";
  } else if (mapping.playerIdColumn.toLowerCase().includes("license")) {
    mapping.playerIdKind = "license";
  } else if (mapping.playerIdColumn.toLowerCase().includes("steam")) {
    mapping.playerIdKind = "steam";
  }

  const confidence = Math.min(
    100,
    (tableScores[0]?.score || 0) * 6 +
      (idColumn?.score || 0) * 5 +
      (whitelistColumn?.score || 0) * 5,
  );

  if (!playerTable) notes.push("Nao foi possivel detectar a tabela do jogador.");
  if (!mapping.playerIdColumn) notes.push("Nao foi possivel detectar a coluna de identificador.");
  if (!mapping.whitelistColumn) notes.push("Nao foi possivel detectar a coluna de whitelist.");
  if (confidence < 40) notes.push("Confirme o mapping manualmente antes de validar.");

  return { mapping, confidence, notes };
}

export function buildSelectPlayerSql(
  engine: WhitelistDbEngine,
  mapping: WhitelistMapping,
) {
  const playerTable = quoteSqlIdentifier(engine, mapping.playerTable);
  const playerId = quoteSqlIdentifier(engine, mapping.playerIdColumn);
  const whitelist = quoteSqlIdentifier(engine, mapping.whitelistColumn);

  if (mappingUsesJoin(mapping)) {
    const joinTable = quoteSqlIdentifier(engine, mapping.joinTable);
    const joinFrom = quoteSqlIdentifier(engine, mapping.joinFromColumn);
    const joinTo = quoteSqlIdentifier(engine, mapping.joinToColumn);
    const joinId = quoteSqlIdentifier(engine, mapping.joinIdentifierColumn);
    return {
      sql: `SELECT ${playerTable}.${playerId} AS player_key, ${playerTable}.${whitelist} AS whitelist_value FROM ${playerTable} INNER JOIN ${joinTable} ON ${playerTable}.${joinFrom} = ${joinTable}.${joinTo} WHERE ${joinTable}.${joinId} = ? LIMIT 2`,
    };
  }

  return {
    sql: `SELECT ${playerId} AS player_key, ${whitelist} AS whitelist_value FROM ${playerTable} WHERE ${playerId} = ? LIMIT 2`,
  };
}

export function buildUpdateWhitelistSql(
  engine: WhitelistDbEngine,
  mapping: WhitelistMapping,
) {
  const playerTable = quoteSqlIdentifier(engine, mapping.playerTable);
  const playerId = quoteSqlIdentifier(engine, mapping.playerIdColumn);
  const whitelist = quoteSqlIdentifier(engine, mapping.whitelistColumn);
  return {
    sql: `UPDATE ${playerTable} SET ${whitelist} = ? WHERE ${playerId} = ?`,
  };
}

export function fingerprintMapping(mapping: WhitelistMapping) {
  return [
    mapping.playerTable,
    mapping.playerIdColumn,
    mapping.whitelistColumn,
    mapping.joinTable,
    mapping.joinIdentifierColumn,
    mapping.valueType,
    mapping.valueOn,
    mapping.valueOff,
  ].join("|");
}
