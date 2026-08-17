import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  appendVpsEvent,
  encryptEnvValue,
  getHostingProjectForUser,
  maskSecretPreview,
  normalizeVpsCode,
  readString,
  requestVpsAgent,
} from "@/lib/hosting/vpsRuntime";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { buildPublicApiErrorResponse } from "@/lib/security/apiResponses";
import { createSecurityRequestContext } from "@/lib/security/requestSecurity";

type RouteProps = {
  params: Promise<{ code: string }>;
};

type NormalizedEnvVariableInput = {
  environment: "development" | "preview" | "production";
  key: string;
  value: string;
  note: string | null;
  sensitive: boolean;
};

type EnvPostBody = {
  variables?: Record<string, unknown>[];
  environment?: "development" | "preview" | "production";
  key?: string;
  value?: string;
  note?: string;
  sensitive?: boolean;
};

type EnvDeleteBody = {
  id?: number;
  environment?: "development" | "preview" | "production";
  key?: string;
};

function buildDotEnvContent(variables: NormalizedEnvVariableInput[]) {
  return variables
    .map((variable) => {
      const escaped = variable.value
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/"/g, '\\"');
      return `${variable.key}="${escaped}"`;
    })
    .join("\n");
}

function normalizeEnvironment(value: unknown) {
  return value === "development" || value === "preview" || value === "production"
    ? value
    : null;
}

function normalizeEnvVariableInput(
  value: unknown,
  fallbackEnvironment: unknown,
): NormalizedEnvVariableInput | null {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const environment = normalizeEnvironment(source.environment) || normalizeEnvironment(fallbackEnvironment);
  const key = readString(source.key);
  const rawValue = typeof source.value === "string" ? source.value : null;
  const note = typeof source.note === "string" ? source.note.trim().slice(0, 500) : null;
  const sensitive = source.sensitive !== false;

  if (!environment || !key || rawValue === null) return null;
  return {
    environment,
    key,
    value: rawValue,
    note,
    sensitive,
  };
}

async function load(code: string) {
  const session = await getCurrentAuthSessionFromCookie();
  const vpsCode = normalizeVpsCode(code);
  if (!session || !vpsCode) return null;
  const project = await getHostingProjectForUser({ userId: session.user.id, vpsCode });
  return project ? { session, project } : null;
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const requestContext = createSecurityRequestContext(_request);
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }
  const supabase = getSupabaseAdminClientOrThrow();
  const { data, error } = await supabase
    .from("hosting_vps_env_vars")
    .select("id, environment, key, value_preview, visible_value, note, sensitive, version, updated_at")
    .eq("hosting_project_id", loaded.project.id)
    .order("environment", { ascending: true })
    .order("key", { ascending: true });

  if (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Nao foi possivel carregar variaveis da VPS agora.",
      status: 500,
    });
  }
  return applyNoStoreHeaders(NextResponse.json({ ok: true, envVars: data || [] }));
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const requestContext = createSecurityRequestContext(request);
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }
  let body: EnvPostBody;
  try {
    body = parseFlowSecureDto<EnvPostBody>(
      await request.json().catch(() => ({})),
      {
        variables: flowSecureDto.optional(flowSecureDto.array(flowSecureDto.record(), { maxLength: 250 })),
        environment: flowSecureDto.optional(flowSecureDto.enum(["development", "preview", "production"] as const)),
        key: flowSecureDto.optional(flowSecureDto.string({ maxLength: 81, rejectThreatPatterns: false })),
        value: flowSecureDto.optional(flowSecureDto.string({ maxLength: 131_072, trim: false, allowEmpty: true, rejectThreatPatterns: false })),
        note: flowSecureDto.optional(flowSecureDto.string({ maxLength: 500, normalizeWhitespace: true, allowEmpty: true })),
        sensitive: flowSecureDto.optional(flowSecureDto.boolean()),
      },
      { rejectUnknown: true },
    );
  } catch (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Payload invalido.",
      status: 400,
    });
  }
  const variables = Array.isArray(body.variables)
    ? body.variables.map((item) => normalizeEnvVariableInput(item, body.environment))
    : [normalizeEnvVariableInput(body, body.environment)];
  const normalizedVariables = variables.filter((item): item is NormalizedEnvVariableInput => Boolean(item));

  if (!normalizedVariables.length || normalizedVariables.length > 250) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Envie entre 1 e 250 variaveis por vez." }, { status: 400 }),
    );
  }

  const seen = new Set<string>();
  for (const variable of normalizedVariables) {
    if (!/^[A-Z_][A-Z0-9_]{0,80}$/i.test(variable.key)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: `Variavel invalida: ${variable.key}.` }, { status: 400 }),
      );
    }
    const fingerprint = `${variable.environment}:${variable.key.toLowerCase()}`;
    if (seen.has(fingerprint)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: `Variavel duplicada: ${variable.key}.` }, { status: 400 }),
      );
    }
    seen.add(fingerprint);
  }

  let rows: Array<Record<string, unknown>>;
  try {
    rows = normalizedVariables.map((variable) => ({
      hosting_project_id: loaded.project.id,
      environment: variable.environment,
      key: variable.key,
      encrypted_value: encryptEnvValue(variable.value),
      value_preview: variable.sensitive ? maskSecretPreview(variable.value) : variable.value,
      visible_value: variable.sensitive ? null : variable.value,
      note: variable.note,
      sensitive: variable.sensitive,
      updated_by_user_id: loaded.session.user.id,
    }));
  } catch (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Nao foi possivel proteger as variaveis agora.",
      status: 500,
    });
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const keys = [...new Set(normalizedVariables.map((item) => item.key))];
  const { data: currentRows } = await supabase
    .from("hosting_vps_env_vars")
    .select("environment, key, version")
    .eq("hosting_project_id", loaded.project.id)
    .in("key", keys);

  const versionByKey = new Map(
    (currentRows || []).map((item: { environment: string; key: string; version: number }) => [
      `${item.environment}:${item.key.toLowerCase()}`,
      item.version,
    ]),
  );
  rows = rows.map((row) => ({
    ...row,
    version: (versionByKey.get(`${row.environment}:${String(row.key).toLowerCase()}`) || 0) + 1,
  }));

  const { data, error } = await supabase
    .from("hosting_vps_env_vars")
    .upsert(
      rows,
      { onConflict: "hosting_project_id,environment,key" },
    )
    .select("id, environment, key, value_preview, visible_value, note, sensitive, version, updated_at")
    .returns<Array<{
      id: number;
      environment: string;
      key: string;
      value_preview: string | null;
      visible_value: string | null;
      note: string | null;
      sensitive: boolean;
      version: number;
      updated_at: string;
    }>>();

  if (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Nao foi possivel salvar variaveis da VPS agora.",
      status: 500,
    });
  }

  await appendVpsEvent({
    projectId: loaded.project.id,
    userId: loaded.session.user.id,
    action: "env_update",
    status: "succeeded",
    message: `${normalizedVariables.length} variavel(is) atualizada(s).`,
    requestPayload: {
      count: normalizedVariables.length,
      environments: [...new Set(normalizedVariables.map((item) => item.environment))],
      keys: normalizedVariables.map((item) => item.key),
    },
  });

  await requestVpsAgent({
    project: loaded.project,
    method: "POST",
    path: `/v1/vps/${loaded.project.vps_code}/env`,
    body: {
      mode: "dotenv",
      envFiles: Object.fromEntries(
        ["development", "preview", "production"].map((environment) => [
          environment,
          buildDotEnvContent(normalizedVariables.filter((item) => item.environment === environment)),
        ]),
      ),
      variables: normalizedVariables.map((item) => ({
        environment: item.environment,
        key: item.key,
        value: item.value,
        sensitive: item.sensitive,
      })),
    },
    timeoutMs: Math.min(30_000, 8_000 + normalizedVariables.length * 120),
  }).catch(() => null);

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      envVar: data?.[0] || null,
      envVars: data || [],
      count: data?.length || 0,
    }),
  );
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const requestContext = createSecurityRequestContext(request);
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }

  let body: EnvDeleteBody;
  try {
    body = parseFlowSecureDto<EnvDeleteBody>(
      await request.json().catch(() => ({})),
      {
        id: flowSecureDto.optional(flowSecureDto.number({ integer: true, min: 1 })),
        environment: flowSecureDto.optional(flowSecureDto.enum(["development", "preview", "production"] as const)),
        key: flowSecureDto.optional(flowSecureDto.string({ maxLength: 81, rejectThreatPatterns: false })),
      },
      { rejectUnknown: true },
    );
  } catch (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Payload invalido.",
      status: 400,
    });
  }
  const id = typeof body.id === "number" && Number.isFinite(body.id) ? body.id : null;
  const environment = normalizeEnvironment(body.environment);
  const key = readString(body.key);

  let query = getSupabaseAdminClientOrThrow()
    .from("hosting_vps_env_vars")
    .delete()
    .eq("hosting_project_id", loaded.project.id);

  if (id) query = query.eq("id", id);
  else if (environment && key) query = query.eq("environment", environment).eq("key", key);
  else {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Variavel invalida." }, { status: 400 }),
    );
  }

  const { error } = await query;
  if (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Nao foi possivel remover a variavel agora.",
      status: 500,
    });
  }

  await appendVpsEvent({
    projectId: loaded.project.id,
    userId: loaded.session.user.id,
    action: "env_update",
    status: "succeeded",
    message: `Variavel ${key || id} removida.`,
  });

  return applyNoStoreHeaders(NextResponse.json({ ok: true }));
}
