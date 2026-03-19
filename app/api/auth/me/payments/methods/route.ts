import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { isValidSavedMethodId } from "@/lib/payments/savedMethods";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type DeleteMethodBody = {
  guildId?: unknown;
  methodId?: unknown;
};

type GuildPlanSettingsRecord = {
  recurring_enabled: boolean;
  recurring_method_id: string | null;
};

function normalizeGuildId(value: unknown) {
  if (typeof value !== "string") return null;
  const guildId = value.trim();
  return isGuildId(guildId) ? guildId : null;
}

function normalizeMethodId(value: unknown) {
  if (!isValidSavedMethodId(value)) return null;
  if (typeof value !== "string") return null;
  return value.trim();
}

async function ensureGuildAccess(guildId: string) {
  const sessionData = await resolveSessionAccessToken();
  if (!sessionData?.authSession) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      ),
    };
  }

  if (!sessionData.accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Token OAuth ausente na sessao." },
        { status: 401 },
      ),
    };
  }

  if (sessionData.authSession.activeGuildId === guildId) {
    return {
      ok: true as const,
      context: {
        sessionData,
      },
    };
  }

  let accessibleGuild = null;
  try {
    accessibleGuild = await assertUserAdminInGuildOrNull(
      {
        authSession: sessionData.authSession,
        accessToken: sessionData.accessToken,
      },
      guildId,
    );
  } catch {
    accessibleGuild = null;
  }

  if (!accessibleGuild && sessionData.authSession.activeGuildId !== guildId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Servidor nao encontrado para este usuario." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    context: {
      sessionData,
    },
  };
}

export async function DELETE(request: Request) {
  try {
    let body: DeleteMethodBody = {};
    try {
      body = (await request.json()) as DeleteMethodBody;
    } catch {
      return NextResponse.json(
        { ok: false, message: "Payload JSON invalido." },
        { status: 400 },
      );
    }

    const guildId = normalizeGuildId(body.guildId);
    const methodId = normalizeMethodId(body.methodId);

    if (!guildId) {
      return NextResponse.json(
        { ok: false, message: "Guild ID invalido." },
        { status: 400 },
      );
    }

    if (!methodId) {
      return NextResponse.json(
        { ok: false, message: "Metodo de pagamento invalido." },
        { status: 400 },
      );
    }

    const access = await ensureGuildAccess(guildId);
    if (!access.ok) return access.response;

    const userId = access.context.sessionData.authSession.user.id;
    const supabase = getSupabaseAdminClientOrThrow();

    const planSettingsResult = await supabase
      .from("guild_plan_settings")
      .select("recurring_enabled, recurring_method_id")
      .eq("user_id", userId)
      .eq("guild_id", guildId)
      .maybeSingle<GuildPlanSettingsRecord>();

    if (planSettingsResult.error) {
      throw new Error(planSettingsResult.error.message);
    }

    const planSettings = planSettingsResult.data || null;
    if (
      planSettings?.recurring_enabled &&
      planSettings.recurring_method_id === methodId
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nao e possivel remover este cartao enquanto a cobranca recorrente deste servidor estiver ativa.",
        },
        { status: 409 },
      );
    }

    const upsertResult = await supabase
      .from("auth_user_hidden_payment_methods")
      .upsert(
        {
          user_id: userId,
          method_id: methodId,
          deleted_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,method_id",
        },
      )
      .select("id")
      .single<{ id: number }>();

    if (upsertResult.error || !upsertResult.data) {
      throw new Error(upsertResult.error?.message || "Falha ao remover metodo.");
    }

    return NextResponse.json({
      ok: true,
      guildId,
      methodId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao remover metodo de pagamento.",
      },
      { status: 500 },
    );
  }
}
