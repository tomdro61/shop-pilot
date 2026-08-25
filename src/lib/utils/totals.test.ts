import { describe, it, expect } from "vitest";
import { calculateTotals } from "./totals";

// Default settings (no arg) = 6.25% tax, shop supplies + hazmat off.
const labor = [{ type: "labor", quantity: 1, unit_cost: 80, total: 80 }];
const parts = [{ type: "part", quantity: 1, unit_cost: 100, total: 100 }];

describe("calculateTotals — chargeSalesTax", () => {
  it("taxes parts (not labor) at the settings rate by default", () => {
    const t = calculateTotals([...labor, ...parts]);
    expect(t.partsTotal).toBe(100);
    expect(t.taxableAmount).toBe(100);
    expect(t.taxAmount).toBe(6.25);
    expect(t.grandTotal).toBe(186.25);
  });

  it("zeroes tax when chargeSalesTax is false — parts are still billed", () => {
    const t = calculateTotals([...labor, ...parts], undefined, false);
    expect(t.partsTotal).toBe(100); // billed
    expect(t.taxableAmount).toBe(0); // but not taxable
    expect(t.taxAmount).toBe(0);
    expect(t.grandTotal).toBe(180); // labor + parts, no tax
  });

  it("charges tax when chargeSalesTax is explicitly true", () => {
    expect(calculateTotals(parts, undefined, true).taxAmount).toBe(6.25);
  });

  it("never taxes a labor-only job, regardless of the flag", () => {
    expect(calculateTotals(labor, undefined, true).taxAmount).toBe(0);
    expect(calculateTotals(labor, undefined, false).taxAmount).toBe(0);
  });
});

// A Quick Pay / walk-in counter sale is a flat, tax-inclusive amount: the operator
// keys in what the customer is charged, record_quick_pay_job writes one labor line
// item for exactly that and sets charge_sales_tax=false, and the card is charged
// that number. The receipt then RE-COMPUTES the total from settings — so if a fee
// that charge_sales_tax does not suppress ever switches on, the receipt starts
// claiming more than the card was charged, with nothing to flag it.
//
// shop_supplies_enabled and hazmat_enabled were both false in production on
// 2026-08-24, so this is currently correct. These tests fail the moment either is
// turned on, which is the point — the fix is to make counter sales opt out of fees,
// not to update the expected numbers here.
describe("calculateTotals — counter sale must equal what the card was charged", () => {
  const counterSale = [{ type: "labor", quantity: 1, unit_cost: 100, total: 100 }];

  it("renders a flat $100 counter sale as exactly $100", () => {
    const t = calculateTotals(counterSale, undefined, false);
    expect(t.grandTotal).toBe(100);
  });

  it("adds no fee a flat charge did not collect", () => {
    const t = calculateTotals(counterSale, undefined, false);
    expect(t.taxAmount).toBe(0);
    expect(t.shopSupplies).toBe(0);
    expect(t.hazmat).toBe(0);
  });

  it("still equals the charge when the sale carries a parts line", () => {
    // Presets can produce a part line (e.g. wipers). charge_sales_tax=false zeroes
    // the tax, so the total must still be the sum of what was keyed in.
    const withPart = [
      { type: "labor", quantity: 1, unit_cost: 60, total: 60 },
      { type: "part", quantity: 1, unit_cost: 40, total: 40 },
    ];
    expect(calculateTotals(withPart, undefined, false).grandTotal).toBe(100);
  });
});
