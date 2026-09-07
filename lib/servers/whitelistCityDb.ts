import mysql from "mysql2/promise";
import pg from "pg";
import {
  buildSelectPlayerSql,
  buildUpdateWhitelistSql,
  classifyWhitelistState,
  coerceWhitelistValue,
  inferWhitelistMapping,
  isMappingComplete,
  type WhitelistDbEngine,
  type WhitelistMapping,
} from "@/lib/servers/whitelistMapping";
import { decryptWhitelistSecret } from "@/lib/servers/whitelistSecret";
import { assertCityDbHost } from "@/lib/servers/whitelistHost";

export type WhitelistDbTarget = {
  engine: WhitelistDbEngine;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

const CONNECT_TIMEOUT_MS = 8000;
const QUERY_TIMEOUT_MS = 8000;

function withQueryTimeout<T>(promise: Promise<T>, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} excedeu o tempo limite.`)), QUERY_TIMEOUT_MS);
    }),
  ]);
}

export function sanitizeDbError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha na conexao com o banco da cidade.";
  const lowered = message.toLowerCase();
  if (lowered.includes("timeout") || lowered.includes("timed out")) {
    return { code: "timeout", message: "O banco da cidade nao respondeu a tempo." };
  }
  if (lowered.includes("access denied") || lowered.includes("password") || lowered.includes("authentication")) {
    return { code: "invalid_credentials", message: "Credencial do banco invalida." };
  }
  if (lowered.includes("enotfound") || lowered.includes("econnrefused") || lowered.includes("connect") || lowered.includes("etimedout")) {
    return {
      code: "offline",
      message:
        "A FlowDesk na nuvem nao alcanca o MySQL da VPS (firewall/NAT). Use o Agent/Bridge no Banco e Mapping: instale o launcher na VPS e deixe-o aberto. No modo Agent a porta 3306 nao precisa ficar publica.",
    };
  }
  if (lowered.includes("not allowed") || lowered.includes("host is not allowed") || lowered.includes("is not allowed to connect")) {
    return {
      code: "ip_not_allowed",
      message:
        "O banco recusou o IP da FlowDesk. Libere o host da aplicacao no MySQL/MariaDB/PostgreSQL da cidade (GRANT / pg_hba).",
    };
  }
  return { code: "db_error", message: "Nao foi possivel executar a operacao no banco da cidade." };
}

export async function withCityDatabase<T>(
  target: WhitelistDbTarget,
  fn: (query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
) {
  if (target.engine === "postgres") {
    const client = new pg.Client({
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
      password: target.password,
      ssl: target.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: QUERY_TIMEOUT_MS,
    });
    await client.connect();
    try {
      return await fn(async (sql, params = []) => {
        let placeholder = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++placeholder}`);
        const result = await withQueryTimeout(client.query(pgSql, params), "Consulta");
        return (result.rows || []) as Record<string, unknown>[];
      });
    } finally {
      await client.end().catch(() => null);
    }
  }

  const connection = await mysql.createConnection({
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.user,
    password: target.password,
    ssl: target.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
  });
  try {
    return await fn(async (sql, params = []) => {
      const [rows] = await withQueryTimeout(connection.execute(sql, params), "Consulta");
      return (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    });
  } finally {
    await connection.end().catch(() => null);
  }
}

export async function testCityDatabase(target: WhitelistDbTarget) {
  const started = Date.now();
  await withCityDatabase(target, async (query) => {
    await query(target.engine === "postgres" ? "SELECT 1 AS ok" : "SELECT 1 AS ok");
  });
  return { ok: true, latencyMs: Date.now() - started };
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
}): WhitelistDbTarget {
  if (!input.host || !input.database || !input.user) {
    throw new Error("Informe o IP/host da VPS, o nome do banco e o usuario da integracao.");
  }
  const host = assertCityDbHost(input.host);
  const password = input.passwordOverride
    ? input.passwordOverride
    : decryptWhitelistSecret(input.passwordCipher, input.guildId);
  if (!password) {
    throw new Error("Senha do banco nao configurada.");
  }
  return {
    engine: input.engine,
    host,
    port: input.port,
    database: input.database,
    user: input.user,
    password,
    ssl: input.ssl,
  };
}
