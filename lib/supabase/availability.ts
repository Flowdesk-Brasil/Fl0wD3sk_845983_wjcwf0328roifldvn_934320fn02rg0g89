const DEFAULT_SUPABASE_AVAILABILITY_TIMEOUT_MS = 1200;

function resolveSupabaseAvailabilityEnv() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  return {
    supabaseUrl,
    serviceRoleKey,
  };
}

export async function checkSupabaseReadAvailability(input?: {
  timeoutMs?: number;
}) {
  const { supabaseUrl, serviceRoleKey } = resolveSupabaseAvailabilityEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    return false;
  }

  const timeoutMs =
    typeof input?.timeoutMs === "number" && input.timeoutMs > 0
      ? Math.floor(input.timeoutMs)
      : DEFAULT_SUPABASE_AVAILABILITY_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL("/rest/v1/auth_users?select=id&limit=1", supabaseUrl);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
