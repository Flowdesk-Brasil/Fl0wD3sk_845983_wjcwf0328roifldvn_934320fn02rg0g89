import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  isWhitelistAgentOperation,
  sleep,
  type WhitelistAgentOperation,
} from "@/lib/servers/whitelistAgent";
import { normalizeWhitelistMapping } from "@/lib/servers/whitelistMapping";

type JobRow = {
  id: number;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
};

export async function enqueueWhitelistAgentJob(input: {
  guildId: string;
  operation: WhitelistAgentOperation;
  payload?: Record<string, unknown>;
  requestId?: number | null;
}) {
  if (!isWhitelistAgentOperation(input.operation)) {
    throw new Error("Operacao do Agent invalida.");
  }
  const supabase = getSupabaseAdminClientOrThrow();
  const inserted = await supabase
    .from("guild_whitelist_agent_jobs")
    .insert({
      guild_id: input.guildId,
      request_id: input.requestId || null,
      operation: input.operation,
      payload: input.payload || {},
      status: "queued",
      discord_synced: !input.requestId,
    })
    .select("id, status")
    .single();
  if (inserted.error && String(inserted.error.message || "").includes("discord_synced")) {
    const retry = await supabase
      .from("guild_whitelist_agent_jobs")
      .insert({
        guild_id: input.guildId,
        request_id: input.requestId || null,
        operation: input.operation,
        payload: input.payload || {},
        status: "queued",
      })
      .select("id, status")
      .single();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data as { id: number; status: string };
  }
  if (inserted.error) {
    throw new Error(inserted.error.message);
  }
  return inserted.data as { id: number; status: string };
}

export async function waitForWhitelistAgentJob(jobId: number, timeoutMs = 28000) {
  const supabase = getSupabaseAdminClientOrThrow();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = await supabase
      .from("guild_whitelist_agent_jobs")
      .select("id, status, result, error_message")
      .eq("id", jobId)
      .maybeSingle();
    const row = current.data as JobRow | null;
    if (row && (row.status === "done" || row.status === "failed")) {
      return row;
    }
    await sleep(1000);
  }
  return {
    id: jobId,
    status: "queued",
    result: null,
    error_message:
      "O Agent nao respondeu a tempo. Instale o launcher na VPS, deixe-o aberto e tente de novo.",
  } satisfies JobRow;
}

export function mappingPayload(mapping: unknown, identifierValue?: string) {
  return {
    mapping: normalizeWhitelistMapping(mapping),
    identifierValue: String(identifierValue || "").trim(),
  };
}
