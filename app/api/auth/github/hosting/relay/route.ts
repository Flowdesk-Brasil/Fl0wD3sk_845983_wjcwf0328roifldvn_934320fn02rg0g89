import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";

const HANDOFF_STORAGE_KEY = "flowdesk_hosting_github_handoff_v1";

export async function GET() {
  return applyNoStoreHeaders(
    new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><title>GitHub conectado</title></head><body><script>
        const storageKey = ${JSON.stringify(HANDOFF_STORAGE_KEY)};
        function readPayload() {
          try {
            const hash = window.location.hash.startsWith("#")
              ? window.location.hash.slice(1)
              : window.location.hash;
            const params = new URLSearchParams(hash);
            const rawPayload = params.get("payload");
            if (!rawPayload) return null;
            const parsed = JSON.parse(rawPayload);
            if (!parsed || parsed.source !== "flowdesk-hosting-github") return null;
            return parsed;
          } catch {
            return null;
          }
        }

        const payload = readPayload() || {
          source: "flowdesk-hosting-github",
          ok: false,
          message: "Nao consegui concluir a autorizacao do GitHub neste dominio.",
        };
        const storagePayload = JSON.stringify({ ...payload, storedAt: Date.now() });

        try {
          window.localStorage?.setItem(storageKey, storagePayload);
        } catch {}
        try {
          window.opener?.postMessage(payload, window.location.origin);
        } catch {}

        window.setTimeout(() => window.close(), 250);
      </script><main style="font-family:Inter,Arial,sans-serif;background:#080808;color:#f4f4f4;min-height:100vh;display:grid;place-items:center;margin:0;padding:24px;text-align:center"><div><strong>GitHub autorizado.</strong><p style="color:#8a8a8a">Voce ja pode voltar para o painel Flowdesk.</p></div></main></body></html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Referrer-Policy": "no-referrer",
        },
      },
    ),
  );
}
