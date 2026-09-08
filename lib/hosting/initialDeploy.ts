import { readHostingGitHubToken } from "@/lib/hosting/github";
import { appendVpsEvent, requestVpsAgent, type HostingProjectAccess } from "@/lib/hosting/vpsRuntime";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function triggerHostingInitialRepositoryDeploy(input: {
  supabase: SupabaseClient;
  project: HostingProjectAccess;
  userId: number;
}) {
  if (input.project.hosting_kind === "minecraft") {
    return { ok: true as const, skipped: true as const };
  }

  const githubToken = await readHostingGitHubToken(input.userId).catch(() => null);
  const tokenPart = githubToken ? `${encodeURIComponent(githubToken)}@` : "";

  const { data: deployment } = await input.supabase
    .from("hosting_vps_deployments")
    .insert({
      hosting_project_id: input.project.id,
      environment: "production",
      status: "deploying",
      branch: input.project.github_branch || "main",
      commit_message: "Initial automatic deploy",
      metadata: {
        source: "repository_selection_resume",
      },
    })
    .select("id")
    .single();

  await appendVpsEvent({
    projectId: input.project.id,
    userId: input.userId,
    action: "deploy",
    status: "running",
    message: "Deploy inicial iniciado apos escolha do repositorio.",
    responsePayload: { deploymentId: deployment?.id || null },
  }).catch(() => null);

  try {
    const deployPayload = await requestVpsAgent<Record<string, unknown>>({
      project: input.project,
      method: "POST",
      path: `/v1/vps/${input.project.vps_code}/actions/deploy`,
      body: {
        deploymentId: deployment?.id || null,
        gitUrl: `https://${tokenPart}github.com/${input.project.github_owner}/${input.project.github_repo}.git`,
        branch: input.project.github_branch || "main",
      },
      timeoutMs: 120_000,
    });

    const finishedAt = new Date().toISOString();
    await Promise.all([
      input.supabase
        .from("hosting_projects")
        .update({
          status: "active",
          runtime_status: "online",
          runtime_status_payload: { initialDeploy: deployPayload },
          runtime_last_seen_at: finishedAt,
        })
        .eq("id", input.project.id),
      deployment?.id
        ? input.supabase
            .from("hosting_vps_deployments")
            .update({
              status: "production",
              deployed_at: finishedAt,
              build_finished_at: finishedAt,
              metadata: {
                source: "repository_selection_resume",
                response: deployPayload,
              },
            })
            .eq("id", deployment.id)
        : Promise.resolve(null),
    ]);

    await appendVpsEvent({
      projectId: input.project.id,
      userId: input.userId,
      action: "deploy",
      status: "succeeded",
      message: "Deploy inicial concluido apos escolha do repositorio.",
      responsePayload: deployPayload,
    }).catch(() => null);

    return { ok: true as const, skipped: false as const, deployPayload };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deploy inicial nao concluido.";
    const finishedAt = new Date().toISOString();
    await Promise.all([
      input.supabase
        .from("hosting_projects")
        .update({
          status: "active",
          runtime_status: "offline",
          runtime_status_payload: { initialDeployError: message },
          runtime_last_seen_at: finishedAt,
        })
        .eq("id", input.project.id),
      deployment?.id
        ? input.supabase
            .from("hosting_vps_deployments")
            .update({
              status: "failed",
              build_finished_at: finishedAt,
              logs: [{ level: "error", message }],
            })
            .eq("id", deployment.id)
        : Promise.resolve(null),
    ]);
    await appendVpsEvent({
      projectId: input.project.id,
      userId: input.userId,
      action: "deploy",
      status: "failed",
      message,
    }).catch(() => null);
    return { ok: false as const, skipped: false as const, message };
  }
}
