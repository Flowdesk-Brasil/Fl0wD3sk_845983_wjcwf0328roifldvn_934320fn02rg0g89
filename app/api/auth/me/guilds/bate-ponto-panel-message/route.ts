import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { getEffectiveDashboardPermissions } from "@/lib/teams/userTeams";
import { cleanupExpiredUnpaidServerSetups } from "@/lib/payments/setupCleanup";
import { getGuildLicenseStatusForUser } from "@/lib/payments/licenseStatus";
import {
  ensureSameOriginJsonMutationRequest,
  applyNoStoreHeaders,
} from "@/lib/security/http";
import { dispatchBatePontoPanelMessage } from "@/lib/servers/dispatchBatePontoPanelMessage";
import {
  createServerSaveDiagnosticContext,
  recordServerSaveDiagnostic,
  resolveServerSaveAccessMode,
} from "@/lib/servers/serverSaveDiagnostics";
import {
  extractAuditErrorMessage,
  sanitizeErrorMessage,
} from "@/lib/security/errors";
import {
  normalizeBatePontoPanelLayout,
  ticketPanelLayoutHasAtMostOneFunctionButton,
  ticketPanelLayoutHasRequiredParts,
} from "@/lib/servers/ticketPanelBuilder";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";

export async function POST(request: Request) {
  const invalidMutationResponse = ensureSameOriginJsonMutationRequest(request);
  if (invalidMutationResponse) {
    return applyNoStoreHeaders(invalidMutationResponse);
  }

  let diagnostic = createServerSaveDiagnosticContext("bate_ponto_panel_dispatch");

  try {
    let body: {
      guildId: string;
      panelChannelId: string;
      panelLayout: Record<string, unknown>[];
    };

    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          guildId: flowSecureDto.discordSnowflake(),
          panelChannelId: flowSecureDto.discordSnowflake(),
          panelLayout: flowSecureDto.array(flowSecureDto.record()),
        },
        { rejectUnknown: true },
      );
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) throw error;
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    const guildId = body.guildId;
    const panelChannelId = body.panelChannelId;
    const panelLayout = normalizeBatePontoPanelLayout(body.panelLayout);
    diagnostic = createServerSaveDiagnosticContext(
      "bate_ponto_panel_dispatch",
      guildId,
    );

    if (!isGuildId(guildId) || !isGuildId(panelChannelId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID ou canal informados sao invalidos." },
          { status: 400 },
        ),
      );
    }

    if (
      !panelLayout.length ||
      !ticketPanelLayoutHasRequiredParts(panelLayout) ||
      !ticketPanelLayoutHasAtMostOneFunctionButton(panelLayout)
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Adicione pelo menos um conteudo com texto e uma acao antes de enviar o embed.",
          },
          { status: 400 },
        ),
      );
    }

    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession || !sessionData.accessToken) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
      );
    }

    const authUserId = sessionData.authSession.user.id;
    const { permissions: dashboardPerms, isTeamServer } =
      await getEffectiveDashboardPermissions({ authUserId, guildId });
    const accessibleGuild = await assertUserAdminInGuildOrNull(
      {
        authSession: sessionData.authSession,
        accessToken: sessionData.accessToken,
      },
      guildId,
    );
    const canManage =
      dashboardPerms === "full" ||
      (dashboardPerms instanceof Set &&
        dashboardPerms.has("server_manage_bate_ponto_message")) ||
      (!isTeamServer && accessibleGuild);

    if (!canManage) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: "Voce nao possui permissao para gerenciar este modulo.",
          },
          { status: 403 },
        ),
      );
    }

    const licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId, {
      forceFresh: true,
    });
    if (licenseStatus === "expired" || licenseStatus === "off") {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Servidor com plano expirado/desligado. Renove o pagamento para enviar o embed.",
          },
          { status: 403 },
        ),
      );
    }

    if (licenseStatus === "not_paid") {
      const cleanupSummary = await cleanupExpiredUnpaidServerSetups({
        userId: authUserId,
        guildId,
        source: "guild_bate_ponto_panel_dispatch_post",
      });
      if (cleanupSummary.cleanedGuildIds.includes(guildId)) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              ok: false,
              message:
                "A configuracao desse servidor expirou apos 30 minutos sem pagamento.",
            },
            { status: 409 },
          ),
        );
      }
    }

    const dispatchResult = await dispatchBatePontoPanelMessage({
      guildId,
      panelChannelId,
      panelLayout,
    });

    if (!dispatchResult.ok) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: dispatchResult.message },
          { status: 400 },
        ),
      );
    }

    recordServerSaveDiagnostic({
      context: diagnostic,
      authUserId,
      accessMode: resolveServerSaveAccessMode({
        accessibleGuild,
        hasTeamAccess: isTeamServer,
      }),
      licenseStatus,
      outcome: "saved",
      httpStatus: 200,
      detail:
        dispatchResult.mode === "updated"
          ? "Embed de bate ponto atualizado com sucesso."
          : "Embed de bate ponto enviado com sucesso.",
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        mode: dispatchResult.mode,
        channelId: dispatchResult.channelId,
        messageId: dispatchResult.messageId,
      }),
    );
  } catch (error) {
    recordServerSaveDiagnostic({
      context: diagnostic,
      outcome: "failed",
      httpStatus: 500,
      detail: extractAuditErrorMessage(
        error,
        "Erro ao enviar o embed de bate ponto.",
      ),
    });
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao enviar o embed de bate ponto.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
