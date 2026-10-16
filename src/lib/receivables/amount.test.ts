import { describe, it, expect } from "vitest";
import { receivableAmount, type ReceivableLineItem, type ReceivableSettings } from "./amount";
import { DEFAULT_SETTINGS } from "@/lib/utils/totals";

const settings: ReceivableSettings = { ...DEFAULT_SETTINGS, tax_rate: 0.0625 };

const labor: ReceivableLineItem = { type: "labor", quantity: 1, unit_cost: 80, total: 80, category: "Brakes" };
const part: ReceivableLineItem = { type: "part", quantity: 1, unit_cost: 100, total: 100, category: "Brakes" };
const inspection: ReceivableLineItem = {
  type: "labor",
  quantity: 1,
  unit_cost: 35,
  total: 35,
  category: "State Inspection",
};

describe("receivableAmount", () => {
  it("includes sales tax on parts when the job charges it", () => {
    expect(receivableAmount({ charge_sales_tax: true, job_line_items: [labor, part] }, settings)).toBe(186.25);
  });

  it("omits sales tax when the job has it turned off", () => {
    expect(receivableAmount({ charge_sales_tax: false, job_line_items: [labor, part] }, settings)).toBe(180);
  });

  it("includes inspection-category lines — the customer is billed for them", () => {
    expect(receivableAmount({ charge_sales_tax: true, job_line_items: [inspection] }, settings)).toBe(35);
    expect(
      receivableAmount({ charge_sales_tax: true, job_line_items: [labor, part, inspection] }, settings)
    ).toBe(221.25);
  });

  it("uses the rate from the settings passed in, not a default", () => {
    const sevenPct: ReceivableSettings = { ...settings, tax_rate: 0.07 };
    expect(receivableAmount({ charge_sales_tax: true, job_line_items: [part] }, sevenPct)).toBe(107);
  });

  it("includes enabled shop fees", () => {
    const withHazmat: ReceivableSettings = { ...settings, hazmat_enabled: true, hazmat_amount: 3 };
    expect(receivableAmount({ charge_sales_tax: true, job_line_items: [labor] }, withHazmat)).toBe(83);
  });

  it("is 0 for a job with no line items", () => {
    expect(receivableAmount({ charge_sales_tax: true, job_line_items: null }, settings)).toBe(0);
    expect(receivableAmount({ charge_sales_tax: true, job_line_items: [] }, settings)).toBe(0);
  });

  it("falls back to quantity × unit_cost when a line total is null", () => {
    const untotaled: ReceivableLineItem = { ...labor, quantity: 2, unit_cost: 50, total: null };
    expect(receivableAmount({ charge_sales_tax: true, job_line_items: [untotaled] }, settings)).toBe(100);
  });
});
