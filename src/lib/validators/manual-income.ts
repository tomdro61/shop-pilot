import { z } from "zod";

const PCT_MESSAGE = "Shop keep % must be between 0 and 100";

export const manualIncomeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  amount: z.number().positive("Amount must be greater than 0"),
  shop_keep_pct: z.number().min(0, PCT_MESSAGE).max(100, PCT_MESSAGE),
  label: z.string().trim().min(1, "Label is required"),
  category: z.string().trim().min(1, "Category is required"),
  customer_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const manualIncomeUpdateSchema = manualIncomeSchema.partial();

export type ManualIncomeInput = z.infer<typeof manualIncomeSchema>;
export type ManualIncomeUpdateInput = z.infer<typeof manualIncomeUpdateSchema>;
