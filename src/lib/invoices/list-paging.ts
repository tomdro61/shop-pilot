import { z } from "zod";

export const INVOICES_PAGE_SIZE = 25;

export const invoiceListFiltersSchema = z.object({
  status: z.enum(["draft", "sent", "paid"]).optional(),
  search: z.string().max(200).optional(),
  source: z.enum(["jobs", "parking"]).optional(),
});
export type InvoiceListFilters = z.infer<typeof invoiceListFiltersSchema>;

export const invoiceCursorSchema = z.object({
  created_at: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
export type InvoiceCursor = z.infer<typeof invoiceCursorSchema>;

export const loadMoreInvoicesInputSchema = z.object({
  filters: invoiceListFiltersSchema,
  cursor: invoiceCursorSchema,
});

// Keyset predicate for the (created_at desc, id desc) sort. Both values are
// validated by invoiceCursorSchema before they reach a PostgREST filter string.
export function invoiceCursorFilter(cursor: InvoiceCursor): string {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}
