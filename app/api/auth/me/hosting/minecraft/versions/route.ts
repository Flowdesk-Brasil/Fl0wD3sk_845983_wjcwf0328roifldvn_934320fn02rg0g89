import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";

type MinecraftVersionManifest = {
  latest?: {
    release?: string;
    snapshot?: string;
  };
  versions?: Array<{
    id?: string;
    type?: string;
    releaseTime?: string;
  }>;
};

const MOJANG_VERSION_MANIFEST_URL =
  "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
const MIN_SUPPORTED_VERSION = [1, 8, 0] as const;
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedVersions:
  | {
      expiresAt: number;
      payload: {
        recommendedVersion: string;
        versions: Array<{ id: string; label: string; recommended: boolean }>;
      };
    }
  | null = null;

const FALLBACK_RELEASES = [
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.17.1",
  "1.16.5",
  "1.15.2",
  "1.14.4",
  "1.13.2",
  "1.12.2",
  "1.11.2",
  "1.10.2",
  "1.9.4",
  "1.8.9",
  "1.8",
];

function parseReleaseVersion(id: string) {
  const match = id.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3] || 0),
  ] as const;
}

function isAtLeastMinVersion(id: string) {
  const parsed = parseReleaseVersion(id);
  if (!parsed) return false;
  for (let index = 0; index < MIN_SUPPORTED_VERSION.length; index += 1) {
    if (parsed[index] > MIN_SUPPORTED_VERSION[index]) return true;
    if (parsed[index] < MIN_SUPPORTED_VERSION[index]) return false;
  }
  return true;
}

function buildPayload(manifest: MinecraftVersionManifest | null) {
  const latestRelease = manifest?.latest?.release || FALLBACK_RELEASES[0];
  const releases = (manifest?.versions || [])
    .filter((item) => item.type === "release" && item.id && isAtLeastMinVersion(item.id))
    .map((item) => item.id!)
    .filter((id, index, list) => list.indexOf(id) === index);
  const versionIds = releases.length ? releases : FALLBACK_RELEASES;
  const recommendedVersion = versionIds.includes(latestRelease)
    ? latestRelease
    : versionIds[0] || FALLBACK_RELEASES[0];

  return {
    recommendedVersion,
    versions: versionIds.map((id) => ({
      id,
      label: id,
      recommended: id === recommendedVersion,
    })),
  };
}

export async function GET() {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Login necessario." }, { status: 401 }),
    );
  }

  if (cachedVersions && cachedVersions.expiresAt > Date.now()) {
    return applyNoStoreHeaders(NextResponse.json({ ok: true, ...cachedVersions.payload }));
  }

  let manifest: MinecraftVersionManifest | null = null;
  try {
    const response = await fetch(MOJANG_VERSION_MANIFEST_URL, {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (response.ok) {
      manifest = (await response.json()) as MinecraftVersionManifest;
    }
  } catch {
    manifest = null;
  }

  const payload = buildPayload(manifest);
  cachedVersions = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  };

  return applyNoStoreHeaders(NextResponse.json({ ok: true, ...payload }));
}
