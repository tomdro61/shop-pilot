import { z } from "zod";

export const shopSettingsSchema = z.object({
  tax_rate: z.number().min(0).max(1),
  shop_supplies_enabled: z.boolean(),
  shop_supplies_method: z.enum([
    "percent_of_labor",
    "percent_of_parts",
    "percent_of_total",
    "flat",
  ]),
  shop_supplies_rate: z.number().min(0),
  shop_supplies_cap: z.number().min(0).nullable(),
  hazmat_enabled: z.boolean(),
  hazmat_amount: z.number().min(0),
  hazmat_label: z.string().min(1).max(100),
  job_categories: z.array(z.string().min(1).max(100)).min(1),
  shop_supplies_categories: z.array(z.string()).nullable().optional(),
  hazmat_categories: z.array(z.string()).nullable().optional(),
});

export type ShopSettingsFormData = z.infer<typeof shopSettingsSchema>;
