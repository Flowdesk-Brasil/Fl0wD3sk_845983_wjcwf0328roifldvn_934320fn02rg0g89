import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/server/supabase-admin";

export async function POST(req: Request) {
  try {
    const { subscription, student_id } = await req.json();

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth || !student_id) {
      return NextResponse.json({ error: "Missing subscription or student_id" }, { status: 400 });
    }

    const admin = getAdminClient();
    await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);

    const { error } = await admin.from("push_subscriptions").insert({
      user_id: student_id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error saving subscription:", error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error processing subscription:", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
