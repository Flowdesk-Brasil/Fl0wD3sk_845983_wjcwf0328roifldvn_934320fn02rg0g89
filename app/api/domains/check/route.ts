import { NextResponse } from "next/server";
import {
  checkLocalRateLimit,
  getJsonSecurityHeaders,
  normalizeDomainSearchInput,
} from "@/lib/domains/requestGuard";
import { streamSearchDomains } from "@/lib/domains/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).slice(2, 8);
  try {
    const rateLimit = checkLocalRateLimit(req, "domains-check", {
      max: 60,
      windowMs: 60_000,
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { ok: false, message: "Muitas consultas em pouco tempo. Aguarde alguns segundos." },
        {
          status: 429,
          headers: {
            ...getJsonSecurityHeaders(requestId),
            "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
          },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const domain = normalizeDomainSearchInput(body?.domain);
    if (!domain.trim() || domain.length < 2) {
      return NextResponse.json(
        { ok: false, message: "Informe um dominio de pelo menos 2 caracteres." },
        { status: 400, headers: getJsonSecurityHeaders(requestId) },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamSearchDomains(domain, (chunk) => {
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ ...chunk, exchangeRate: 1, requestId, ok: true })}\n`),
            );
          });
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                ok: false,
                isError: true,
                message: error instanceof Error ? error.message : "Consulta de dominios indisponivel.",
              })}\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...getJsonSecurityHeaders(requestId),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao consultar dominios." },
      { status: 503, headers: getJsonSecurityHeaders(requestId) },
    );
  }
}
