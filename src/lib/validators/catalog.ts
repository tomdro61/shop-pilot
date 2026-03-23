import { z } from "zod";

export const catalogItemSchema = z.object({
  type: z.enum(["labor", "part"]),
  description: z.string().min(1, "Description is required").max(500),
  default_quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  default_unit_cost: z.number().min(0, "Price must be 0 or greater"),
  default_cost: z.number().min(0).nullable().optional(),
  part_number: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
});

export type CatalogItemFormData = z.infer<typeof catalogItemSchema>;
