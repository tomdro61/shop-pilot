import { z } from "zod";

export const jobSchema = z.object({
  customer_id: z.string().uuid("Please select a customer"),
  vehicle_id: z.string().uuid().nullable().optional(),
  status: z.enum([
    "not_started",
    "waiting_for_parts",
    "in_progress",
    "complete",
    "paid",
  ]),
  category: z.string().max(100),
  assigned_tech: z.string().uuid().nullable().optional(),
  date_received: z.string().min(1, "Date is required"),
  date_finished: z.string().nullable().optional(),
  notes: z.string().max(5000),
});

export type JobFormData = z.infer<typeof jobSchema>;

export function prepareJobData(data: JobFormData) {
  return {
    customer_id: data.customer_id,
    vehicle_id: data.vehicle_id || null,
    status: data.status,
    category: data.category || null,
    assigned_tech: data.assigned_tech || null,
    date_received: data.date_received,
    date_finished: data.date_finished || null,
    notes: data.notes || null,
  };
}

export const lineItemSchema = z.object({
  job_id: z.string().uuid(),
  type: z.enum(["labor", "part"]),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_cost: z.number().min(0, "Cost must be 0 or greater"),
  part_number: z.string().max(100),
});

export type LineItemFormData = z.infer<typeof lineItemSchema>;

export function prepareLineItemData(data: LineItemFormData) {
  return {
    job_id: data.job_id,
    type: data.type,
    description: data.description,
    quantity: data.quantity,
    unit_cost: data.unit_cost,
    part_number: data.part_number || null,
  };
}
