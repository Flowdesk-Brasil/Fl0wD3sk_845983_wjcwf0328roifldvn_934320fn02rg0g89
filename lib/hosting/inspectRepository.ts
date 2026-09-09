import {
  fetchHostingGitHubRepositoryFile,
  fetchHostingGitHubRepositoryTree,
  type HostingGitHubFileNode,
} from "@/lib/hosting/github";
import {
  detectHostingFramework,
  type HostingFrameworkRecipe,
} from "@/lib/hosting/frameworkDetect";

function flattenTree(nodes: HostingGitHubFileNode[], prefix = ""): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    const path = node.path || `${prefix}${node.name}`;
    paths.push(path);
    if (node.children?.length) paths.push(...flattenTree(node.children));
  }
  return paths;
}

export async function inspectHostingRepository(input: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}): Promise<{
  framework: HostingFrameworkRecipe;
  files: string[];
  packageName: string | null;
}> {
  const [tree, packageFile] = await Promise.all([
    fetchHostingGitHubRepositoryTree({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
    }).catch(() => [] as HostingGitHubFileNode[]),
    fetchHostingGitHubRepositoryFile({
      token: input.token,
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      path: "package.json",
    }).catch(() => null),
  ]);

  let packageJson: Record<string, unknown> | null = null;
  if (packageFile?.content) {
    try {
      packageJson = JSON.parse(packageFile.content) as Record<string, unknown>;
    } catch {
      packageJson = null;
    }
  }

  const files = flattenTree(tree).slice(0, 400);
  if (packageFile && !files.includes("package.json")) files.unshift("package.json");

  const framework = detectHostingFramework({
    files,
    packageJson,
  });

  return {
    framework,
    files,
    packageName: typeof packageJson?.name === "string" ? packageJson.name : null,
  };
}
