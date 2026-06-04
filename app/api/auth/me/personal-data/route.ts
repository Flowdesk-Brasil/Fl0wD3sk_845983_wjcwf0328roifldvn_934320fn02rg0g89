import { NextResponse } from "next/server";
import { getAccountPersonalData } from "@/lib/account/personalData";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";

export async function GET() {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  try {
    const data = await getAccountPersonalData(session.user.id);
    return applyNoStoreHeaders(NextResponse.json({ ok: true, data }));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel carregar seus dados.",
        },
        { status: 500 },
      ),
    );
  }
}
