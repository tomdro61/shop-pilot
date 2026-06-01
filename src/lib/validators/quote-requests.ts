// Zod validator for the public estimate (quote) request submission — the
// multipart path of /api/quote-requests, mirroring appointmentSubmitSchema.
//
// Photo files are NOT in this schema; they arrive as separate multipart parts
// and are validated in the route. This validates the JSON `metadata` field.
//
// Mostly mirrors the booking schema. The vehicle fields stay optional at the
// server boundary (the form enforces requiredness client-side, matching the
// booking flow), but the description is required here too (>=10 chars): the
// public form lives in a separate repo, so this schema is the real trust boundary.

import { z } from "zod";

const E164 = /^\+1\d{10}$/;

// Estimates may cover classics, so this floor is looser than the booking
// schema's 1981 (standardized-VIN era).
const MIN_VEHICLE_YEAR = 1900;

export function getMaxVehicleYear(now = new Date()): number {
  return now.getFullYear() + 2;
}

// Empty-string / null optionals come through as "absent" — the form omits empty
// optional fields, but a stray "" shouldn't trip the number coercion or min().
const emptyToUndefined = (v: unknown) =>
  v === "" || v === null ? undefined : v;

export const quoteRequestSubmitSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().regex(E164, "Phone must be E.164 (+1XXXXXXXXXX)"),
  email: z.string().email().optional().or(z.literal("")),

  // Multi-select service labels (display strings, e.g. "Brake Repair").
  services: z
    .array(z.string().trim().min(1).max(100))
    .min(1, "Please pick at least one service.")
    .max(20),

  // Free-text "what's going on" (stored in quote_requests.message). Required,
  // mirroring the booking form's describe-the-issue step.
  message: z
    .string()
    .refine((v) => v.trim().length >= 10, "Tell us a bit about what's going on (10+ characters).")
    .refine((v) => v.length <= 2000, "Description is too long."),

  vehicle_year: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(MIN_VEHICLE_YEAR).max(getMaxVehicleYear()).optional(),
  ),
  vehicle_make: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  vehicle_model: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),

  // Client-generated UUID — the storage folder prefix for uploaded photos
  // (quotes/{client_id}/). Mirrors the booking flow's orphan-free upload: the
  // folder name is known before insert, so a failed insert can't strand photos
  // under an unknown id.
  client_id: z.string().uuid(),

  // Honeypot — submissions with anything here are silently accepted-and-dropped.
  website: z.string().optional(),
});

export type QuoteRequestSubmitInput = z.infer<typeof quoteRequestSubmitSchema>;
