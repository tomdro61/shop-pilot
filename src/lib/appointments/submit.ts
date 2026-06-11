// Orchestrator for /api/appointments/submit. Two-phase to keep dedup ahead of
// photo upload — a same-second double-tap shouldn't burn storage on photos
// that will be discarded.
//
// Per BOOKING_TECHNICAL_PLAN.md §5.1.

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import type { AppointmentSubmitInput } from "@/lib/validators/appointments";
import { findOrCreateBookingCustomer } from "./find-or-create-customer";
import { findOrCreateVehicle } from "./find-or-create-vehicle";
import { decodeVin } from "@/lib/vin/decode";
import { createOrUpdateQuoContact } from "@/lib/quo/contacts";

const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export type DedupCheckResult =
  | { kind: "match"; existingId: string }
  | { kind: "no_match" }
  | { kind: "error"; message: string };

/**
 * Look for a recent submission with the SAME phone + date + requested time.
 *
 * **Three-key dedup (phone + preferred_date + preferred_time).** Catches true
 * double-taps (network retry, double-click) but lets a time-correction (9am →
 * 10am) land as a NEW row the manager reconciles on the inbox. Keying on the
 * exact hour (not the coarse morning/afternoon window) preserves that
 * "corrections create a new row" intent at hour granularity — don't drop it.
 */
export async function findExistingAppointment(opts: {
  phone: string;
  preferred_date: string;
  preferred_time: string;
  supabase?: SupabaseClient<Database>;
}): Promise<DedupCheckResult> {
  const supabase = opts.supabase ?? createAdminClient();
  const fiveMinAgo = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("snapshot_customer_phone", opts.phone)
    .eq("preferred_date", opts.preferred_date)
    .eq("preferred_time", opts.preferred_time)
    .gte("submitted_at", fiveMinAgo)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[findExistingAppointment] query failed:", error.message);
    return { kind: "error", message: "Could not check for duplicates." };
  }

  if (data) return { kind: "match", existingId: data.id };
  return { kind: "no_match" };
}

export type InsertAppointmentInput = AppointmentSubmitInput & {
  photo_paths: string[];
};

export type InsertAppointmentResult =
  | {
      ok: true;
      appointment_id: string;
      customer_id: string | null; // the value behind customer_link; the route needs the id itself to log the ack SMS
      customer_link: boolean; // false if find-or-create-customer failed
      vehicle_link: boolean; // false if no vehicle info OR helper failed
    }
  | { ok: false; error: "insert_failed"; message: string };

/**
 * Insert a new appointment row. Resolves customer + vehicle via find-or-create
 * (running through NHTSA VIN decode if a VIN is provided and Y/M/M is missing).
 *
 * Must be preceded by a dedup miss from findExistingAppointment — this function
 * always inserts.
 */
export async function insertAppointment(
  input: InsertAppointmentInput,
  deps?: { supabase?: SupabaseClient<Database> }
): Promise<InsertAppointmentResult> {
  const supabase = deps?.supabase ?? createAdminClient();

  // 1. Find-or-create customer. Null on failure — appointment still saves with
  //    no customer link; dashboard surfaces a "needs manual link" badge.
  const customerId = await findOrCreateBookingCustomer({
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email && input.email.length > 0 ? input.email : null,
    phone: input.phone,
  });

  // 1b. Create/update the Quo (OpenPhone) contact so the booker is reachable from
  //     the inbox, mirroring the parking + estimate flows. Best-effort and
  //     independent of the customer link — a Quo failure never blocks the booking.
  //     input.phone is already E.164 (schema-validated).
  let quoContactId: string | null = null;
  try {
    const quo = await createOrUpdateQuoContact({
      phone: input.phone,
      firstName: input.first_name,
      lastName: input.last_name,
      email: input.email && input.email.length > 0 ? input.email : undefined,
    });
    quoContactId = quo.contactId ?? null;
  } catch (err) {
    console.error(
      `[insertAppointment] Quo contact error for ${input.client_id}:`,
      err instanceof Error ? err.message : err
    );
  }

  // 2. VIN decode + find-or-create vehicle (only if there's something to match on)
  let vehicleId: string | null = null;
  let snapshotYear = input.vehicle_year;
  let snapshotMake = input.vehicle_make;
  let snapshotModel = input.vehicle_model;
  let vinDecodeStatus: "decoded" | "decode_failed" | "not_attempted" =
    "not_attempted";

  const hasAnyVehicleInfo =
    input.vehicle_vin ||
    input.license_plate ||
    input.vehicle_year ||
    input.vehicle_make ||
    input.vehicle_model;

  if (customerId && hasAnyVehicleInfo) {
    // Run NHTSA decode if a VIN is provided. Fill in any missing Y/M/M from the
    // decode result so the vehicle row and the appointment snapshot are populated
    // from the authoritative VIN data.
    if (input.vehicle_vin) {
      const decoded = await decodeVin(input.vehicle_vin);
      if (decoded) {
        vinDecodeStatus = "decoded";
        snapshotYear = snapshotYear ?? decoded.year ?? undefined;
        snapshotMake = snapshotMake ?? decoded.make ?? undefined;
        snapshotModel = snapshotModel ?? decoded.model ?? undefined;
      } else {
        vinDecodeStatus = "decode_failed";
        // The customer typed a VIN we couldn't decode. The Y/M/M they typed
        // may not match the actual vehicle. Surface this on the row so the
        // manager can verify with the customer at confirm time.
        console.warn(
          `[insertAppointment] VIN decode failed for ${input.vehicle_vin} (appointment ${input.client_id})`
        );
      }
    }

    vehicleId = await findOrCreateVehicle({
      customer_id: customerId,
      year: snapshotYear,
      make: snapshotMake,
      model: snapshotModel,
      vin: input.vehicle_vin,
      license_plate: input.license_plate,
      mileage: input.vehicle_mileage,
    });
  }

  // Surface unresolved customer / vehicle links as a loud warning. Until the
  // inbox dashboard (step 6) wires a query against `customer_id IS NULL`, this
  // log line is the only operational signal that a booking landed without a
  // proper link. Grep `[booking-needs-link]` in Vercel logs.
  if (!customerId || (hasAnyVehicleInfo && !vehicleId)) {
    console.warn(
      `[booking-needs-link] appointment ${input.client_id} needs manual link: ` +
        `customer=${customerId ?? "null"} vehicle=${vehicleId ?? "null"} ` +
        `phone=${input.phone}`
    );
  }

  // 3. Insert the appointment with the client-generated UUID as the row id
  //    (matches the storage folder prefix used for photo uploads, so a failed
  //    insert leaves the cleanup cron able to identify orphan photo folders).
  const { data: inserted, error: insertErr } = await supabase
    .from("appointments")
    .insert({
      id: input.client_id,
      customer_id: customerId,
      vehicle_id: vehicleId,
      quo_contact_id: quoContactId,
      service_category: input.service_category,
      description: input.description,
      // Zod parses conditional_data as Record<string, unknown>; cast to Json
      // (structurally compatible) so the Supabase Insert type accepts it.
      // Also tag the VIN decode outcome so the manager can flag "VIN didn't
      // decode" appointments at confirm time without re-running the decode.
      conditional_data: {
        ...(input.conditional_data ?? {}),
        ...(input.vehicle_vin ? { vin_decode_status: vinDecodeStatus } : {}),
      } as Json,
      preferred_date: input.preferred_date,
      preferred_time: input.preferred_time,
      // Coarse window derived from the requested hour (kept for the
      // Saturday-afternoon guard + legacy grouping; the form no longer sends it).
      preferred_time_window:
        Number(input.preferred_time.slice(0, 2)) < 12 ? "morning" : "afternoon",
      drop_off_or_wait: input.drop_off_or_wait,
      photo_paths: input.photo_paths,
      source: "website",
      snapshot_customer_name: `${input.first_name} ${input.last_name}`,
      snapshot_customer_phone: input.phone,
      snapshot_customer_email:
        input.email && input.email.length > 0 ? input.email : null,
      snapshot_vehicle_year: snapshotYear ?? null,
      snapshot_vehicle_make: snapshotMake ?? null,
      snapshot_vehicle_model: snapshotModel ?? null,
      snapshot_vehicle_plate: input.license_plate ?? null,
      snapshot_vehicle_vin: input.vehicle_vin ?? null,
      snapshot_vehicle_mileage: input.vehicle_mileage ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[insertAppointment] insert failed:",
      insertErr?.message ?? "no row returned"
    );
    return {
      ok: false,
      error: "insert_failed",
      message: "Could not save the appointment.",
    };
  }

  return {
    ok: true,
    appointment_id: inserted.id,
    customer_id: customerId,
    customer_link: customerId !== null,
    vehicle_link: vehicleId !== null,
  };
}
