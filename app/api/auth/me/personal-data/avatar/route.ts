import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  applyNoStoreHeaders,
  isSameOriginRequest,
} from "@/lib/security/http";

const AVATAR_BUCKET = "account-avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, message: "Origem da requisicao invalida." },
      { status: 403 },
    );
  }

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("avatar");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "Selecione uma imagem para continuar." },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.type) || file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json(
        { ok: false, message: "Use JPG, PNG, WEBP ou GIF com no maximo 5 MB." },
        { status: 400 },
      );
    }

    const source = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(source, { animated: false })
      .rotate()
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 88 })
      .toBuffer();
    const supabase = getSupabaseAdminClientOrThrow();
    const folder = String(session.user.id);
    const existingFiles = await supabase.storage.from(AVATAR_BUCKET).list(folder);
    const path = `${folder}/avatar-${Date.now()}.webp`;
    const upload = await supabase.storage.from(AVATAR_BUCKET).upload(path, optimized, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
    const update = await supabase
      .from("auth_users")
      .update({
        profile_avatar_url: publicUrl,
        profile_avatar_source: "upload",
        profile_avatar_updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
    if (update.error) {
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      throw new Error(update.error.message);
    }

    if (existingFiles.data?.length) {
      await supabase.storage
        .from(AVATAR_BUCKET)
        .remove(existingFiles.data.map((entry) => `${folder}/${entry.name}`));
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        avatarUrl: publicUrl,
        message: "Avatar atualizado.",
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel atualizar o avatar.",
        },
        { status: 500 },
      ),
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, message: "Origem da requisicao invalida." },
      { status: 403 },
    );
  }

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  try {
    const supabase = getSupabaseAdminClientOrThrow();
    const fallbackResult = await supabase
      .from("auth_user_provider_profiles")
      .select("provider, provider_avatar_url")
      .eq("user_id", session.user.id)
      .not("provider_avatar_url", "is", null)
      .order("linked_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ provider: string; provider_avatar_url: string | null }>();
    const update = await supabase
      .from("auth_users")
      .update({
        profile_avatar_url: fallbackResult.data?.provider_avatar_url || null,
        profile_avatar_source: fallbackResult.data?.provider || null,
        profile_avatar_updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
    if (update.error) throw new Error(update.error.message);

    const folder = String(session.user.id);
    const existingFiles = await supabase.storage.from(AVATAR_BUCKET).list(folder);
    if (existingFiles.data?.length) {
      await supabase.storage
        .from(AVATAR_BUCKET)
        .remove(existingFiles.data.map((entry) => `${folder}/${entry.name}`));
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        avatarUrl: fallbackResult.data?.provider_avatar_url || null,
        message: "Avatar personalizado removido.",
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Nao foi possivel remover o avatar.",
        },
        { status: 500 },
      ),
    );
  }
}
