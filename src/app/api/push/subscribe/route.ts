import { NextResponse } from "next/server";
import { getAdminClient, requireRole } from "@/lib/server/supabase-admin";

async function resolveSubscriptionUserId(admin: ReturnType<typeof getAdminClient>, profileId: unknown, studentId: unknown) {
  if (typeof profileId === "string" && profileId.trim()) return profileId.trim();
  if (typeof studentId !== "string" || !studentId.trim()) return null;

  const { data, error } = await admin
    .from("students")
    .select("profile_id")
    .eq("id", studentId.trim())
    .maybeSingle();

  if (error) console.warn("Error resolving push subscription student:", error.message);
  return typeof data?.profile_id === "string" && data.profile_id.trim() ? data.profile_id : studentId.trim();
}

function subscriptionRow(req: Request, userId: string, subscription: any, permission: unknown) {
  return {
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: req.headers.get("user-agent"),
    permission: typeof permission === "string" ? permission : null,
    last_seen_at: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  try {
    const { subscription, student_id, profile_id, permission } = await req.json();

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
    }

    const bearerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    let admin = getAdminClient();
    let userId = await resolveSubscriptionUserId(admin, profile_id, student_id);

    if (bearerToken) {
      const auth = await requireRole(req, ["student"]);
      admin = auth.admin;
      userId = auth.user.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing authenticated user" }, { status: 401 });
    }

    const row = subscriptionRow(req, userId, subscription, permission);
    const { error } = await admin.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });

    if (error) {
      console.error("Error upserting subscription:", error);
      const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      const { error: insertError } = deleteError
        ? { error: deleteError }
        : await admin.from("push_subscriptions").insert(row);

      if (insertError) {
        console.error("Error saving subscription:", insertError);
        return NextResponse.json({ error: `Erro no banco ao salvar dispositivo: ${insertError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error processing subscription:", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
