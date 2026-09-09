import net from "node:net";
import mysql from "mysql2/promise";
import pg from "pg";
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

export type WhitelistDbTarget = {
  engine: WhitelistDbEngine;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

const CONNECT_TIMEOUT_MS = 12_000;
const QUERY_TIMEOUT_MS = 12_000;

function settleMaybePromise<T>(value: Promise<T> | T | undefined | null) {
  if (value == null || typeof (value as Promise<T>).then !== "function") {
    return Promise.resolve();
  }
  return (value as Promise<T>).catch(() => null);
}

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
  if (lowered.includes("unknown database")) {
    return { code: "unknown_database", message: "O nome do banco nao existe neste MySQL." };
  }
  if (lowered.includes("timeout") || lowered.includes("timed out") || lowered.includes("etimedout")) {
    return { code: "timeout", message: "O banco da cidade nao respondeu a tempo." };
  }
  if (
    lowered.includes("envelope") ||
    lowered.includes("senha salva") ||
    lowered.includes("digite a senha")
  ) {
    return {
      code: "password_envelope",
      message: "Digite a senha do banco novamente no campo Senha e teste. A senha salva nao pode ser lida.",
    };
  }
  if (lowered.includes("nao chegaram no launcher") || lowered.includes("digite a senha no painel")) {
    return {
      code: "missing_credentials",
      message: "Digite a senha do MySQL no painel e clique em Conectar banco.",
    };
  }
  if (lowered.includes("plugin") || lowered.includes("caching_sha2") || lowered.includes("not supported auth")) {
    return {
      code: "auth_plugin",
      message: "O MySQL recusou o plugin de autenticacao. No HeidiSQL, altere o usuario para mysql_native_password.",
    };
  }
  if (lowered.includes("access denied") || lowered.includes("er_access_denied")) {
    return {
      code: "invalid_credentials",
      message:
        "O MySQL recusou o usuario. Use no painel o mesmo usuario e senha do HeidiSQL nesta VPS (muitas vezes e root).",
    };
  }
  if (
    lowered.includes("enotfound") ||
    lowered.includes("econnrefused") ||
    lowered.includes("ehostunreach") ||
    lowered.includes("eai_again")
  ) {
    return {
      code: "offline",
      message:
        "A porta do MySQL esta fechada da internet. Na primeira configuracao, abra o launcher na VPS para liberar o acesso. Depois a whitelist usa o banco direto.",
    };
  }
  if (lowered.includes("not allowed") || lowered.includes("host is not allowed") || lowered.includes("is not allowed to connect")) {
    return {
      code: "ip_not_allowed",
      message:
        "O MySQL recusou o IP remoto. No modo VPS o launcher usa o banco local da maquina e nao precisa liberar host.",
    };
  }
  if (
    lowered.includes("reading 'catch'") ||
    lowered.includes('reading "catch"') ||
    lowered.includes("reading catch")
  ) {
    return {
      code: "offline",
      message: "Falha ao finalizar a conexao com o banco. O sistema reconecta automaticamente.",
    };
  }
  return { code: "db_error", message: message.slice(0, 180) || "Nao foi possivel executar a operacao no banco da cidade." };
}

export function isUnreachableDbError(error: unknown) {
  const code = sanitizeDbError(error).code;
  return code === "offline" || code === "timeout";
}

export async function probeCityDbPort(host: string, port: number, timeoutMs = 2500) {
  const started = Date.now();
  return new Promise<{ open: boolean; ms: number; error?: string }>((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const finish = (open: boolean, error?: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ open, ms: Date.now() - started, error });
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (error) => finish(false, error.message));
  });
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
        const result = (await withQueryTimeout(client.query(pgSql, params), "Consulta")) as {
          rows?: Record<string, unknown>[];
        };
        return (result.rows || []) as Record<string, unknown>[];
      });
    } finally {
      await settleMaybePromise(client.end());
    }
  }

  const connection = await connectRemoteMysql(target);
  try {
    return await fn(async (sql, params = []) => {
      const [rows] = await withQueryTimeout(
        connection.query(sql, params as never[]),
        "Consulta",
      );
      return (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    });
  } finally {
    await settleMaybePromise(connection.end());
  }
}

async function connectRemoteMysql(target: WhitelistDbTarget) {
  const database = String(target.database || "").replace(/[`\\]/g, "");
  const ports = [...new Set([Number(target.port || 3306), 3306].filter((value) => value >= 1))];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const port of ports) {
      try {
        const connection = await mysql.createConnection({
          host: target.host,
          port,
          user: target.user,
          password: target.password || "",
          connectTimeout: CONNECT_TIMEOUT_MS,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10_000,
          insecureAuth: true,
          charset: "utf8mb4",
        });
        if (database) {
          try {
            await connection.query(`USE \`${database}\``);
          } catch (error) {
            await settleMaybePromise(connection.end());
            throw error;
          }
        }
        return connection;
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Nao foi possivel abrir o MySQL da cidade.");
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
