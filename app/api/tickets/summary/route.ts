import { NextResponse } from "next/server";
import { buildPublicApiErrorResponse } from "@/lib/security/apiResponses";
import { createSecurityRequestContext } from "@/lib/security/requestSecurity";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getCount(status: "open" | "closed", guildId?: string) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    throw new Error("tickets_summary_database_unavailable");
  }

  let query = supabase
    .from("tickets")
    .select("id", { head: true, count: "exact" })
    .eq("status", status);

  if (guildId) {
    query = query.eq("guild_id", guildId);
  }

  const result = await query;

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.count || 0;
}

export async function GET(request: Request) {
  const requestContext = createSecurityRequestContext(request);
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const [open, closed] = await Promise.all([
      getCount("open", guildId),
      getCount("closed", guildId),
    ]);

    return NextResponse.json({
      ok: true,
      guildId: guildId || null,
      totals: { open, closed },
    });
  } catch (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Erro ao consultar resumo de tickets.",
      status: 500,
      code: "tickets_summary_unavailable",
    });
  }
}
