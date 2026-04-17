import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export type PaymentProviderEventInboxRecord = {
  id: number;
  provider: string;
  event_key: string;
  resource_type: string | null;
  resource_id: string | null;
  event_action: string | null;
  status: "processing" | "failed" | "completed" | "dead_letter" | string;
  attempt_count: number;
  max_attempts: number;
  signature_verified: boolean;
  request_id: string | null;
  request_path: string | null;
  received_at: string;
  last_received_at: string;
  processed_at: string | null;
  next_retry_at: string | null;
  last_error: string | null;
  headers: unknown;
  payload: unknown;
  result_payload: unknown;
  created_at: string;
  updated_at: string;
};

type ClaimPaymentProviderEventInput = {
  provider: string;
  eventKey: string;
  resourceType?: string | null;
  resourceId?: string | null;
  eventAction?: string | null;
  signatureVerified?: boolean;
  requestId?: string | null;
  requestPath?: string | null;
  headers?: unknown;
  payload?: unknown;
  maxAttempts?: number;
  processingLeaseMs?: number;
};

type UpdatePaymentProviderEventInput = {
  record: PaymentProviderEventInboxRecord | null;
  provider: string;
  eventKey: string;
  resultPayload?: unknown;
};

const PAYMENT_PROVIDER_EVENT_INBOX_SELECT_COLUMNS =
  "id, provider, event_key, resource_type, resource_id, event_action, status, attempt_count, max_attempts, signature_verified, request_id, request_path, received_at, last_received_at, processed_at, next_retry_at, last_error, headers, payload, result_payload, created_at, updated_at";

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    (typeof error?.message === "string" &&
      error.message.toLowerCase().includes("payment_provider_event_inbox"))
  );
}

function isUniqueViolationError(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

function clampAttemptCount(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(value as number)));
}

function normalizeRetryDelayMs(attemptCount: number) {
  const retryStep = Math.max(1, Math.min(attemptCount, 6));
  return Math.min(30 * 60 * 1000, 15_000 * 2 ** (retryStep - 1));
}

function isRecentlyProcessing(record: PaymentProviderEventInboxRecord, leaseMs: number) {
  const reference = Date.parse(record.updated_at || record.last_received_at || record.received_at);
  if (!Number.isFinite(reference)) return false;
  return Date.now() - reference < leaseMs;
}

async function getPaymentProviderEventRecord(input: {
  provider: string;
  eventKey: string;
}) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("payment_provider_event_inbox")
    .select(PAYMENT_PROVIDER_EVENT_INBOX_SELECT_COLUMNS)
    .eq("provider", input.provider)
    .eq("event_key", input.eventKey)
    .maybeSingle<PaymentProviderEventInboxRecord>();

  if (result.error) {
    throw result.error;
  }

  return result.data || null;
}

export async function claimPaymentProviderEvent(
  input: ClaimPaymentProviderEventInput,
) {
  const provider = input.provider.trim();
  const eventKey = input.eventKey.trim();
  const processingLeaseMs = Math.max(5_000, input.processingLeaseMs || 90_000);
  const maxAttempts = clampAttemptCount(input.maxAttempts, 6);
  const nowIso = new Date().toISOString();

  try {
    let existingRecord = await getPaymentProviderEventRecord({ provider, eventKey });

    if (!existingRecord) {
      const supabase = getSupabaseAdminClientOrThrow();
      const insertResult = await supabase
        .from("payment_provider_event_inbox")
        .insert({
          provider,
          event_key: eventKey,
          resource_type: input.resourceType || null,
          resource_id: input.resourceId || null,
          event_action: input.eventAction || null,
          status: "processing",
          attempt_count: 1,
          max_attempts: maxAttempts,
          signature_verified: Boolean(input.signatureVerified),
          request_id: input.requestId || null,
          request_path: input.requestPath || null,
          received_at: nowIso,
          last_received_at: nowIso,
          headers: input.headers || {},
          payload: input.payload || {},
          result_payload: {},
        })
        .select(PAYMENT_PROVIDER_EVENT_INBOX_SELECT_COLUMNS)
        .single<PaymentProviderEventInboxRecord>();

      if (insertResult.error) {
        if (isUniqueViolationError(insertResult.error)) {
          existingRecord = await getPaymentProviderEventRecord({ provider, eventKey });
        } else {
          throw insertResult.error;
        }
      } else {
        return {
          ok: true as const,
          mode: "claimed" as const,
          record: insertResult.data,
        };
      }
    }

    if (!existingRecord) {
      return {
        ok: true as const,
        mode: "table_unavailable" as const,
        record: null,
      };
    }

    if (existingRecord.status === "completed") {
      return {
        ok: false as const,
        mode: "duplicate_completed" as const,
        record: existingRecord,
      };
    }

    if (
      existingRecord.status === "processing" &&
      isRecentlyProcessing(existingRecord, processingLeaseMs)
    ) {
      return {
        ok: false as const,
        mode: "already_processing" as const,
        record: existingRecord,
      };
    }

    if (existingRecord.status === "dead_letter") {
      return {
        ok: false as const,
        mode: "dead_letter" as const,
        record: existingRecord,
      };
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const nextAttemptCount = clampAttemptCount(
      existingRecord.attempt_count + 1,
      maxAttempts,
    );
    const updateResult = await supabase
      .from("payment_provider_event_inbox")
      .update({
        resource_type: input.resourceType || existingRecord.resource_type,
        resource_id: input.resourceId || existingRecord.resource_id,
        event_action: input.eventAction || existingRecord.event_action,
        status: "processing",
        attempt_count: nextAttemptCount,
        max_attempts: Math.max(existingRecord.max_attempts || 1, maxAttempts),
        signature_verified:
          existingRecord.signature_verified || Boolean(input.signatureVerified),
        request_id: input.requestId || existingRecord.request_id,
        request_path: input.requestPath || existingRecord.request_path,
        last_received_at: nowIso,
        next_retry_at: null,
        processed_at: null,
        last_error: null,
        headers: input.headers || existingRecord.headers || {},
        payload: input.payload || existingRecord.payload || {},
      })
      .eq("id", existingRecord.id)
      .select(PAYMENT_PROVIDER_EVENT_INBOX_SELECT_COLUMNS)
      .single<PaymentProviderEventInboxRecord>();

    if (updateResult.error) {
      throw updateResult.error;
    }

    return {
      ok: true as const,
      mode: "claimed" as const,
      record: updateResult.data,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      isMissingRelationError(error as { code?: string; message?: string })
    ) {
      return {
        ok: true as const,
        mode: "table_unavailable" as const,
        record: null,
      };
    }

    throw error;
  }
}

export async function completePaymentProviderEvent(
  input: UpdatePaymentProviderEventInput,
) {
  if (!input.record) {
    return {
      ok: true as const,
      mode: "table_unavailable" as const,
      record: null,
    };
  }

  try {
    const supabase = getSupabaseAdminClientOrThrow();
    const processedAt = new Date().toISOString();
    const result = await supabase
      .from("payment_provider_event_inbox")
      .update({
        status: "completed",
        processed_at: processedAt,
        next_retry_at: null,
        last_error: null,
        result_payload: input.resultPayload || {},
      })
      .eq("id", input.record.id)
      .select(PAYMENT_PROVIDER_EVENT_INBOX_SELECT_COLUMNS)
      .single<PaymentProviderEventInboxRecord>();

    if (result.error) {
      throw result.error;
    }

    return {
      ok: true as const,
      mode: "completed" as const,
      record: result.data,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      isMissingRelationError(error as { code?: string; message?: string })
    ) {
      return {
        ok: true as const,
        mode: "table_unavailable" as const,
        record: null,
      };
    }

    throw error;
  }
}

export async function failPaymentProviderEvent(
  input: UpdatePaymentProviderEventInput & {
    errorMessage: string;
    retryDelayMs?: number;
  },
) {
  if (!input.record) {
    return {
      ok: true as const,
      mode: "table_unavailable" as const,
      record: null,
      deadLetter: false,
    };
  }

  try {
    const supabase = getSupabaseAdminClientOrThrow();
    const normalizedMessage = input.errorMessage.trim() || "payment_provider_event_failed";
    const attemptCount = clampAttemptCount(
      input.record.attempt_count,
      input.record.max_attempts || 1,
    );
    const maxAttempts = clampAttemptCount(
      input.record.max_attempts,
      Math.max(1, attemptCount),
    );
    const deadLetter = attemptCount >= maxAttempts;
    const nextRetryAt = deadLetter
      ? null
      : new Date(
          Date.now() +
            Math.max(
              5_000,
              input.retryDelayMs || normalizeRetryDelayMs(attemptCount),
            ),
        ).toISOString();

    const result = await supabase
      .from("payment_provider_event_inbox")
      .update({
        status: deadLetter ? "dead_letter" : "failed",
        processed_at: deadLetter ? new Date().toISOString() : null,
        next_retry_at: nextRetryAt,
        last_error: normalizedMessage,
        result_payload: input.resultPayload || {},
      })
      .eq("id", input.record.id)
      .select(PAYMENT_PROVIDER_EVENT_INBOX_SELECT_COLUMNS)
      .single<PaymentProviderEventInboxRecord>();

    if (result.error) {
      throw result.error;
    }

    return {
      ok: true as const,
      mode: deadLetter ? ("dead_letter" as const) : ("failed" as const),
      record: result.data,
      deadLetter,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      isMissingRelationError(error as { code?: string; message?: string })
    ) {
      return {
        ok: true as const,
        mode: "table_unavailable" as const,
        record: null,
        deadLetter: false,
      };
    }

    throw error;
  }
}
