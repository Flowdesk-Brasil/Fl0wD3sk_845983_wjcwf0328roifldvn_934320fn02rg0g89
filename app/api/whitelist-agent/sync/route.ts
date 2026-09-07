import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  hashWhitelistAgentToken,
  isWhitelistAgentOperation,
  tokensMatch,
} from "@/lib/servers/whitelistAgent";
import { normalizeWhitelistMapping } from "@/lib/servers/whitelistMapping";

const lastCall = new Map<string, number>();

function tooSoon(publicId: string) {
  const now = Date.now();
  const previous = lastCall.get(publicId) || 0;
  if (now - previous < 1500) return true;
  lastCall.set(publicId, now);
  return false;
}

function isPublicIp(value: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[a-z0-9.-]{3,64}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const publicId = String(body.publicId || "").trim();
    const token = String(body.token || "").trim();
    if (!publicId.startsWith("fdwa_") || publicId.length > 80 || token.length < 16) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Credencial do Agent invalida." }, { status: 401 }),
      );
    }
    if (tooSoon(publicId) && (!Array.isArray(body.results) || body.results.length === 0)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: true, message: "Aguarde.", jobs: [] }),
      );
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const settings = await supabase
      .from("guild_whitelist_settings")
      .select(
        "guild_id, mapping, mapping_status, agent_token_hash, connection_mode",
      )
      .eq("agent_public_id", publicId)
      .maybeSingle();

    if (!settings.data?.agent_token_hash) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Agent nao pareado." }, { status: 401 }),
      );
    }
    if (!tokensMatch(settings.data.agent_token_hash, hashWhitelistAgentToken(token))) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Token do Agent invalido." }, { status: 401 }),
      );
    }

    const guildId = String(settings.data.guild_id);
    const status = body.status && typeof body.status === "object"
      ? (body.status as Record<string, unknown>)
      : {};
    const publicIp = isPublicIp(String(status.publicIp || ""))
      ? String(status.publicIp)
      : null;

    const healthUpdate = await supabase
      .from("guild_whitelist_settings")
      .update({
        agent_last_seen_at: new Date().toISOString(),
        agent_public_ip: publicIp,
      })
      .eq("guild_id", guildId);
    if (healthUpdate.error) {
      await supabase
        .from("guild_whitelist_settings")
        .update({
          agent_last_seen_at: new Date().toISOString(),
        })
        .eq("guild_id", guildId);
    }

    const incomingResults = Array.isArray(body.results) ? body.results : [];
    for (const item of incomingResults.slice(0, 8)) {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const jobId = Number(record.id);
      if (!Number.isFinite(jobId)) continue;
      const job = await supabase
        .from("guild_whitelist_agent_jobs")
        .select("id, guild_id, request_id, operation, status")
        .eq("id", jobId)
        .eq("guild_id", guildId)
        .maybeSingle();
      if (!job.data || (job.data.status !== "claimed" && job.data.status !== "queued")) continue;

      const ok = record.ok !== false;
      const result =
        record.result && typeof record.result === "object"
          ? (record.result as Record<string, unknown>)
          : {};
      await supabase
        .from("guild_whitelist_agent_jobs")
        .update({
          status: ok ? "done" : "failed",
          result,
          error_message: ok ? null : String(record.errorMessage || result.message || "Falha no Agent."),
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("guild_id", guildId);

      if (job.data.request_id && isWhitelistAgentOperation(String(job.data.operation))) {
        const operation = String(job.data.operation);
        const approve = operation === "APPROVE_WHITELIST";
        const remove = operation === "REMOVE_WHITELIST";
        if (approve || remove) {
          await supabase
            .from("guild_whitelist_requests")
            .update({
              status: ok ? (approve ? "approved" : "denied") : "apply_failed",
              apply_error: ok ? null : String(record.errorMessage || result.message || "Falha no Agent."),
              player_key: result.playerKey ? String(result.playerKey) : null,
              previous_whitelist_value: result.previousValue == null ? null : String(result.previousValue),
              next_whitelist_value: result.nextValue == null ? null : String(result.nextValue),
              applied_at: ok ? new Date().toISOString() : null,
            })
            .eq("id", job.data.request_id)
            .eq("guild_id", guildId);
        }
      }
    }

    const staleCutoff = new Date(Date.now() - 120_000).toISOString();
    await supabase
      .from("guild_whitelist_agent_jobs")
      .update({ status: "queued", claimed_at: null })
      .eq("guild_id", guildId)
      .eq("status", "claimed")
      .lt("claimed_at", staleCutoff);

    const jobs: Array<Record<string, unknown>> = [];
    if (body.claim !== false) {
      const queued = await supabase
        .from("guild_whitelist_agent_jobs")
        .select("id, operation, payload, request_id")
        .eq("guild_id", guildId)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(5);
      const mapping = normalizeWhitelistMapping(settings.data.mapping);
      for (const job of queued.data || []) {
        await supabase
          .from("guild_whitelist_agent_jobs")
          .update({ status: "claimed", claimed_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("guild_id", guildId)
          .eq("status", "queued");
        const payload =
          job.payload && typeof job.payload === "object"
            ? (job.payload as Record<string, unknown>)
            : {};
        jobs.push({
          id: job.id,
          operation: job.operation,
          payload: {
            ...payload,
            mapping: payload.mapping || mapping,
          },
        });
      }
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        message: jobs.length ? `Ha ${jobs.length} job(s) para executar.` : "Conectado. Sem jobs no momento.",
        jobs,
      }),
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Falha no sync do Agent." }, { status: 500 }),
    );
  }
}
