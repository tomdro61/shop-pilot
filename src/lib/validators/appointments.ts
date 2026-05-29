// Zod validators for the public booking submission.
// Per BOOKING_TECHNICAL_PLAN.md §5.1.
//
// Photo files are NOT in this schema — they come through multipart parsing
// separately in the route handler. This schema validates the JSON `metadata`
// field of the multipart request.

import { z } from "zod";
import { VIN_REGEX } from "@/lib/vin/decode";

const E164 = /^\+1\d{10}$/;

// 1981 is the start of the standardized 17-char VIN era.
const MIN_VEHICLE_YEAR = 1981;

/**
 * Maximum vehicle year — dynamic relative to the current year so the schema
 * doesn't start rejecting legitimate next-model-year submissions over time.
 * Mirrors the DB CHECK constraint on vin_decode_cache.year. Exposed as a
 * function so tests can pin time.
 *
 * Note: this is invoked once at module-load when the schema is defined below.
 * Vercel cycles function instances frequently, so the staleness window is
 * effectively zero in practice. If a warm instance ever spanned a New Year,
 * the schema would briefly reject the new model year — acceptable trade-off
 * for the simpler reading of the schema. To re-evaluate per parse, wire it
 * through a `.refine` instead of `.max`.
 */
export function getMaxVehicleYear(now = new Date()): number {
  return now.getFullYear() + 2;
}

export const SERVICE_CATEGORIES = [
  "oil_change",
  "brakes",
  "tires",
  "diagnostic",
  "exhaust",
  "suspension",
  "other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const appointmentSubmitSchema = z
  .object({
    first_name: z.string().min(1).max(80),
    last_name: z.string().min(1).max(80),
    phone: z
      .string()
      .regex(E164, "Phone must be E.164 (+1XXXXXXXXXX)"),
    email: z.string().email().optional().or(z.literal("")),

    service_category: z.enum(SERVICE_CATEGORIES),

    description: z
      .string()
      .refine(
        (v) => v.trim().length >= 20,
        "Tell us a bit more about what's going on (20+ characters).",
      )
      .refine((v) => v.length <= 2000, "Description is too long."),

    conditional_data: z.record(z.string(), z.unknown()).default({}),

    vehicle_year: z.coerce
      .number()
      .int()
      .min(MIN_VEHICLE_YEAR)
      .max(getMaxVehicleYear())
      .optional(),
    vehicle_make: z.string().min(1).max(80).optional(),
    vehicle_model: z.string().min(1).max(80).optional(),
    vehicle_vin: z.string().regex(VIN_REGEX, "Invalid VIN").optional(),
    vehicle_mileage: z.coerce.number().int().min(0).max(1_000_000).optional(),

    preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preferred_time_window: z.enum(["morning", "afternoon"]),
    drop_off_or_wait: z.enum(["drop_off", "wait"]),

    // Client-generated UUID — becomes the appointment row's primary key AND the
    // storage folder prefix for any uploaded photos. Eliminates the
    // photo-upload-before-row-insert orphan race (per §5.3).
    client_id: z.string().uuid(),

    // Honeypot — submissions with anything in `website` are silently rejected.
    website: z.string().optional(),
  })
  .refine(
    (data) => {
      // Sunday is closed all day. Defense in depth — the UI disables Sundays,
      // but a client bypassing the UI shouldn't be able to slip through.
      // Noon UTC is firmly inside the ET calendar day regardless of DST.
      const dow = new Date(data.preferred_date + "T12:00:00Z").getUTCDay();
      return dow !== 0;
    },
    {
      message: "Sundays are closed. Please pick a different day.",
      path: ["preferred_date"],
    },
  )
  .refine(
    (data) => {
      // Saturday afternoon is invalid — shop closes at 2pm.
      const dow = new Date(data.preferred_date + "T12:00:00Z").getUTCDay();
      return !(dow === 6 && data.preferred_time_window === "afternoon");
    },
    {
      message:
        "Saturday afternoon appointments aren't available — our shop closes at 2pm.",
      path: ["preferred_time_window"],
    },
  );

export type AppointmentSubmitInput = z.infer<typeof appointmentSubmitSchema>;
