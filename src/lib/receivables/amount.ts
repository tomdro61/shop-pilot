import { calculateTotals } from "@/lib/utils/totals";

export type ReceivableLineItem = {
  type: string;
  quantity: number;
  unit_cost: number;
  total: number | null;
  category: string | null;
};

export type ReceivableSettings = NonNullable<Parameters<typeof calculateTotals>[1]>;

export const RECEIVABLE_LINE_ITEMS_SELECT = "job_line_items(type, quantity, unit_cost, total, category)";

/**
 * What the customer owes on an unpaid job: the same grand total the invoice
 * bills, including sales tax, fees, and inspection-category lines. Revenue
 * reports exclude inspection lines; A/R must not, because the customer is
 * still charged for them.
 */
export function receivableAmount(
  job: { charge_sales_tax: boolean | null; job_line_items: ReceivableLineItem[] | null },
  settings: ReceivableSettings
): number {
  return calculateTotals(job.job_line_items ?? [], settings, job.charge_sales_tax !== false).grandTotal;
}
