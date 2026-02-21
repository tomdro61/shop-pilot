import { z } from "zod";

export const createInvoiceSchema = z.object({
  job_id: z.string().uuid(),
});

export type CreateInvoiceFormData = z.infer<typeof createInvoiceSchema>;
