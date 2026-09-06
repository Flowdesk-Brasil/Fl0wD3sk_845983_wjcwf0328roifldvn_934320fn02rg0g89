import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import {
  getEffectiveDashboardPermissions,
  type TeamRolePermission,
} from "@/lib/teams/userTeams";

const ACCESS_CACHE_TTL_MS = 45_000;

type AccessCacheEntry = {
  expiresAt: number;
  ok: boolean;
  status: number;
  message: string;
};

const accessCache = new Map<string, AccessCacheEntry>();

function readAccessCache(key: string) {
  const cached = accessCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    accessCache.delete(key);
    return null;
  }
  return cached;
}

function writeAccessCache(key: string, entry: Omit<AccessCacheEntry, "expiresAt">) {
  accessCache.set(key, {
    ...entry,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
  });
}

export async function ensureDashboardModuleAccess(
  guildId: string,
  requiredPermission: TeamRolePermission,
) {
  if (!isGuildId(guildId)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Guild ID invalido." },
        { status: 400 },
      ),
    };
  }

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

  const cacheKey = `${sessionData.authSession.user.id}:${guildId}:${requiredPermission}`;
  const cached = readAccessCache(cacheKey);
  if (cached) {
    if (cached.ok) return { ok: true as const };
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: cached.message },
        { status: cached.status },
      ),
    };
  }

  const { permissions: dashboardPerms, isTeamServer } =
    await getEffectiveDashboardPermissions({
      authUserId: sessionData.authSession.user.id,
      guildId,
    });

  const hasFullAccess = dashboardPerms === "full";
  const hasSpecificPerm =
    dashboardPerms instanceof Set && dashboardPerms.has(requiredPermission);

  if (hasFullAccess || hasSpecificPerm) {
    writeAccessCache(cacheKey, { ok: true, status: 200, message: "" });
    return { ok: true as const };
  }

  if (!isTeamServer) {
    const accessibleGuild = await assertUserAdminInGuildOrNull(
      {
        authSession: sessionData.authSession,
        accessToken: sessionData.accessToken,
      },
      guildId,
    );

    if (accessibleGuild) {
      writeAccessCache(cacheKey, { ok: true, status: 200, message: "" });
      return { ok: true as const };
    }
  }

  writeAccessCache(cacheKey, {
    ok: false,
    status: 403,
    message: "Voce nao possui permissao para gerenciar este modulo.",
  });

  return {
    ok: false as const,
    response: NextResponse.json(
      {
        ok: false,
        message: "Voce nao possui permissao para gerenciar este modulo.",
      },
      { status: 403 },
    ),
  };
}
