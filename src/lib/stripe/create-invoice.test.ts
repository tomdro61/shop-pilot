/**
 * Tests for addJobInvoiceItems — the shared helper that builds Stripe invoice
 * line items from job line items + totals. Used by both the hosted-invoice
 * flow (createStripeInvoice) and the charge-card-on-file flow. Regressions
 * here corrupt every customer invoice.
 */
import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { addJobInvoiceItems, type StripeInvoiceLineItem } from "./create-invoice";
import type { TotalsBreakdown } from "@/lib/utils/totals";

const CUSTOMER_ID = "cus_test123";
const INVOICE_ID = "in_test123";

interface StripeMock {
  invoiceItems: { create: ReturnType<typeof vi.fn> };
}

function makeStripeMock(): StripeMock {
  return {
    invoiceItems: { create: vi.fn().mockResolvedValue({}) },
  };
}

function totals(overrides: Partial<TotalsBreakdown> = {}): TotalsBreakdown {
  return {
    laborTotal: 0,
    partsTotal: 0,
    shopSupplies: 0,
    shopSuppliesEnabled: false,
    hazmat: 0,
    hazmatEnabled: false,
    hazmatLabel: "Environmental Fee",
    taxableAmount: 0,
    taxAmount: 0,
    taxRate: 0.0625,
    grandTotal: 0,
    ...overrides,
  };
}

describe("addJobInvoiceItems — line items only", () => {
  it("creates one invoice item per labor + part with rounded cents", async () => {
    const stripe = makeStripeMock();
    const lineItems: StripeInvoiceLineItem[] = [
      { type: "labor", description: "Oil change labor", quantity: 0.5, unit_cost: 130 },
      { type: "part", description: "Oil filter", quantity: 1, unit_cost: 12 },
    ];
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      lineItems,
      totals({ laborTotal: 65, partsTotal: 12, grandTotal: 77 })
    );

    expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(2);
    expect(stripe.invoiceItems.create).toHaveBeenNthCalledWith(1, {
      customer: CUSTOMER_ID,
      invoice: INVOICE_ID,
      description: "Oil change labor (0.5 x $130.00)",
      amount: 6500,
      currency: "usd",
    });
    expect(stripe.invoiceItems.create).toHaveBeenNthCalledWith(2, {
      customer: CUSTOMER_ID,
      invoice: INVOICE_ID,
      description: "Oil filter (1 x $12.00)",
      amount: 1200,
      currency: "usd",
    });
  });

  it("rounds penny-precision amounts correctly (qty 3 × $12.99 = 3897 cents, not 3896 or 3898)", async () => {
    const stripe = makeStripeMock();
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      [{ type: "part", description: "Spark plug", quantity: 3, unit_cost: 12.99 }],
      totals({ partsTotal: 38.97 })
    );
    const call = stripe.invoiceItems.create.mock.calls[0][0];
    expect(call.amount).toBe(3897);
  });
});

describe("addJobInvoiceItems — fees & tax", () => {
  it("adds a Shop Supplies line when enabled and amount > 0", async () => {
    const stripe = makeStripeMock();
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      [{ type: "labor", description: "L", quantity: 1, unit_cost: 100 }],
      totals({
        laborTotal: 100,
        shopSuppliesEnabled: true,
        shopSupplies: 5,
        grandTotal: 105,
      })
    );
    const calls = stripe.invoiceItems.create.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toMatchObject({
      description: "Shop Supplies",
      amount: 500,
    });
  });

  it("does NOT add Shop Supplies line when enabled but amount is 0 (e.g., scoped out by category)", async () => {
    const stripe = makeStripeMock();
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      [{ type: "labor", description: "L", quantity: 1, unit_cost: 100 }],
      totals({ laborTotal: 100, shopSuppliesEnabled: true, shopSupplies: 0 })
    );
    expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(1);
  });

  it("adds a Hazmat line with the configured label when enabled", async () => {
    const stripe = makeStripeMock();
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      [{ type: "part", description: "P", quantity: 1, unit_cost: 50 }],
      totals({
        partsTotal: 50,
        hazmatEnabled: true,
        hazmat: 3,
        hazmatLabel: "Environmental Fee",
        grandTotal: 53,
      })
    );
    const calls = stripe.invoiceItems.create.mock.calls;
    expect(calls[1][0]).toMatchObject({
      description: "Environmental Fee",
      amount: 300,
    });
  });

  it("adds an MA Sales Tax line formatted with the rate when taxAmount > 0", async () => {
    const stripe = makeStripeMock();
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      [{ type: "part", description: "P", quantity: 1, unit_cost: 100 }],
      totals({
        partsTotal: 100,
        taxableAmount: 100,
        taxAmount: 6.25,
        taxRate: 0.0625,
        grandTotal: 106.25,
      })
    );
    const calls = stripe.invoiceItems.create.mock.calls;
    expect(calls[1][0]).toMatchObject({
      description: "MA Sales Tax (6.25%)",
      amount: 625,
    });
  });

  it("creates labor + parts + supplies + hazmat + tax in the documented order", async () => {
    const stripe = makeStripeMock();
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      [
        { type: "labor", description: "L", quantity: 1, unit_cost: 100 },
        { type: "part", description: "P", quantity: 1, unit_cost: 50 },
      ],
      totals({
        laborTotal: 100,
        partsTotal: 50,
        shopSuppliesEnabled: true,
        shopSupplies: 5,
        hazmatEnabled: true,
        hazmat: 3,
        taxableAmount: 50,
        taxAmount: 3.13,
        grandTotal: 161.13,
      })
    );

    const descriptions = stripe.invoiceItems.create.mock.calls.map(
      (c) => (c[0] as { description: string }).description
    );
    expect(descriptions).toEqual([
      "L (1 x $100.00)",
      "P (1 x $50.00)",
      "Shop Supplies",
      "Environmental Fee",
      "MA Sales Tax (6.25%)",
    ]);
  });

  it("does NOT add a tax line when taxAmount is 0 (labor-only job)", async () => {
    const stripe = makeStripeMock();
    await addJobInvoiceItems(
      stripe as unknown as Stripe,
      INVOICE_ID,
      CUSTOMER_ID,
      [{ type: "labor", description: "L", quantity: 1, unit_cost: 100 }],
      totals({ laborTotal: 100, taxAmount: 0 })
    );
    const descriptions = stripe.invoiceItems.create.mock.calls.map(
      (c) => (c[0] as { description: string }).description
    );
    expect(descriptions).not.toContain(
      expect.stringContaining("Tax")
    );
    expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(1);
  });
});
