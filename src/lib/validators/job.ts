import { z } from "zod";

export const jobSchema = z.object({
  customer_id: z.string().uuid("Please select a customer"),
  vehicle_id: z.string().uuid().nullable().optional(),
  status: z.enum([
    "not_started",
    "waiting_for_parts",
    "in_progress",
    "complete",
  ]),
  title: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  assigned_tech: z.string().uuid().nullable().optional(),
  date_received: z.string().min(1, "Date is required"),
  date_finished: z.string().nullable().optional(),
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
    date_finished: data.date_finished || null,
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
  category: z.string().max(100).optional(),
});

export type LineItemFormData = z.infer<typeof lineItemSchema>;

export function prepareLineItemData(data: LineItemFormData) {
  return {
    job_id: data.job_id,
    type: data.type,
    description: data.description,
    quantity: data.quantity,
    unit_cost: data.unit_cost,
    cost: data.type === "part" ? (data.cost ?? null) : null,
    part_number: data.part_number || null,
    category: data.category || null,
  };
}
