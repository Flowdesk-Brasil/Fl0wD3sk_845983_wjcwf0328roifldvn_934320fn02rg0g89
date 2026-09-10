import "server-only";

import net from "node:net";
import mysql from "mysql2/promise";
import pg from "pg";
export type CityDbTarget = {
  engine: "mysql" | "mariadb" | "postgres";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

const HANDSHAKE_MS = 3_200;
const QUERY_MS = 4_000;
const PORT_PROBE_MS = 700;

export const XAMPP_BIND_HINT =
  "No XAMPP, o MySQL quase sempre escuta so 127.0.0.1. Em Config > my.ini troque bind-address=127.0.0.1 por bind-address=0.0.0.0, reinicie o MySQL e libere a porta 3306 no firewall do Windows. Ou deixe o launcher aberto so nesta conexao, que ele fala com o banco em localhost.";

async function settleMaybePromise(value: unknown) {
  try {
    await value;
  } catch {
    /* close/release can return void */
  }
}

function timeoutError(label: string) {
  const error = new Error(`${label} excedeu o tempo limite.`);
  error.name = "ETIMEDOUT";
  (error as Error & { code: string }).code = "ETIMEDOUT";
  return error;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError(label)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function probeCityDbPort(host: string, port: number, timeoutMs = PORT_PROBE_MS) {
  const started = Date.now();
  return new Promise<{ open: boolean; ms: number; error?: string }>((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs, family: 4 });
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

function mysqlConfig(target: CityDbTarget, port: number, withDatabase: boolean) {
  const database = String(target.database || "").replace(/[`\\]/g, "");
  return {
    host: target.host,
    port,
    user: target.user,
    password: target.password || "",
    database: withDatabase && database ? database : undefined,
    connectTimeout: HANDSHAKE_MS,
    enableKeepAlive: true,
    keepAliveInitialDelay: 3_000,
    insecureAuth: true,
    charset: "utf8mb4" as const,
    dateStrings: true,
    ssl: target.ssl ? { rejectUnauthorized: false } : undefined,
  };
}

async function openMysqlConnection(target: CityDbTarget) {
  const ports = [...new Set([Number(target.port || 3306), 3306].filter((value) => value >= 1))];
  let lastError: unknown = null;

  for (const port of ports) {
    const probe = await probeCityDbPort(target.host, port, PORT_PROBE_MS);
    if (!probe.open) {
      lastError = timeoutError(`Porta ${port} em ${target.host}`);
      continue;
    }

    for (const withDatabase of [true, false]) {
      let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
      try {
        connection = await withTimeout(
          mysql.createConnection(mysqlConfig(target, port, withDatabase)),
          HANDSHAKE_MS,
          "Handshake MySQL",
        );
        await withTimeout(connection.query("SELECT 1 AS ok"), QUERY_MS, "Ping MySQL");
        if (!withDatabase && target.database) {
          const database = String(target.database).replace(/[`\\]/g, "");
          await withTimeout(connection.query(`USE \`${database}\``), QUERY_MS, "USE database");
        }
        return connection;
      } catch (error) {
        lastError = error;
        if (connection) await settleMaybePromise(connection.end());
      }
    }
  }

  throw lastError instanceof Error ? lastError : timeoutError("MySQL da cidade");
}

async function openPostgresConnection(target: CityDbTarget) {
  const client = new pg.Client({
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.user,
    password: target.password,
    ssl: target.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: HANDSHAKE_MS,
    statement_timeout: QUERY_MS,
  });
  await withTimeout(client.connect(), HANDSHAKE_MS, "Handshake Postgres");
  return client;
}

export async function withCityDatabase<T>(
  target: CityDbTarget,
  fn: (query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
) {
  if (target.engine === "postgres") {
    const client = await openPostgresConnection(target);
    try {
      return await fn(async (sql, params = []) => {
        let placeholder = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++placeholder}`);
        const result = (await withTimeout(client.query(pgSql, params), QUERY_MS, "Consulta")) as {
          rows?: Record<string, unknown>[];
        };
        return (result.rows || []) as Record<string, unknown>[];
      });
    } finally {
      await settleMaybePromise(client.end());
    }
  }

  const connection = await openMysqlConnection(target);
  try {
    return await fn(async (sql, params = []) => {
      const [rows] = await withTimeout(connection.query(sql, params as never[]), QUERY_MS, "Consulta");
      return (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    });
  } finally {
    await settleMaybePromise(connection.end());
  }
}

export async function testCityDatabase(target: CityDbTarget) {
  const started = Date.now();
  await withCityDatabase(target, async (query) => {
    await query("SELECT 1 AS ok");
  });
  return { ok: true as const, latencyMs: Date.now() - started };
}
