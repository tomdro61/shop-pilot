import { z } from "zod";

export const estimateLineItemSchema = z.object({
  estimate_id: z.string().uuid(),
  type: z.enum(["labor", "part"]),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_cost: z.number().min(0, "Cost must be 0 or greater"),
  part_number: z.string().max(100),
});

export type EstimateLineItemFormData = z.infer<typeof estimateLineItemSchema>;

export function prepareEstimateLineItemData(data: EstimateLineItemFormData) {
  return {
    estimate_id: data.estimate_id,
    type: data.type,
    description: data.description,
    quantity: data.quantity,
    unit_cost: data.unit_cost,
    part_number: data.part_number || null,
  };
}
