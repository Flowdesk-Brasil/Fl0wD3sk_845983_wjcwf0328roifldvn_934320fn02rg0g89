import { inspectHostingRepository } from "@/lib/hosting/inspectRepository";
import { readHostingGitHubToken } from "@/lib/hosting/github";
import {
  readHostingFramework,
  type HostingFrameworkRecipe,
} from "@/lib/hosting/frameworkDetect";
import { resolveVpsProjectSettings } from "@/lib/hosting/vpsSettings";
import type { HostingProjectAccess } from "@/lib/hosting/vpsRuntime";

export async function resolveProjectFramework(input: {
  userId: number;
  project: Pick<HostingProjectAccess, "github_owner" | "github_repo" | "github_branch" | "provisioning_payload">;
}): Promise<HostingFrameworkRecipe | null> {
  const existing = readHostingFramework(input.project.provisioning_payload);
  if (existing) return existing;
  if (!input.project.github_owner || !input.project.github_repo) return null;
  const token = await readHostingGitHubToken(input.userId).catch(() => null);
  if (!token) return null;
  const inspected = await inspectHostingRepository({
    token,
    owner: input.project.github_owner,
    repo: input.project.github_repo,
    branch: input.project.github_branch || "main",
  }).catch(() => null);
  return inspected?.framework || null;
}

export function buildVpsDeployBody(input: {
  gitUrl?: string;
  branch?: string;
  deploymentId?: number | null;
  project: Pick<HostingProjectAccess, "vps_code" | "github_repo" | "github_owner" | "github_branch" | "provisioning_payload">;
  framework?: HostingFrameworkRecipe | null;
  extra?: Record<string, unknown>;
}) {
  const settings = resolveVpsProjectSettings(input.project.provisioning_payload, {
    vpsCode: input.project.vps_code,
    repositoryName: input.project.github_repo || `vps-${input.project.vps_code.slice(0, 8)}`,
    repositoryFullName: input.project.github_owner && input.project.github_repo
      ? `${input.project.github_owner}/${input.project.github_repo}`
      : "",
    repositoryBranch: input.project.github_branch || "main",
    repositoryHtmlUrl: null,
  });
  return {
    ...(input.extra || {}),
    deploymentId: input.deploymentId || null,
    gitUrl: input.gitUrl,
    branch: input.branch || input.project.github_branch || "main",
    domains: settings.domains.map((domain) => domain.hostname),
    framework: input.framework || readHostingFramework(input.project.provisioning_payload) || null,
  };
}
