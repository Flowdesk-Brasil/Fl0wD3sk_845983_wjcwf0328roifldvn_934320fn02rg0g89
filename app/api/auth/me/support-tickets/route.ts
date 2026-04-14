import { NextResponse } from "next/server";
import { resolveSessionAccessToken } from "@/lib/auth/discordGuildAccess";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders } from "@/lib/security/http";

import { OFFICIAL_DISCORD_GUILD_ID } from "@/lib/discordLink/config";

export async function GET() {
  const sessionData = await resolveSessionAccessToken();
  if (!sessionData?.authSession) {
    console.error("[Tickets API] No session found");
    return NextResponse.json({ ok: false, message: "Não autorizado" }, { status: 401 });
  }

  const discordUserId = sessionData.authSession.user.discord_user_id;
  const supabase = getSupabaseAdminClientOrThrow();
  
  const { data, error } = await supabase
    .from("tickets")
    .select(`
      id, protocol, status, guild_id, opened_at, closed_at, transcript_file, opened_reason, closed_by,
      ticket_transcripts!ticket_id (
        access_code
      )
    `)
    .eq("user_id", discordUserId)
    .eq("guild_id", OFFICIAL_DISCORD_GUILD_ID)
    .order("opened_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(`[Tickets API] Database error for user ${discordUserId}:`, error);
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const tickets = (data || []).map(ticket => {
    // Supabase can return joined data as an array or a single object depending on constraints
    const transcripts = (ticket as any).ticket_transcripts;
    const access_code = Array.isArray(transcripts) 
      ? transcripts[0]?.access_code 
      : transcripts?.access_code;

    return {
      ...ticket,
      access_code: access_code || null,
      ticket_transcripts: undefined
    };
  });

  return applyNoStoreHeaders(NextResponse.json({ 
    ok: true, 
    tickets,
    debug_user_id: discordUserId,
    count: tickets.length
  }));
}
