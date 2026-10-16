import { calculateTotals } from "@/lib/utils/totals";

export type PaymentSnapshot = {
  amount_collected: number;
  taxable_collected: number;
  tax_collected: number;
  tax_rate_applied: number;
};

export const CLEARED_PAYMENT_SNAPSHOT = {
  amount_collected: null,
  taxable_collected: null,
  tax_collected: null,
  tax_rate_applied: null,
} as const;

// The amount is known (the processor collected it) but the tax figures can't
// be derived with confidence: settings didn't load, or the lines no longer add
// up to what was charged. The tax reports treat these rows as un-snapshotted.
export type AmountOnlySnapshot = {
  amount_collected: number;
  taxable_collected: null;
  tax_collected: null;
  tax_rate_applied: null;
};

export function amountOnlySnapshot(amountCents: number): AmountOnlySnapshot {
  return {
    amount_collected: amountCents / 100,
    taxable_collected: null,
    tax_collected: null,
    tax_rate_applied: null,
  };
}

type SnapshotLineItem = {
  type: string;
  quantity: number;
  unit_cost: number;
  total?: number | null;
  category?: string | null;
};

type SnapshotSettings = Parameters<typeof calculateTotals>[1];

// The figures frozen onto a job when it becomes paid, computed from the lines
// at that moment. Callers that have a processor figure (Stripe amount_paid, a
// PaymentIntent amount) override amount_collected with it.
export function buildPaymentSnapshot(
  lineItems: SnapshotLineItem[],
  settings: NonNullable<SnapshotSettings>,
  chargeSalesTax: boolean
): PaymentSnapshot {
  const totals = calculateTotals(lineItems, settings, chargeSalesTax);
  return {
    amount_collected: totals.grandTotal,
    taxable_collected: totals.taxableAmount,
    tax_collected: totals.taxAmount,
    tax_rate_applied: totals.taxRate,
  };
}
