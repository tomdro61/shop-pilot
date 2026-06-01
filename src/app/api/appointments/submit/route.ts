// POST /api/appointments/submit — public booking submission endpoint.
//
// Pipeline:
//   CORS check → rate limit → multipart parse → Zod validate → honeypot →
//   dedup check (phone + date + window) → if hit, return existing →
//   process photos (size, mime, magic bytes, EXIF strip, storage upload) →
//   insertAppointment (find-or-create customer + vehicle + VIN decode + insert) →
//   onAppointmentCreated (ack SMS + message-timeline log) →
//   return success.
//
// Notes:
//   - The ack SMS is awaited (best-effort): a send failure is reflected in
//     `sms_sent`, logged to console, and (when the booking has a linked customer)
//     written to messages as status:'failed'. It never fails the request — the
//     appointment row is already saved.
//   - There is NO capacity-trigger error path in V1 — the trigger was dropped
//     in commit 6df2723. Don't add a try/catch for Postgres errcode P0001.
//   - Dedup key is phone + preferred_date + preferred_time (the requested hour,
//     evolved from the coarse window in BOOKING_PRD.md §13). DO NOT trim the
//     time from the key — a time-correction must land as a new row.
//
// Mirrors the structure of /api/parking/submit/route.ts and /api/quote-requests/route.ts.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appointmentSubmitSchema } from "@/lib/validators/appointments";
import { processBookingPhoto } from "@/lib/appointments/photos";
import {
  findExistingAppointment,
  insertAppointment,
} from "@/lib/appointments/submit";
import { onAppointmentCreated } from "@/lib/appointments/on-appointment-created";
import { getBusinessClosedState } from "@/lib/business-hours";

// ── CORS ────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://broadwaymotorsma.com",
  "https://www.broadwaymotorsma.com",
  "https://broadwaymotorsrevere.com",
  "https://www.broadwaymotorsrevere.com",
  "https://broadway-motors-web.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview deployments for the broadway-motors-web project
  if (origin.endsWith(".vercel.app") && origin.includes("broadway-motors")) {
    return true;
  }
  return false;
}

function corsHeaders(origin: string | null) {
  const allowed = isAllowedOrigin(origin) ? origin! : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ── Rate limit (in-memory, per IP, per warm instance) ──────────

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ── OPTIONS (CORS preflight) ───────────────────────────────────

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

// ── POST ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // 1. Rate limit
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many requests. Please try again later.",
      },
      { status: 429, headers }
    );
  }

  // 2. Multipart parse
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    // Log the underlying reason so debugging buggy clients doesn't require
    // guessing. Customer message stays generic.
    console.error("[appointments/submit] formData parse failed:", err);
    return NextResponse.json(
      { error: "invalid_request", message: "Invalid form data." },
      { status: 400, headers }
    );
  }

  // 3. Metadata field — JSON string carrying everything but the photos
  const metadataField = formData.get("metadata");
  if (typeof metadataField !== "string") {
    return NextResponse.json(
      { error: "missing_metadata", message: "Missing form metadata." },
      { status: 400, headers }
    );
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataField);
  } catch (err) {
    // Narrow to SyntaxError — unexpected error types (TypeErrors from a
    // monkey-patched global, etc.) bubble to Next.js's 500.
    if (!(err instanceof SyntaxError)) throw err;
    return NextResponse.json(
      { error: "invalid_metadata", message: "Form metadata is not valid JSON." },
      { status: 400, headers }
    );
  }

  // 4. Validate with the Zod schema
  const parsed = appointmentSubmitSchema.safeParse(metadata);
  if (!parsed.success) {
    // Return all issue messages (the schema's refines have user-friendly text
    // like "Sundays are closed."). Drop the `path` field — exposing internal
    // schema structure to the public response would leak field names for any
    // future refine that runs on internal-only fields.
    const messages = parsed.error.issues.map((i) => i.message);
    return NextResponse.json(
      {
        error: "validation_failed",
        message: messages[0] ?? "Invalid input.",
        messages,
      },
      { status: 400, headers }
    );
  }
  const data = parsed.data;

  // 5. Honeypot — silently 200 if the bot field is filled (don't tip the bot off)
  if (data.website && data.website.length > 0) {
    return NextResponse.json({ success: true }, { headers });
  }

  // 6. Dedup BEFORE photo processing — a double-tap shouldn't burn storage
  //    on photos we'd discard. Three-key: phone + date + requested time.
  const dedup = await findExistingAppointment({
    phone: data.phone,
    preferred_date: data.preferred_date,
    preferred_time: data.preferred_time,
  });
  if (dedup.kind === "error") {
    return NextResponse.json(
      { error: "dedup_check_failed", message: dedup.message },
      { status: 500, headers }
    );
  }
  if (dedup.kind === "match") {
    // Return the existing appointment id. Customer sees a normal success page;
    // the manager only ever sees one inbox row for the duplicate.
    return NextResponse.json(
      {
        success: true,
        appointment_id: dedup.existingId,
        dedup_hit: true,
      },
      { headers }
    );
  }

  // 7. Photos
  const photoFiles = formData
    .getAll("photo")
    .filter((p): p is File => p instanceof File);
  if (photoFiles.length > 3) {
    return NextResponse.json(
      { error: "too_many_photos", message: "Maximum 3 photos allowed." },
      { status: 400, headers }
    );
  }

  const supabase = createAdminClient();
  const photoPaths: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const result = await processBookingPhoto({
      file: photoFiles[i],
      clientId: data.client_id,
      index: i,
      supabase,
    });
    if (!result.ok) {
      // Map photo error severity to HTTP status — server-fault (e.g., bucket
      // misconfigured) returns 500 so it pages ops, not 400 which would train
      // the manager to assume the customer uploaded a bad file.
      const status = result.severity === "server" ? 500 : 400;
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status, headers }
      );
    }
    photoPaths.push(result.path);
  }

  // 8. Insert (find-or-create customer + vehicle + VIN decode + appointment row)
  const submission = await insertAppointment({
    ...data,
    photo_paths: photoPaths,
  });

  if (!submission.ok) {
    return NextResponse.json(
      { error: submission.error, message: submission.message },
      { status: 500, headers }
    );
  }

  // 9. Acknowledgment SMS — awaited, best-effort. The appointment is already
  //    saved, so an ack failure (Quo down, missing phone-line env) is logged and
  //    surfaced via `sms_sent`, never turned into a 5xx the customer would see.
  let smsSent = false;
  try {
    const ack = await onAppointmentCreated({
      appointmentId: submission.appointment_id,
      customerId: submission.customer_id,
      phone: data.phone,
      closedState: getBusinessClosedState(),
      firstName: data.first_name,
      lastName: data.last_name,
      serviceCategory: data.service_category,
      preferredDate: data.preferred_date,
      preferredTime: data.preferred_time,
    });
    smsSent = ack.smsSent;
    // If the booking has a linked customer but the ack row didn't land, the
    // dashboard's failed-ack query (status='failed' AND related_appointment_id
    // NOT NULL) can't surface it — log with the appointment id so the lost ack
    // is still greppable in Vercel logs.
    if (submission.customer_id && !ack.messageLogged) {
      console.error(
        `[appointments/submit] ack NOT logged to messages for ${submission.appointment_id} ` +
          `(smsSent=${ack.smsSent}, smsError=${ack.smsError ?? "none"})`
      );
    }
  } catch (err) {
    console.error(
      `[appointments/submit] ack handler threw for ${submission.appointment_id}:`,
      err
    );
  }

  // Surface a `warning` if customer or vehicle find-or-create failed so the
  // frontend can show "your request was received; we'll match it to your record
  // manually." Until step 6 wires the dashboard's needs-link query, the
  // structured `[booking-needs-link]` log line in insertAppointment is the
  // operational signal.
  const needsLink = !submission.customer_link || !submission.vehicle_link;
  return NextResponse.json(
    {
      success: true,
      appointment_id: submission.appointment_id,
      customer_link: submission.customer_link,
      vehicle_link: submission.vehicle_link,
      sms_sent: smsSent,
      dedup_hit: false,
      ...(needsLink ? { warning: "manual_link_required" } : {}),
    },
    { headers }
  );
}
