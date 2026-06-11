// POST /api/quote-requests — public estimate (quote) request submission.
//
// Two content types, one pipeline:
//   • multipart/form-data — the current website estimate form: a `metadata` JSON
//     field (Zod-validated) + up to 3 `photo` parts. Mirrors /api/appointments/submit.
//   • application/json — LEGACY. The pre-multipart estimate form and the retired
//     Wix bridge. Kept so the cutover (deploy this endpoint first, then the new
//     form) has zero downtime. Remove once the JSON form is fully gone from prod.
//
// Shared tail (both paths): dedup (phone + 10-min window) → persist (customer +
// Quo contact + insert) → onQuoteRequestCreated (ack SMS + owner alert).

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessClosedState } from "@/lib/business-hours";
import { quoteRequestSubmitSchema } from "@/lib/validators/quote-requests";
import { processPhotoUpload } from "@/lib/appointments/photos";
import {
  findRecentQuoteRequest,
  persistQuoteRequest,
  storedPhone,
  type QuoteFields,
} from "@/lib/quote-requests/submit";
import { onQuoteRequestCreated } from "@/lib/quote-requests/on-quote-request-created";

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
  // Vercel preview deployments for the broadway-motors-web project.
  if (origin.endsWith(".vercel.app") && origin.includes("broadway-motors")) {
    return true;
  }
  return false;
}

function corsHeaders(origin: string | null) {
  // Empty string for disallowed origins — browsers block the response. Don't
  // echo a fallback origin (that's a misleading Access-Control-Allow-Origin).
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
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers }
    );
  }

  const contentType = request.headers.get("content-type") || "";

  try {
    const built = contentType.includes("multipart/form-data")
      ? await buildFromMultipart(request, headers)
      : await buildFromJson(request, headers);

    // A path returned an early response (honeypot, validation, dedup hit, photo error).
    if ("response" in built) return built.response;
    const { fields } = built;

    // Persist (customer + Quo contact + insert). Dedup already ran inside the build
    // step — before any photo upload — so we only reach here for a fresh request.
    const persisted = await persistQuoteRequest(fields);
    if (!persisted.ok) {
      return NextResponse.json(
        { success: false, error: persisted.message },
        { status: 500, headers }
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/quote-requests");

    // Ack SMS + owner alert — awaited, best-effort (never fails the 200). Surface a
    // degraded ack so a lost send / log is greppable, mirroring the booking route.
    // messageLogged is expected-false when there's no linked customer, so only flag
    // it as degraded when a customer DID link.
    if (persisted.e164) {
      try {
        const ack = await onQuoteRequestCreated({
          quoteRequestId: persisted.id,
          customerId: persisted.customerId,
          phone: persisted.e164,
          closedState: getBusinessClosedState(),
          firstName: fields.firstName,
          lastName: fields.lastName,
          services: fields.services,
          vehicleYear: fields.vehicleYear,
          vehicleMake: fields.vehicleMake,
          vehicleModel: fields.vehicleModel,
        });
        if (!ack.smsSent || (persisted.customerId && !ack.messageLogged)) {
          console.error(`[quote-requests] ack degraded for ${persisted.id}:`, {
            smsSent: ack.smsSent,
            smsError: ack.smsError,
            messageLogged: ack.messageLogged,
          });
        }
      } catch (err) {
        console.error(`[quote-requests] ack handler threw for ${persisted.id}:`, err);
      }
    }

    return NextResponse.json(
      { success: true, quote_request_id: persisted.id, dedup_hit: false },
      { status: 200, headers }
    );
  } catch (err) {
    console.error("[Quote Request] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500, headers }
    );
  }
}

type BuildResult = { fields: QuoteFields } | { response: NextResponse };

// ── New path: multipart/form-data (metadata JSON + photo parts) ──

async function buildFromMultipart(
  request: Request,
  headers: Record<string, string>
): Promise<BuildResult> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("[quote-requests] formData parse failed:", err);
    return {
      response: NextResponse.json(
        { success: false, error: "Invalid form data." },
        { status: 400, headers }
      ),
    };
  }

  const metadataField = formData.get("metadata");
  if (typeof metadataField !== "string") {
    return {
      response: NextResponse.json(
        { success: false, error: "Missing form metadata." },
        { status: 400, headers }
      ),
    };
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataField);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return {
      response: NextResponse.json(
        { success: false, error: "Form metadata is not valid JSON." },
        { status: 400, headers }
      ),
    };
  }

  const parsed = quoteRequestSubmitSchema.safeParse(metadata);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message);
    return {
      response: NextResponse.json(
        { success: false, error: messages[0] ?? "Invalid input.", messages },
        { status: 400, headers }
      ),
    };
  }
  const data = parsed.data;

  // Honeypot — silently succeed so the bot can't tell it was rejected.
  if (data.website && data.website.length > 0) {
    return { response: NextResponse.json({ success: true }, { headers }) };
  }

  // Dedup BEFORE photo upload — a double-tap shouldn't burn storage on photos we'd
  // then discard (there's no orphan-cleanup cron yet). Mirrors the booking route.
  const dedup = await findRecentQuoteRequest({ phone: storedPhone(data.phone) });
  if (dedup.kind === "error") {
    return {
      response: NextResponse.json(
        { success: false, error: dedup.message },
        { status: 500, headers }
      ),
    };
  }
  if (dedup.kind === "match") {
    return {
      response: NextResponse.json(
        { success: true, quote_request_id: dedup.existingId, dedup_hit: true },
        { status: 200, headers }
      ),
    };
  }

  // Photos → quotes/{client_id}/{index}.{ext} in the booking-photos bucket.
  const photoFiles = formData
    .getAll("photo")
    .filter((p): p is File => p instanceof File);
  if (photoFiles.length > 3) {
    return {
      response: NextResponse.json(
        { success: false, error: "Maximum 3 photos allowed." },
        { status: 400, headers }
      ),
    };
  }

  const supabase = createAdminClient();
  const photoPaths: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const result = await processPhotoUpload({
      file: photoFiles[i],
      folder: `quotes/${data.client_id}`,
      index: i,
      supabase,
    });
    if (!result.ok) {
      const status = result.severity === "server" ? 500 : 400;
      return {
        response: NextResponse.json(
          { success: false, error: result.message },
          { status, headers }
        ),
      };
    }
    photoPaths.push(result.path);
  }

  return {
    fields: {
      firstName: data.first_name,
      lastName: data.last_name,
      email: (data.email ?? "").toLowerCase(),
      phone: data.phone,
      services: data.services,
      vehicleYear: data.vehicle_year ?? null,
      vehicleMake: data.vehicle_make ?? null,
      vehicleModel: data.vehicle_model ?? null,
      vehicleVin: data.vehicle_vin ?? null,
      licensePlate: data.license_plate ?? null,
      message: data.message.trim(),
      photoPaths,
    },
  };
}

// ── Legacy path: application/json (no photos) ──────────────────
// Transitional — see file header. Tolerant field extraction inherited from the
// Wix-bridge era. Remove with the JSON form.

async function buildFromJson(
  request: Request,
  headers: Record<string, string>
): Promise<BuildResult> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return {
      response: NextResponse.json(
        { success: false, error: "Invalid request" },
        { status: 400, headers }
      ),
    };
  }

  if (body.website || body["bot-field"]) {
    return { response: NextResponse.json({ success: true }, { status: 200, headers }) };
  }

  const getString = (keys: string[]): string => {
    for (const key of keys) {
      const val = body[key];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return "";
  };

  const firstName = getString(["first_name", "firstName", "First Name", "first name"]);
  const lastName = getString(["last_name", "lastName", "Last Name", "last name"]);
  const email = getString(["email", "Email", "e-mail"]).toLowerCase();
  const phone = getString(["phone", "Phone", "phone_number", "phoneNumber", "Phone Number"]);
  const vehicleMake = getString(["vehicle_make", "vehicleMake", "Vehicle Make", "make", "Make"]);
  const vehicleModel = getString(["vehicle_model", "vehicleModel", "Vehicle Model", "model", "Model"]);
  const vehicleYearRaw = getString(["vehicle_year", "vehicleYear", "Vehicle Year", "year", "Year"]);
  const message = getString(["message", "Message", "comments", "Comments", "notes", "Notes"]);

  const servicesRaw =
    body["services"] ??
    body["services_interested"] ??
    body["servicesInterested"] ??
    body["Services Interested In"] ??
    body["Services"] ??
    body["services_interested_in"] ??
    [];
  let services: string[] = [];
  if (Array.isArray(servicesRaw)) {
    services = servicesRaw.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  } else if (typeof servicesRaw === "string") {
    if (servicesRaw.startsWith("[")) {
      try {
        services = JSON.parse(servicesRaw).filter((s: unknown): s is string => typeof s === "string");
      } catch {
        /* fall through to comma-split */
      }
    }
    if (services.length === 0) {
      services = servicesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  if (!firstName || !phone) {
    return {
      response: NextResponse.json(
        { success: false, error: "Name and phone are required" },
        { status: 400, headers }
      ),
    };
  }
  if (services.length === 0) {
    return {
      response: NextResponse.json(
        { success: false, error: "Please select a service" },
        { status: 400, headers }
      ),
    };
  }

  const dedup = await findRecentQuoteRequest({ phone: storedPhone(phone) });
  if (dedup.kind === "error") {
    return {
      response: NextResponse.json(
        { success: false, error: dedup.message },
        { status: 500, headers }
      ),
    };
  }
  if (dedup.kind === "match") {
    return {
      response: NextResponse.json(
        { success: true, quote_request_id: dedup.existingId, dedup_hit: true },
        { status: 200, headers }
      ),
    };
  }

  return {
    fields: {
      firstName,
      lastName,
      email,
      phone,
      services,
      vehicleYear: vehicleYearRaw ? parseInt(vehicleYearRaw, 10) || null : null,
      vehicleMake: vehicleMake || null,
      vehicleModel: vehicleModel || null,
      // Legacy JSON path predates the plate/VIN field — it never collected one.
      vehicleVin: null,
      licensePlate: null,
      message: message || null,
      photoPaths: [],
    },
  };
}
