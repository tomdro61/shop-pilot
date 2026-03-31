"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "dvi-photos";
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 7; // 7 days

export async function uploadDviPhoto(
  inspectionId: string,
  resultId: string,
  fileBase64: string,
  fileName: string
) {
  const supabase = await createClient();

  const ext = fileName.split(".").pop() || "jpg";
  const path = `${inspectionId}/${resultId}/${crypto.randomUUID()}.${ext}`;

  // Decode base64 to buffer
  const buffer = Buffer.from(fileBase64, "base64");

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
      upsert: false,
    });

  if (uploadErr) return { error: uploadErr.message };

  // Get current photo count for sort_order
  const { count } = await supabase
    .from("dvi_photos")
    .select("id", { count: "exact", head: true })
    .eq("result_id", resultId);

  // Create DB record
  const { data, error: dbErr } = await supabase
    .from("dvi_photos")
    .insert({
      result_id: resultId,
      storage_path: path,
      sort_order: count ?? 0,
    })
    .select()
    .single();

  if (dbErr) {
    // Rollback: remove uploaded file
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: dbErr.message };
  }

  return { data };
}

export async function getDviPhotoSignedUrl(storagePath: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

  if (error) return null;
  return data.signedUrl;
}

// Batch version for loading all photos in an inspection
export async function getDviPhotoSignedUrls(storagePaths: string[]) {
  if (storagePaths.length === 0) return {};

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_EXPIRY);

  if (error || !data) return {};

  const urlMap: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) {
      urlMap[item.path] = item.signedUrl;
    }
  }
  return urlMap;
}

// Public page variant using admin client (bypasses RLS)
export async function getDviPhotoSignedUrlsPublic(storagePaths: string[]) {
  if (storagePaths.length === 0) return {};

  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_EXPIRY);

  if (error || !data) return {};

  const urlMap: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) {
      urlMap[item.path] = item.signedUrl;
    }
  }
  return urlMap;
}

export async function deleteDviPhoto(photoId: string) {
  const supabase = await createClient();

  // Get the storage path before deleting the record
  const { data: photo } = await supabase
    .from("dvi_photos")
    .select("storage_path")
    .eq("id", photoId)
    .single();

  if (!photo) return { error: "Photo not found" };

  // Delete DB record
  const { error: dbErr } = await supabase
    .from("dvi_photos")
    .delete()
    .eq("id", photoId);

  if (dbErr) return { error: dbErr.message };

  // Delete from storage
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);

  return { success: true };
}
