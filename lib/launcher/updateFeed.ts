const FILE_NAME = "FlowdeskLauncher-Setup.exe";
const GH_OWNER = process.env.LAUNCHER_GITHUB_OWNER || "Flowdesk-Brasil";
const GH_REPO =
  process.env.LAUNCHER_GITHUB_REPO || "flow_bot_ri324j9804hf8hfrhe98f489ta11";
const PUBLIC_DOWNLOAD_ORIGINS = [
  process.env.LAUNCHER_PUBLIC_DOWNLOAD_ORIGIN,
  process.env.NEXT_PUBLIC_APP_URL,
  "https://www.flwdesk.com",
]
  .map((value) => String(value || "").replace(/\/+$/, ""))
  .filter(Boolean);

type GithubAsset = {
  name?: string;
  browser_download_url?: string;
};

type GithubRelease = {
  tag_name?: string;
  assets?: GithubAsset[];
};

export type LauncherArtifact = {
  kind: "url";
  url: string;
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

function looksLikeBinaryDownload(response: Response) {
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  const length = Number(response.headers.get("content-length") || 0);
  if (type.includes("text/html") || type.includes("text/javascript") || type.includes("application/json")) {
    return false;
  }
  return (
    type.includes("octet-stream") ||
    type.includes("msdownload") ||
    type.includes("exe") ||
    type.includes("yaml") ||
    type.includes("yml") ||
    (Number.isFinite(length) && length > 1_000_000)
  );
}

async function tryPublicOriginDownload(fileName: string) {
  for (const origin of [...new Set(PUBLIC_DOWNLOAD_ORIGINS)]) {
    const url = `${origin}/downloads/${fileName}`;
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      redirect: "manual",
    }).catch(() => null);
    if (response?.ok && looksLikeBinaryDownload(response)) {
      return url;
    }
  }
  return null;
}

function githubLatestDownloadUrl(fileName: string) {
  return `https://github.com/${GH_OWNER}/${GH_REPO}/releases/latest/download/${fileName}`;
}

export async function resolveLauncherUpdateYml() {
  const publicUrl = await tryPublicOriginDownload("latest.yml");
  if (publicUrl) {
    const local = await fetch(publicUrl, { cache: "no-store" }).catch(() => null);
    const text = local?.ok ? await local.text() : "";
    if (text.includes("version:")) return text;
  }

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

export async function resolveLauncherArtifactUrl(
  fileName: string,
): Promise<LauncherArtifact | null> {
  const release = await fetchLatestLauncherRelease();
  const asset = release
    ? findAsset(release, fileName) || findAsset(release, FILE_NAME)
    : null;
  if (asset?.browser_download_url) {
    return { kind: "url", url: asset.browser_download_url };
  }

  const publicUrl = await tryPublicOriginDownload(fileName);
  if (publicUrl) return { kind: "url", url: publicUrl };

  return { kind: "url", url: githubLatestDownloadUrl(fileName) };
}

export { FILE_NAME as LAUNCHER_SETUP_FILE_NAME };
