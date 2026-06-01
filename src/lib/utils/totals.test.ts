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
