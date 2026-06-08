import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { sendVpsProvisionedEmailSafe } from "@/lib/mail/transactional";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  
  if (payload.token !== "flowdesk-super-secret-token-v1") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { vpsCode, status } = payload;
  if (!vpsCode) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = getSupabaseAdminClientOrThrow();
  const { data: project } = await supabase
    .from("hosting_projects")
    .select("*")
    .eq("vps_code", vpsCode)
    .single();

  if (!project || (project.status !== "provisioning" && project.status !== "pending_provision")) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: updatedRows } = await supabase
    .from("hosting_projects")
    .update({ status: "active", runtime_status: status || "online" })
    .eq("id", project.id)
    .in("status", ["provisioning", "pending_provision"])
    .select("id");

  if (updatedRows && updatedRows.length > 0) {
    void sendVpsProvisionedEmailSafe({
      userId: project.user_id,
      vpsCode: project.vps_code,
      repoName: project.github_repo || "Seu projeto",
      planName: "Hospedagem Flowdesk",
      dashboardUrl: `https://fdesk.flwdesk.com/vps/${project.vps_code}`,
    });
  }

  return NextResponse.json({ ok: true });
}
