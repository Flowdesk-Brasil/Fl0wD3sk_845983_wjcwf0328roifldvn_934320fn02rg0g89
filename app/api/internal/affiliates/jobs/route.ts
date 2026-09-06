/**
 * Rotinas periodicas do programa de afiliados.
 *
 *   maturation  - move comissoes que cumpriram a carencia para o saldo sacavel
 *   webhooks    - entrega a fila de webhooks pendentes
 *   reconcile   - recalcula saldos a partir do ledger (conferencia)
 *
 * Protegida por CRON_SECRET, no mesmo padrao das outras rotas internas.
 * Chamar mais de uma vez nao duplica nada: os lancamentos sao idempotentes.
 *
 * Agende maturation a cada hora e webhooks a cada 5 minutos.
 */

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { matureAffiliateCommissions } from "@/lib/affiliates/commissions";
import { dispatchPendingWebhooks } from "@/lib/affiliates/notifications";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyNoStoreHeaders } from "@/lib/security/http";

export const dynamic = "force-dynamic";

function normalizeSecret(value: unknown) {
  return String(value ?? "").trim();
}

function secureEquals(expected: string, received: string) {
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isAuthorized(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  const provided = bearer || request.headers.get("x-cron-secret") || "";

  const accepted = [
    process.env.AFFILIATE_JOBS_TOKEN,
    process.env.CRON_SECRET,
  ]
    .map(normalizeSecret)
    .filter(Boolean);

  return accepted.some((secret) => secureEquals(secret, normalizeSecret(provided)));
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 }),
    );
  }

  const job = String(request.nextUrl.searchParams.get("job") ?? "all").trim();
  const startedAt = Date.now();
  const results: Record<string, unknown> = {};

  try {
    if (job === "maturation" || job === "all") {
      results.maturation = await matureAffiliateCommissions();
    }

    if (job === "webhooks" || job === "all") {
      results.webhooks = await dispatchPendingWebhooks();
    }

    if (job === "reconcile") {
      const { data, error } = await supabaseAdmin.rpc("affiliate_recompute_all_balances");
      results.reconcile = error ? { error: error.message } : { affiliates: data };
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        job,
        durationMs: Date.now() - startedAt,
        results,
      }),
    );
  } catch (error) {
    console.error("[affiliates] falha no job:", error);
    return applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: "Falha ao executar a rotina.", job },
        { status: 500 },
      ),
    );
  }
}

/** Espelha o POST: alguns agendadores so fazem GET. */
export async function GET(request: NextRequest) {
  return POST(request);
}
