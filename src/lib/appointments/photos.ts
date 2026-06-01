// Photo processing for public photo uploads (booking + estimate-request forms).
// Per BOOKING_TECHNICAL_PLAN.md §5.3.
//
// Pipeline per photo: size check → claimed-mime whitelist → magic-byte signature
// match (defends against extension-renamed/disguised uploads) → sharp EXIF strip
// (default behavior; .rotate() bakes in orientation first) → upload to the
// 'booking-photos' bucket at {folder}/{index}.{ext} (folder = the appointment's
// client_id for bookings, quotes/{client_id} for estimate requests).
//
// Mime-derived extension only — NEVER from the original filename. A filename
// like "photo.jpg.php" becomes "0.jpg".

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const STORAGE_BUCKET = "booking-photos";

export const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const);

export type AllowedMime =
  | "image/jpeg"
  | "image/png"
  | "image/heic"
  | "image/webp";

const MIME_TO_EXT: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
};

/**
 * Inspect the first 12 bytes and identify the image format from magic bytes.
 * Returns null if the bytes don't match any whitelisted format. Pure function —
 * exported for unit testing in isolation from sharp + storage.
 *
 * References:
 *   JPEG: FF D8 FF
 *   PNG:  89 50 4E 47 0D 0A 1A 0A
 *   HEIC: 'ftyp' at offset 4 + heic/heix/mif1/msf1/hevc brand at offset 8
 *   WebP: 'RIFF' at 0 + 'WEBP' at 8
 */
export function detectImageMime(buffer: Buffer): AllowedMime | null {
  if (buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG (full 8-byte signature)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // HEIC family — 'ftyp' marker at offset 4 + recognised brand at offset 8
  if (buffer.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.slice(8, 12).toString("ascii");
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "mif1" ||
      brand === "msf1" ||
      brand === "hevc" ||
      brand === "hevx"
    ) {
      return "image/heic";
    }
  }

  // WebP — RIFF container with WEBP type
  if (
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export type PhotoProcessResult =
  | { ok: true; path: string }
  | {
      ok: false;
      // Severity: `client` = the customer's file is the problem (400 in the
      //           route); `server` = our storage/processing infra is the
      //           problem (500 in the route — don't tell the customer they
      //           uploaded a bad file when the bucket is misconfigured).
      severity: "client" | "server";
      error:
        | "too_large"
        | "invalid_mime"
        | "invalid_signature"
        | "processing_failed"
        | "upload_failed";
      message: string;
    };

export type ProcessPhotoInput = {
  file: File;
  folder: string; // storage folder prefix (no trailing slash), e.g. the row's UUID
  index: number; // 0, 1, or 2
  supabase: SupabaseClient<Database>;
};

/**
 * Validate, EXIF-strip, and upload one uploaded photo. Returns the storage path
 * on success or a structured error so the route handler can return a useful
 * message to the customer.
 *
 * The route handler should fail the whole submission on the first photo error
 * rather than uploading some-but-not-all (partial photo sets confuse the manager).
 * Orphaned uploads from a later failure are cleaned by the daily orphan-cleanup
 * cron (step 8).
 */
export async function processPhotoUpload(
  input: ProcessPhotoInput
): Promise<PhotoProcessResult> {
  const { file, folder, index, supabase } = input;
  const photoLabel = `Photo ${index + 1}`;

  // 1. Size cap
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      severity: "client",
      error: "too_large",
      message: `${photoLabel} is too large (max 5MB).`,
    };
  }

  // 2. Claimed mime whitelist (the client says it's e.g. image/jpeg)
  if (!ALLOWED_MIMES.has(file.type as AllowedMime)) {
    return {
      ok: false,
      severity: "client",
      error: "invalid_mime",
      message: `${photoLabel} is not a supported image format.`,
    };
  }

  // 3. Read into Buffer for magic-byte check + sharp processing
  const buffer = Buffer.from(await file.arrayBuffer());

  // 4. Magic-byte signature — must match the claimed mime exactly
  const detected = detectImageMime(buffer);
  if (!detected) {
    return {
      ok: false,
      severity: "client",
      error: "invalid_signature",
      message: `${photoLabel} doesn't look like an image.`,
    };
  }
  if (detected !== file.type) {
    return {
      ok: false,
      severity: "client",
      error: "invalid_signature",
      message: `${photoLabel}'s content doesn't match its type.`,
    };
  }

  // 5. EXIF strip via sharp. Default behavior strips ALL metadata; .rotate()
  //    honors EXIF orientation and bakes it in first (so the saved image
  //    displays right-side-up even without the orientation tag).
  let cleaned: Buffer;
  try {
    cleaned = await sharp(buffer).rotate().toBuffer();
  } catch (err) {
    // HEIC may fail on Vercel if libheif isn't compiled in. Return a clear
    // client-fault error rather than a 500 — the customer can try a different
    // format. (Corrupt-image failures also land here; they're equally fixable
    // by the customer.)
    console.error(`[processPhotoUpload] sharp failed for ${file.type}:`, err);
    return {
      ok: false,
      severity: "client",
      error: "processing_failed",
      message: `${photoLabel} couldn't be processed. Try JPG, PNG, or WebP.`,
    };
  }

  // 6. Upload — extension derived from validated mime (NEVER the original filename)
  const ext = MIME_TO_EXT[detected];
  const path = `${folder}/${index}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, cleaned, {
      contentType: detected,
      upsert: false,
    });

  if (uploadErr) {
    // Upload failures are SERVER-fault (bucket misconfigured, RLS denied,
    // service-role rotated wrong, etc.) — not the customer's problem. Log
    // loudly with a recognizable tag so a misconfigured bucket can be grep'd
    // for in Vercel logs, and signal `severity: "server"` so the route handler
    // returns 500 (alerts ops) instead of 400 (trains the customer to think
    // their file is bad).
    console.error(
      `[booking-storage-error] upload failed for ${path} (bucket=${STORAGE_BUCKET}):`,
      uploadErr.message
    );
    return {
      ok: false,
      severity: "server",
      error: "upload_failed",
      message: "Photo upload failed. Please try again.",
    };
  }

  return { ok: true, path };
}

// Booking photos: the storage folder is the appointment's client_id (its row PK),
// so photos land at booking-photos/{clientId}/{index}.{ext}. Thin wrapper kept so
// the booking route + tests address photos by appointment id, not raw folder.
export async function processBookingPhoto(input: {
  file: File;
  clientId: string;
  index: number;
  supabase: SupabaseClient<Database>;
}): Promise<PhotoProcessResult> {
  return processPhotoUpload({
    file: input.file,
    folder: input.clientId,
    index: input.index,
    supabase: input.supabase,
  });
}
