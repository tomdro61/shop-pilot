import { z } from "zod";

export const estimateSchema = z.object({
  customer_id: z.string().uuid("Please select a customer"),
  vehicle_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).optional(),
});

export type EstimateFormData = z.infer<typeof estimateSchema>;

export const estimateLineItemSchema = z.object({
  estimate_id: z.string().uuid(),
  type: z.enum(["labor", "part"]),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_cost: z.number().min(0, "Cost must be 0 or greater"),
  cost: z.number().min(0).nullable().optional(),
  part_number: z.string().max(100),
  category: z.string().max(100).nullable().optional(),
});

export type EstimateLineItemFormData = z.infer<typeof estimateLineItemSchema>;

export function prepareEstimateLineItemData(data: EstimateLineItemFormData) {
  // Trim + collapse empty/whitespace categories to NULL so the DB never
  // stores "" — that ambiguity ("no category picked" vs literal empty string)
  // breaks downstream grouping and reports.
  const trimmed = data.category?.trim();
  const category = trimmed && trimmed.length > 0 ? trimmed : null;
  return {
    estimate_id: data.estimate_id,
    type: data.type,
    description: data.description,
    quantity: data.quantity,
    unit_cost: data.unit_cost,
    // cost is internal (wholesale) — only meaningful for parts; null otherwise
    // so margin reports don't pick up a labor row as a part.
    cost: data.type === "part" ? (data.cost ?? null) : null,
    part_number: data.part_number || null,
    category,
  };
}
