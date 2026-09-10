import "server-only";

import { getLauncherStatusForGuild } from "@/lib/launcher/auth";
import { explainCityDbFailure } from "@/lib/servers/cityDbErrors";
import { XAMPP_BIND_HINT, probeCityDbPort } from "@/lib/servers/cityDbConnect";
import {
  applyWhitelistState,
  inspectCitySchema,
  isUnreachableDbError,
  sampleWhitelistMapping,
  sanitizeDbError,
  testCityDatabase,
  testWhitelistMapping,
  type WhitelistDbTarget,
} from "@/lib/servers/whitelistCityDb";
import {
  inferWhitelistMapping,
  normalizeWhitelistMapping,
  type WhitelistMapping,
} from "@/lib/servers/whitelistMapping";
import {
  enqueueWhitelistAgentJob,
  mappingPayload,
  waitForWhitelistAgentJob,
} from "@/lib/servers/whitelistAgentJobs";

export type CityWhitelistAction = "test" | "inspect" | "validate" | "approve" | "remove";

export type CityWhitelistResult = {
  ok: boolean;
  via: "direct" | "vps" | "flowdesk";
  host: string;
  port: number;
  message: string;
  title?: string;
  hint?: string;
  latencyMs?: number;
  hasVrpUsers?: boolean;
  tables?: unknown;
  inferred?: unknown;
  lookup?: unknown;
  playerKey?: string;
  currentValue?: string | null;
  previousValue?: string | null;
  nextValue?: string | null;
  state?: string;
  skipped?: boolean;
  code?: string;
};

function failureFromError(
  target: WhitelistDbTarget,
  via: "direct" | "vps",
  error: unknown,
): CityWhitelistResult {
  const sanitized = sanitizeDbError(error);
  const issue = explainCityDbFailure(error);
  return {
    ok: false,
    via,
    host: target.host,
    port: target.port,
    code: sanitized.code || issue.code,
    title: sanitized.title || issue.title,
    message: sanitized.message || issue.message,
    hint: sanitized.hint || issue.hint,
  };
}

function operationFor(action: CityWhitelistAction, identifierValue: string) {
  if (action === "inspect") return "INSPECT_SCHEMA" as const;
  if (action === "validate") return identifierValue ? ("TEST_MAPPING" as const) : ("INSPECT_SCHEMA" as const);
  if (action === "approve") return "APPROVE_WHITELIST" as const;
  if (action === "remove") return "REMOVE_WHITELIST" as const;
  return "TEST_CONNECTION" as const;
}

function mappingColumnsExist(mapping: WhitelistMapping, columns: Array<{ table: string; column: string }>) {
  const table = mapping.playerTable.toLowerCase();
  const idColumn = mapping.playerIdColumn.toLowerCase();
  const whitelistColumn = mapping.whitelistColumn.toLowerCase();
  return (
    columns.some((item) => item.table.toLowerCase() === table && item.column.toLowerCase() === idColumn) &&
    columns.some((item) => item.table.toLowerCase() === table && item.column.toLowerCase() === whitelistColumn)
  );
}

function viaMessage(via: "direct" | "vps", text: string) {
  return via === "vps" ? `Via VPS: ${text}` : text;
}

async function runDirect(
  action: CityWhitelistAction,
  target: WhitelistDbTarget,
  mapping: WhitelistMapping,
  identifierValue: string,
): Promise<Omit<CityWhitelistResult, "via" | "host" | "port">> {
  if (action === "test") {
    const result = await testCityDatabase(target);
    return {
      ok: true,
      message: `MySQL ok (${result.latencyMs}ms).`,
      latencyMs: result.latencyMs,
    };
  }
  if (action === "inspect") {
    const inspected = await inspectCitySchema(target);
    return {
      ok: true,
      message: inspected.inferred
        ? `Schema lido. ${inspected.inferred.notes?.[0] || "Confirme o mapping."}`
        : "Schema lido.",
      tables: inspected.tables,
      inferred: inspected.inferred,
    };
  }
  if (action === "validate") {
    const lookup = identifierValue
      ? await testWhitelistMapping(target, mapping, identifierValue)
      : await sampleWhitelistMapping(target, mapping);
    return {
      ok: lookup.ok !== false,
      message: lookup.message || (lookup.ok === false ? "Mapping invalido." : "Mapping validado."),
      lookup,
      playerKey: "playerKey" in lookup ? String(lookup.playerKey || "") : undefined,
      currentValue: "currentValue" in lookup ? lookup.currentValue : undefined,
      state: "state" in lookup ? String(lookup.state || "") : undefined,
      code: lookup.code,
    };
  }
  const applied = await applyWhitelistState({
    target,
    mapping,
    identifierValue,
    approve: action === "approve",
  });
  return {
    ok: applied.ok !== false,
    message: applied.message || (applied.ok === false ? "Falha ao aplicar." : "Whitelist atualizada."),
    lookup: applied,
    playerKey: "playerKey" in applied ? String(applied.playerKey || "") : undefined,
    currentValue: "currentValue" in applied ? applied.currentValue : undefined,
    previousValue: "previousValue" in applied ? applied.previousValue : undefined,
    nextValue: "nextValue" in applied ? applied.nextValue : undefined,
    state: "state" in applied ? String(applied.state || "") : undefined,
    skipped: "skipped" in applied ? Boolean(applied.skipped) : undefined,
    code: applied.code,
  };
}

function normalizeJobColumns(result: Record<string, unknown>) {
  const raw = Array.isArray(result.columns) ? result.columns : [];
  return raw
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        table: String(row.table || ""),
        column: String(row.column || ""),
        dataType: String(row.dataType || row.data_type || ""),
        nullable: row.nullable !== false,
      };
    })
    .filter((item) => item.table && item.column);
}

async function runViaVps(
  guildId: string,
  action: CityWhitelistAction,
  mapping: WhitelistMapping,
  identifierValue: string,
  target: WhitelistDbTarget,
): Promise<CityWhitelistResult> {
  const host = target.host;
  const port = target.port;
  const job = await enqueueWhitelistAgentJob({
    guildId,
    operation: operationFor(action, identifierValue),
    payload: {
      ...mappingPayload(mapping, identifierValue),
      cityDb: {
        engine: target.engine,
        host: "localhost",
        port: target.port,
        database: target.database,
        user: target.user,
        password: target.password,
      },
    },
  });
  const finished = await waitForWhitelistAgentJob(job.id, action === "test" ? 12000 : 28000, {
    pollMs: action === "test" ? 250 : 1000,
  });
  if (finished.status !== "done") {
    return {
      ok: false,
      via: "vps",
      host,
      port,
      code: "vps_timeout",
      message:
        finished.error_message ||
        "O launcher na VPS nao respondeu a tempo. Ele precisa ficar aberto; depois de instalar, sobe com o Windows e corrige o MySQL sozinho.",
    };
  }
  const result = (finished.result || {}) as Record<string, unknown>;
  if (result.ok === false) {
    const code = String(result.code || "db_error");
    const raw = String(result.message || "Falha no MySQL da VPS.");
    const message =
      code === "invalid_credentials"
        ? "O launcher recusou o usuario ou a senha do banco. Confira as credenciais e se o usuario existe no MariaDB da VPS."
        : raw;
    return {
      ok: false,
      via: "vps",
      host,
      port,
      code,
      message: viaMessage("vps", message),
    };
  }

  let inferred = result.inferred || null;
  const columns = normalizeJobColumns(result);
  if (!inferred && columns.length) {
    inferred = inferWhitelistMapping(columns);
  }

  if (action === "test") {
    const hasVrpUsers = result.hasVrpUsers === true;
    return {
      ok: true,
      via: "vps",
      host,
      port,
      hasVrpUsers,
      latencyMs: Number(result.latencyMs || 0) || undefined,
      message: viaMessage(
        "vps",
        mapping.playerTable
          ? `Banco ok nesta VPS (${Number(result.latencyMs || 0)}ms). Usando ${mapping.playerTable}.${mapping.whitelistColumn || "..."}.`
          : `Banco ok nesta VPS (${Number(result.latencyMs || 0)}ms). Defina a tabela e a coluna da whitelist.`,
      ),
    };
  }
  if (action === "inspect" || (action === "validate" && !identifierValue)) {
    if (action === "validate" && !columns.length) {
      return {
        ok: false,
        via: "vps",
        host,
        port,
        code: "mapping_invalid",
        message: viaMessage("vps", "O launcher leu o MySQL, mas o schema veio vazio. Confira o nome do banco skips."),
      };
    }
    if (action === "validate" && mapping.playerTable && !mappingColumnsExist(mapping, columns)) {
      return {
        ok: false,
        via: "vps",
        host,
        port,
        code: "mapping_invalid",
        message: viaMessage(
          "vps",
          `Nao achei ${mapping.playerTable}.${mapping.whitelistColumn} no MySQL da VPS.`,
        ),
      };
    }
    return {
      ok: true,
      via: "vps",
      host,
      port,
      tables: result.tables || [],
      inferred,
      lookup:
        action === "validate"
          ? {
              ok: true,
              message: "Mapping confirmado no schema da VPS.",
              playerKey: "",
              currentValue: null,
              state: "unknown",
            }
          : undefined,
      message: viaMessage(
        "vps",
        action === "validate"
          ? `Mapping ok: ${mapping.playerTable}.${mapping.whitelistColumn} (NULL -> ${mapping.valueOn}).`
          : inferred && typeof inferred === "object" && "notes" in inferred
            ? String((inferred as { notes?: string[] }).notes?.[0] || "Schema lido.")
            : "Schema lido.",
      ),
    };
  }
  return {
    ok: true,
    via: "vps",
    host,
    port,
    lookup: result,
    playerKey: result.playerKey ? String(result.playerKey) : undefined,
    currentValue: result.currentValue == null ? null : String(result.currentValue),
    previousValue: result.previousValue == null ? null : String(result.previousValue),
    nextValue: result.nextValue == null ? null : String(result.nextValue),
    state: result.state ? String(result.state) : undefined,
    skipped: result.skipped === true,
    message: viaMessage(
      "vps",
      action === "validate"
        ? "Mapping validado no MySQL da VPS."
        : "Whitelist atualizada no MySQL da VPS.",
    ),
  };
}

function xamppUnreachable(target: WhitelistDbTarget): CityWhitelistResult {
  return {
    ok: false,
    via: "direct",
    host: target.host,
    port: target.port,
    code: "timeout",
    title: "O MySQL do XAMPP so aceita conexao local",
    message:
      "O servico esta ligado na VPS, mas a porta 3306 nao responde pela internet. O HeidiSQL na propria maquina nao prova o acesso remoto.",
    hint: XAMPP_BIND_HINT,
  };
}

export async function runCityWhitelistAction(input: {
  guildId: string;
  action: CityWhitelistAction;
  target: WhitelistDbTarget;
  mapping?: unknown;
  identifierValue?: string;
  persistDirectOnly?: boolean;
}): Promise<CityWhitelistResult> {
  const mapping = normalizeWhitelistMapping(input.mapping);
  const identifierValue = String(input.identifierValue || "").trim();
  const allowLauncher = input.persistDirectOnly !== true || input.action === "test";

  const finishDirect = async () => {
    const direct = await runDirect(input.action, input.target, mapping, identifierValue);
    return {
      ...direct,
      via: "direct" as const,
      host: input.target.host,
      port: input.target.port,
      message: viaMessage("direct", direct.message),
    };
  };

  if (allowLauncher) {
    const launcher = await getLauncherStatusForGuild(input.guildId);
    if (launcher.online) {
      try {
        const first = await runViaVps(
          input.guildId,
          input.action,
          mapping,
          identifierValue,
          input.target,
        );
        if (first.ok) return first;
        if (first.code !== "invalid_credentials" && first.code !== "missing_credentials" && input.action !== "test") {
          return first;
        }
      } catch (error) {
        if (input.action !== "test") return failureFromError(input.target, "vps", error);
      }
    }
  }

  const probe = await probeCityDbPort(input.target.host, input.target.port, 700);
  let lastError: unknown = probe.open
    ? null
    : new Error(`Porta ${input.target.port} em ${input.target.host} esta fechada.`);

  if (probe.open) {
    try {
      return await finishDirect();
    } catch (error) {
      lastError = error;
      if (input.action !== "test" && !isUnreachableDbError(error)) {
        return failureFromError(input.target, "direct", error);
      }
    }
  }

  if (input.action === "test") {
    const launcher = await getLauncherStatusForGuild(input.guildId);
    if (!launcher.online) {
      return {
        ok: false,
        via: "vps",
        host: input.target.host,
        port: input.target.port,
        code: "launcher_offline",
        title: "Abra o launcher na VPS",
        message:
          "O launcher precisa ficar aberto nesta VPS para falar com o MySQL em localhost. Depois de instalar, ele sobe com o Windows sozinho.",
        hint: "Instale o Setup na VPS, entre com a Flowdesk e deixe o app na bandeja. Ele liga o XAMPP/MySQL se estiver apagado.",
      };
    }
    return {
      ok: false,
      via: "vps",
      host: input.target.host,
      port: input.target.port,
      code: "offline",
      title: "O launcher esta corrigindo o MySQL",
      message:
        "A VPS respondeu, mas o MySQL local ainda nao abriu. O launcher tenta ligar o XAMPP e criar o usuario sozinho.",
      hint: "No launcher, clique em Corrigir MySQL se o banco continuar apagado. Nao precisa abrir a porta 3306 na internet.",
    };
  }

  return lastError ? failureFromError(input.target, "direct", lastError) : xamppUnreachable(input.target);
}
