import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  appendVpsEvent,
  getHostingProjectForUser,
  normalizeVpsCode,
  readString,
  requestVpsAgent,
} from "@/lib/hosting/vpsRuntime";
<<<<<<< HEAD
import {
  fetchHostingGitHubRepositoryCommits,
  readHostingGitHubInstallationTokenForRepository,
  readHostingGitHubToken,
} from "@/lib/hosting/github";
=======
>>>>>>> 9c6e756 (Att master)
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders } from "@/lib/security/http";

type RouteProps = {
  params: Promise<{ code: string }>;
};

async function load(code: string) {
  const session = await getCurrentAuthSessionFromCookie();
  const vpsCode = normalizeVpsCode(code);
  if (!session || !vpsCode) return null;
  const project = await getHostingProjectForUser({ userId: session.user.id, vpsCode });
  return project ? { session, project } : null;
}

<<<<<<< HEAD
async function readDeployments(projectId: number, limit = 50) {
  const { data, error } = await getSupabaseAdminClientOrThrow()
    .from("hosting_vps_deployments")
    .select("*")
    .eq("hosting_project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function readBestGitHubToken(input: {
  userId: number;
  owner: string;
  repo: string;
}) {
  const userToken = await readHostingGitHubToken(input.userId);
  if (userToken) return { token: userToken, source: "oauth" as const };
  const installation = await readHostingGitHubInstallationTokenForRepository({
    owner: input.owner,
    repo: input.repo,
  });
  return installation?.token
    ? { token: installation.token, source: "github_app" as const }
    : null;
}

async function syncDeploymentsFromGitHub(loaded: NonNullable<Awaited<ReturnType<typeof load>>>) {
  const token = await readBestGitHubToken({
    userId: loaded.project.user_id,
    owner: loaded.project.github_owner,
    repo: loaded.project.github_repo,
  });
  if (!token) {
    return {
      ok: false,
      message: "Conecte o GitHub ou instale o GitHub App para sincronizar commits.",
      synced: 0,
    };
  }

  const commits = await fetchHostingGitHubRepositoryCommits({
    token: token.token,
    owner: loaded.project.github_owner,
    repo: loaded.project.github_repo,
    branch: loaded.project.github_branch,
    perPage: 30,
  });
  if (!commits.length) {
    return { ok: true, synced: 0, message: "Nenhum commit encontrado no GitHub para esta branch." };
  }
  const supabase = getSupabaseAdminClientOrThrow();
  const existing = await supabase
    .from("hosting_vps_deployments")
    .select("id, commit_sha, branch, environment")
    .eq("hosting_project_id", loaded.project.id)
    .in("commit_sha", commits.map((commit) => commit.sha));
  if (existing.error) throw existing.error;
  const existingKeys = new Set(
    (existing.data || []).map((item) =>
      `${String(item.commit_sha || "")}:${String(item.branch || "")}:${String(item.environment || "")}`,
    ),
  );
  const now = new Date().toISOString();
  const rows = commits
    .filter((commit) => !existingKeys.has(`${commit.sha}:${loaded.project.github_branch}:production`))
    .map((commit, index) => ({
      hosting_project_id: loaded.project.id,
      environment: "production",
      status: index === 0 ? "production" : "ready",
      branch: loaded.project.github_branch,
      commit_sha: commit.sha,
      commit_author: commit.author,
      commit_message: commit.message,
      build_started_at: commit.committedAt,
      build_finished_at: commit.committedAt,
      deployed_at: commit.committedAt,
      duration_ms: null,
      logs: [],
      metadata: {
        source: "github_commit",
        tokenSource: token.source,
        commitUrl: commit.htmlUrl,
        authorAvatarUrl: commit.authorAvatarUrl,
        syncedAt: now,
      },
      created_at: commit.committedAt || now,
      updated_at: now,
    }));

  if (rows.length) {
    const { error } = await supabase.from("hosting_vps_deployments").insert(rows);
    if (error) throw error;
  }

  await appendVpsEvent({
    projectId: loaded.project.id,
    userId: loaded.session.user.id,
    action: "sync",
    status: "succeeded",
    message: rows.length
      ? `${rows.length} commit(s) sincronizados do GitHub.`
      : "Deployments ja estavam sincronizados com o GitHub.",
    responsePayload: { synced: rows.length, tokenSource: token.source },
  });

  return { ok: true, synced: rows.length };
}

export async function GET(request: NextRequest, { params }: RouteProps) {
=======
export async function GET(_request: NextRequest, { params }: RouteProps) {
>>>>>>> 9c6e756 (Att master)
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }
<<<<<<< HEAD
  const sync = request.nextUrl.searchParams.get("sync") === "1";
  let syncResult: Awaited<ReturnType<typeof syncDeploymentsFromGitHub>> | null = null;
  try {
    if (sync) syncResult = await syncDeploymentsFromGitHub(loaded);
    const deployments = await readDeployments(loaded.project.id);
    return applyNoStoreHeaders(NextResponse.json({
      ok: true,
      deployments,
      sync: syncResult,
    }));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message: error instanceof Error ? error.message : "Nao foi possivel sincronizar deployments.",
      }, { status: 500 }),
    );
  }
=======
  const { data, error } = await getSupabaseAdminClientOrThrow()
    .from("hosting_vps_deployments")
    .select("*")
    .eq("hosting_project_id", loaded.project.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: error.message }, { status: 500 }),
    );
  }
  return applyNoStoreHeaders(NextResponse.json({ ok: true, deployments: data || [] }));
>>>>>>> 9c6e756 (Att master)
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const branch = readString(body.branch) || loaded.project.github_branch;
  const environment =
    body.environment === "development" || body.environment === "preview" || body.environment === "production"
      ? body.environment
      : branch === loaded.project.github_branch
        ? "production"
        : "preview";
  const supabase = getSupabaseAdminClientOrThrow();
  const { data: deployment, error } = await supabase
    .from("hosting_vps_deployments")
    .insert({
      hosting_project_id: loaded.project.id,
      environment,
      status: "queued",
      branch,
      commit_sha: readString(body.commitSha),
      commit_author: readString(body.commitAuthor),
      commit_message: readString(body.commitMessage),
      metadata: { source: "dashboard" },
    })
    .select("*")
    .single();
  if (error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: error.message }, { status: 500 }),
    );
  }

  await appendVpsEvent({
    projectId: loaded.project.id,
    userId: loaded.session.user.id,
    action: "deploy",
    status: "running",
    message: `Deploy ${environment} enfileirado.`,
    responsePayload: deployment,
  });

  try {
    await requestVpsAgent({
      project: loaded.project,
      method: "POST",
      path: `/v1/vps/${loaded.project.vps_code}/deploys`,
      body: { deploymentId: deployment.id, branch, environment },
      timeoutMs: 30_000,
    });
  } catch (error) {
    await supabase
      .from("hosting_vps_deployments")
      .update({
        status: "failed",
        logs: [{ level: "error", message: error instanceof Error ? error.message : "Falha ao iniciar deploy." }],
        build_finished_at: new Date().toISOString(),
      })
      .eq("id", deployment.id);
  }

  return applyNoStoreHeaders(NextResponse.json({ ok: true, deployment }));
}
