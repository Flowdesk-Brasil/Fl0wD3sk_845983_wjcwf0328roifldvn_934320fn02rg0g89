import { existsSync, readFileSync } from "fs";
import { join } from "path";

const FILE_NAME = "FlowdeskLauncher-Setup.exe";
const GH_OWNER = process.env.LAUNCHER_GITHUB_OWNER || "Flowdesk-Brasil";
const GH_REPO =
  process.env.LAUNCHER_GITHUB_REPO || "flow_bot_ri324j9804hf8hfrhe98f489ta11";

type GithubAsset = {
  name?: string;
  browser_download_url?: string;
};

type GithubRelease = {
  tag_name?: string;
  assets?: GithubAsset[];
};

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "flowdesk-launcher",
  };
  const token = process.env.LAUNCHER_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function localLauncherArtifactPath(fileName: string) {
  const candidates = [
    join(process.cwd(), "public", "downloads", "launcher", fileName),
    join(process.cwd(), "public", "downloads", fileName),
    join(process.cwd(), "..", "tools", "flowdesk-launcher", "dist", fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function releaseHasLauncherAssets(release: GithubRelease | null) {
  return Boolean(
    release?.assets?.some((asset) => {
      const name = String(asset.name || "").toLowerCase();
      return name === "latest.yml" || name.endsWith(".exe") || name.includes("flowdesklauncher");
    }),
  );
}

export async function fetchLatestLauncherRelease() {
  const latestResponse = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`,
    { headers: githubHeaders(), next: { revalidate: 60 } },
  );
  if (latestResponse.ok) {
    const latest = (await latestResponse.json()) as GithubRelease;
    if (releaseHasLauncherAssets(latest)) return latest;
  }
  const listResponse = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases?per_page=15`,
    { headers: githubHeaders(), next: { revalidate: 60 } },
  );
  if (!listResponse.ok) return null;
  const releases = (await listResponse.json()) as GithubRelease[];
  return releases.find((release) => releaseHasLauncherAssets(release)) || null;
}

function findAsset(release: GithubRelease, fileName: string) {
  return (
    release.assets?.find((asset) => String(asset.name || "") === fileName) ||
    release.assets?.find((asset) =>
      String(asset.name || "").toLowerCase().endsWith(fileName.toLowerCase()),
    ) ||
    null
  );
}

export async function resolveLauncherUpdateYml() {
  const localYml = localLauncherArtifactPath("latest.yml");
  if (localYml) return readFileSync(localYml, "utf8");

  const release = await fetchLatestLauncherRelease();
  if (!release) return null;
  const ymlAsset = findAsset(release, "latest.yml");
  if (!ymlAsset?.browser_download_url) return null;
  const ymlResponse = await fetch(ymlAsset.browser_download_url, {
    headers: githubHeaders(),
    redirect: "follow",
  });
  if (!ymlResponse.ok) return null;
  return ymlResponse.text();
}

export async function resolveLauncherArtifactUrl(fileName: string) {
  const local = localLauncherArtifactPath(fileName);
  if (local) return { kind: "file" as const, path: local };

  const release = await fetchLatestLauncherRelease();
  if (!release) return null;
  const asset = findAsset(release, fileName) || findAsset(release, FILE_NAME);
  if (!asset?.browser_download_url) return null;
  return { kind: "url" as const, url: asset.browser_download_url };
}

export { FILE_NAME as LAUNCHER_SETUP_FILE_NAME };
