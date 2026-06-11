// Server-side helpers for the public estimate (quote) request submission.
// Shared by /api/quote-requests across both the multipart (new, photo-capable)
// and legacy JSON paths. Mirrors src/lib/appointments/submit.ts.

import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateParkingCustomer } from "@/lib/parking-customer";
import { createOrUpdateQuoContact } from "@/lib/quo/contacts";
import { toE164 } from "@/lib/quo/format";

export type QuoteFields = {
  firstName: string;
  lastName: string;
  email: string; // "" when none
  phone: string; // raw (pre-E.164)
  services: string[];
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleVin: string | null;
  licensePlate: string | null;
  message: string | null;
  photoPaths: string[];
};

export type DedupResult =
  | { kind: "none" }
  | { kind: "match"; existingId: string }
  | { kind: "error"; message: string };

const DEDUP_WINDOW_MS = 10 * 60_000;

// Double-tap guard: same phone within the last 10 minutes → the same request.
// Estimates carry no date/time to key on (unlike bookings), so the key is
// phone + a short window — enough to swallow a double submit without blocking a
// genuine second request later in the day. `phone` must be exactly as stored
// (E.164 when normalization succeeded, raw otherwise).
export async function findRecentQuoteRequest(opts: {
  phone: string;
  now?: number;
}): Promise<DedupResult> {
  const supabase = createAdminClient();
  const since = new Date((opts.now ?? Date.now()) - DEDUP_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("quote_requests")
    .select("id")
    .eq("phone", opts.phone)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[quote-requests] dedup check failed:", error.message);
    return { kind: "error", message: "Could not check for duplicates." };
  }
  return data ? { kind: "match", existingId: data.id } : { kind: "none" };
}

export type PersistResult =
  | {
      ok: true;
      id: string;
      customerId: string | null;
      quoContactId: string | null;
      e164: string | null;
    }
  | { ok: false; message: string };

// Normalize the stored phone the same way persistQuoteRequest does, so the dedup
// query keys on the value that will actually be written.
export function storedPhone(rawPhone: string): string {
  return toE164(rawPhone) || rawPhone;
}

export async function persistQuoteRequest(fields: QuoteFields): Promise<PersistResult> {
  const supabase = createAdminClient();
  const e164 = toE164(fields.phone);

  // find-or-create customer (dedup by email then phone). Best-effort: a null id
  // still saves the request — the manager links it manually — mirroring the
  // booking flow's null-customer handling. Logged loudly, never silently dropped.
  let customerId: string | null = null;
  try {
    customerId = await findOrCreateParkingCustomer({
      first_name: fields.firstName,
      last_name: fields.lastName,
      email: fields.email,
      phone: fields.phone,
    });
  } catch (err) {
    console.error("[quote-requests] customer upsert failed:", err);
  }

  let quoContactId: string | null = null;
  if (e164) {
    try {
      const result = await createOrUpdateQuoContact({
        phone: e164,
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email,
      });
      quoContactId = result.contactId ?? null;
    } catch (err) {
      console.error("[quote-requests] Quo contact error:", err);
    }
  }

  const { data: inserted, error } = await supabase
    .from("quote_requests")
    .insert({
      customer_id: customerId,
      quo_contact_id: quoContactId,
      first_name: fields.firstName,
      last_name: fields.lastName,
      email: fields.email,
      phone: e164 || fields.phone,
      services: fields.services,
      vehicle_make: fields.vehicleMake,
      vehicle_model: fields.vehicleModel,
      vehicle_year: fields.vehicleYear,
      vehicle_vin: fields.vehicleVin,
      license_plate: fields.licensePlate,
      message: fields.message,
      photo_paths: fields.photoPaths,
      status: "new",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[quote-requests] DB insert failed:", error?.message);
    return { ok: false, message: "Failed to save request" };
  }

  return { ok: true, id: inserted.id, customerId, quoContactId, e164 };
}
