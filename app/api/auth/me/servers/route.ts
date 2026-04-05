import { NextResponse } from "next/server";
import {
  getManagedServersForCurrentSession,
} from "@/lib/servers/managedServers";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { applyNoStoreHeaders } from "@/lib/security/http";

export async function GET() {
  try {
    const servers = await getManagedServersForCurrentSession();

    return applyNoStoreHeaders(
      NextResponse.json({
      ok: true,
      servers,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
      {
        ok: false,
        message: sanitizeErrorMessage(
          error,
          "Erro ao carregar servidores gerenciados.",
        ),
      },
      { status: 500 },
      ),
    );
  }
}
