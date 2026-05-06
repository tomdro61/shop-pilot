import { z } from "zod";
import { todayET, etDateTimeToUtcIso } from "@/lib/utils";

export const jobSchema = z.object({
  customer_id: z.string().uuid("Please select a customer"),
  vehicle_id: z.string().uuid().nullable().optional(),
  status: z.enum([
    "not_started",
    "waiting_for_parts",
    "in_progress",
    "complete",
    "cancelled",
  ]),
  title: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  assigned_tech: z.string().uuid().nullable().optional(),
  date_received: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  date_finished: z.string().nullable().optional(),
  // HH:MM 24h string from <input type="time">. Empty when no drop-off time
  // was given. Combined with date_received in prepareJobData to form
  // scheduled_at. Regex enforces 00:00–23:59 so 25:99 / 99:00 / 30:60 etc.
  // can never reach prepareJobData and produce a wrong-day timestamp.
  scheduled_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24h)")
    .nullable()
    .optional()
    .or(z.literal("")),
  notes: z.string().max(5000),
  payment_method: z.enum(["stripe", "cash", "check", "ach", "terminal"]).nullable().optional(),
  payment_status: z.enum(["unpaid", "invoiced", "paid", "waived"]),
  mileage_in: z.number().int().positive().nullable().optional(),
});

export type JobFormData = z.infer<typeof jobSchema>;

export function prepareJobData(data: JobFormData) {
  return {
    customer_id: data.customer_id,
    vehicle_id: data.vehicle_id || null,
    status: data.status,
    title: data.title || null,
    category: data.category || null,
    assigned_tech: data.assigned_tech || null,
    date_received: data.date_received,
    date_finished: data.status === "complete"
      ? (data.date_finished || todayET())
      : null,
    // Build the timestamptz explicitly in ET — `new Date(`${d}T${t}`)`
    // would parse in the runtime's local TZ, which on Vercel is UTC, and
    // silently store every drop-off time 4–5 hours off. etDateTimeToUtcIso
    // uses an Intl probe so EDT vs EST is handled correctly per date.
    scheduled_at: data.scheduled_time
      ? etDateTimeToUtcIso(data.date_received, data.scheduled_time)
      : null,
    notes: data.notes || null,
    payment_method: data.payment_method || null,
    payment_status: data.payment_status || "unpaid",
    mileage_in: data.mileage_in ?? null,
  };
}

export const lineItemSchema = z.object({
  job_id: z.string().uuid(),
  type: z.enum(["labor", "part"]),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_cost: z.number().min(0, "Cost must be 0 or greater"),
  cost: z.number().min(0).nullable().optional(),
  part_number: z.string().max(100),
  category: z.string().max(100).nullable().optional(),
});

export type LineItemFormData = z.infer<typeof lineItemSchema>;

export function prepareLineItemData(data: LineItemFormData) {
  // Trim + collapse empty/whitespace categories to NULL so the DB never
  // stores "" — that ambiguity ("no category picked" vs literal empty string)
  // breaks downstream grouping and reports.
  const trimmed = data.category?.trim();
  const category = trimmed && trimmed.length > 0 ? trimmed : null;
  return {
    job_id: data.job_id,
    type: data.type,
    description: data.description,
    quantity: data.quantity,
    unit_cost: data.unit_cost,
    cost: data.type === "part" ? (data.cost ?? null) : null,
    part_number: data.part_number || null,
    category,
  };
}
