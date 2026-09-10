import {
  buildSelectPlayerSql,
  buildUpdateWhitelistSql,
  classifyWhitelistState,
  coerceWhitelistValue,
  inferWhitelistMapping,
  isMappingComplete,
  quoteSqlIdentifier,
  type WhitelistDbEngine,
  type WhitelistMapping,
} from "@/lib/servers/whitelistMapping";
import { resolveWhitelistDbPassword } from "@/lib/servers/whitelistSecret";
import { assertCityDbHost } from "@/lib/servers/whitelistHost";
import { explainCityDbFailure } from "@/lib/servers/cityDbErrors";
import {
  probeCityDbPort,
  testCityDatabase,
  withCityDatabase,
  type CityDbTarget,
} from "@/lib/servers/cityDbConnect";

export type WhitelistDbTarget = CityDbTarget & { engine: WhitelistDbEngine };

export { probeCityDbPort, testCityDatabase, withCityDatabase };

export function sanitizeDbError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha na conexao com o banco da cidade.";
  const lowered = message.toLowerCase();
  if (
    lowered.includes("envelope") ||
    lowered.includes("senha salva") ||
    lowered.includes("digite a senha")
  ) {
    return {
      code: "password_envelope",
      title: "A senha salva nao pode ser lida",
      message: "Digite a senha do banco novamente no campo Senha e teste.",
      hint: "A Flowdesk nao guarda a senha em texto. Isso nao indica instabilidade da plataforma.",
    };
  }
  if (lowered.includes("nao chegaram no launcher") || lowered.includes("digite a senha no painel")) {
    return {
      code: "missing_credentials",
      title: "Falta a senha do banco",
      message: "Digite a senha do MySQL no painel e clique em Conectar banco.",
      hint: "Sem a senha da sua VPS a Flowdesk nao consegue autenticar no MariaDB.",
    };
  }
  const issue = explainCityDbFailure(error);
  return {
    code: issue.code,
    title: issue.title,
    message: issue.message,
    hint: issue.hint,
  };
}

export function isUnreachableDbError(error: unknown) {
  const code = sanitizeDbError(error).code;
  return code === "offline" || code === "timeout";
}

export async function inspectCitySchema(target: WhitelistDbTarget) {
  const columns = await withCityDatabase(target, async (query) => {
    if (target.engine === "postgres") {
      return query(
        `SELECT table_name AS table, column_name AS column, data_type AS data_type, is_nullable AS is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`,
      );
    }
    return query(
      `SELECT TABLE_NAME AS \`table\`, COLUMN_NAME AS \`column\`, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [target.database],
    );
  });

  const normalized = columns.map((row) => ({
    table: String(row.table || row.TABLE || ""),
    column: String(row.column || row.COLUMN || ""),
    dataType: String(row.data_type || row.DATA_TYPE || ""),
    nullable: String(row.is_nullable || row.IS_NULLABLE || "YES").toUpperCase() === "YES",
  }));

  const inferred = inferWhitelistMapping(normalized);
  const fingerprint = `${normalized.length}:${normalized
    .slice(0, 40)
    .map((item) => `${item.table}.${item.column}`)
    .join(",")}`;

  return {
    tables: Array.from(new Set(normalized.map((item) => item.table))).slice(0, 200),
    columns: normalized.slice(0, 800),
    inferred,
    fingerprint,
  };
}

export async function sampleWhitelistMapping(
  target: WhitelistDbTarget,
  mapping: WhitelistMapping,
) {
  if (!isMappingComplete(mapping)) {
    throw new Error("Complete tabela, coluna de identificador e coluna de whitelist.");
  }
  const playerTable = quoteSqlIdentifier(target.engine, mapping.playerTable);
  const playerId = quoteSqlIdentifier(target.engine, mapping.playerIdColumn);
  const whitelist = quoteSqlIdentifier(target.engine, mapping.whitelistColumn);
  const rows = await withCityDatabase(target, (query) =>
    query(
      `SELECT ${playerId} AS player_key, ${whitelist} AS whitelist_value FROM ${playerTable} LIMIT 1`,
    ),
  );
  if (!rows.length) {
    return {
      ok: true,
      code: "empty_table",
      message: "Tabela e colunas existem. Ainda nao ha jogadores para amostrar.",
      playerKey: "",
      currentValue: null,
      state: "unknown" as const,
    };
  }
  const current = rows[0]?.whitelist_value;
  return {
    ok: true,
    code: "ok",
    message: "Mapping validado. Registro de amostra lido sem alterar dados.",
    playerKey: String(rows[0]?.player_key ?? ""),
    currentValue: current == null ? null : String(current),
    state: classifyWhitelistState(mapping, current),
  };
}

export async function testWhitelistMapping(
  target: WhitelistDbTarget,
  mapping: WhitelistMapping,
  identifierValue: string,
) {
  if (!isMappingComplete(mapping)) {
    throw new Error("Complete tabela, coluna de identificador e coluna de whitelist.");
  }
  const { sql } = buildSelectPlayerSql(target.engine, mapping);
  const rows = await withCityDatabase(target, (query) => query(sql, [identifierValue]));
  if (rows.length > 1) {
    return {
      ok: false,
      code: "multiple_players",
      message: "Mais de um jogador encontrado para este identificador.",
      rows: rows.length,
    };
  }
  if (!rows.length) {
    return {
      ok: false,
      code: "player_not_found",
      message: "Jogador nao encontrado no banco da cidade.",
      rows: 0,
    };
  }
  const current = rows[0]?.whitelist_value;
  return {
    ok: true,
    code: "ok",
    message: "Registro localizado sem alterar dados.",
    playerKey: String(rows[0]?.player_key ?? ""),
    currentValue: current == null ? null : String(current),
    state: classifyWhitelistState(mapping, current),
  };
}

export async function applyWhitelistState(input: {
  target: WhitelistDbTarget;
  mapping: WhitelistMapping;
  identifierValue: string;
  approve: boolean;
}) {
  const lookup = await testWhitelistMapping(
    input.target,
    input.mapping,
    input.identifierValue,
  );
  if (!lookup.ok) return lookup;

  const desiredRaw = input.approve ? input.mapping.valueOn : input.mapping.valueOff;
  const desired = coerceWhitelistValue(input.mapping.valueType, desiredRaw);
  const currentState = lookup.state;
  if ((input.approve && currentState === "on") || (!input.approve && currentState === "off")) {
    return {
      ...lookup,
      skipped: true,
      code: "already_applied",
      message: input.approve ? "Jogador ja esta aprovado." : "Jogador ja esta sem whitelist.",
    };
  }

  const { sql } = buildUpdateWhitelistSql(input.target.engine, input.mapping);
  await withCityDatabase(input.target, (query) =>
    query(sql, [desired, lookup.playerKey]),
  );
  const confirm = await testWhitelistMapping(
    input.target,
    input.mapping,
    input.identifierValue,
  );
  return {
    ...confirm,
    previousValue: lookup.currentValue,
    nextValue: confirm.currentValue,
    skipped: false,
  };
}

export function settingsToDbTarget(input: {
  guildId: string;
  engine: WhitelistDbEngine;
  host: string | null;
  port: number;
  database: string | null;
  user: string | null;
  ssl: boolean;
  passwordCipher: string | null;
  passwordOverride?: string | null;
  allowEmptyPassword?: boolean;
}): WhitelistDbTarget {
  if (!input.host || !input.database || !input.user) {
    throw new Error("Informe o IP/host da VPS, o nome do banco e o usuario da integracao.");
  }
  const host = assertCityDbHost(input.host);
  const resolved = resolveWhitelistDbPassword({
    cipher: input.passwordCipher,
    guildId: input.guildId,
    override: input.passwordOverride,
    allowEmpty: input.allowEmptyPassword === true,
  });
  return {
    engine: input.engine,
    host,
    port: input.port,
    database: input.database,
    user: input.user,
    password: resolved.password,
    ssl: input.ssl,
  };
}
