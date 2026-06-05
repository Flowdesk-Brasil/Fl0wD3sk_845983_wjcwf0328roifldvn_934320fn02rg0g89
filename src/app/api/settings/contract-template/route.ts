import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

const BUCKET = "contract-templates";

export async function POST(request: Request) {
  try {
    const { admin } = await requireRole(request, ["admin"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Selecione um arquivo PDF.");
    if (file.type !== "application/pdf") throw new ApiError("O modelo de contrato precisa ser um PDF.");
    if (file.size > 10 * 1024 * 1024) throw new ApiError("O PDF deve ter no máximo 10 MB.");

    const { error: bucketError } = await admin.storage.getBucket(BUCKET);
    if (bucketError) {
      const { error: createError } = await admin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["application/pdf"],
      });
      if (createError && !createError.message.toLowerCase().includes("already")) throw createError;
    }

    const path = `studio/contract-template-${Date.now()}.pdf`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: current } = await admin.from("settings").select("contract_template_path").eq("id", "studio").single();
    const { error: settingsError } = await admin.from("settings").update({
      contract_template_path: path,
      contract_template_name: file.name,
    }).eq("id", "studio");
    if (settingsError) {
      await admin.storage.from(BUCKET).remove([path]);
      throw new ApiError("A migração operacional ainda não foi aplicada. Execute database/migrations/002_studio_operations.sql.", 503);
    }
    if (current?.contract_template_path && current.contract_template_path !== path) {
      await admin.storage.from(BUCKET).remove([current.contract_template_path]);
    }
    return Response.json({ ok: true, path, name: file.name });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
