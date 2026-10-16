import { describe, it, expect } from "vitest";
import { isInspectionCategory, isRevenueJob, sumJobRevenue } from "./revenue";

describe("isInspectionCategory", () => {
  it("matches the canonical inspection categories", () => {
    expect(isInspectionCategory("Inspection")).toBe(true);
    expect(isInspectionCategory("State Inspection")).toBe(true);
    expect(isInspectionCategory("TNC Inspection")).toBe(true);
  });

  it("matches regardless of casing (the H-3 regression)", () => {
    expect(isInspectionCategory("inspection")).toBe(true);
    expect(isInspectionCategory("state inspection")).toBe(true);
    expect(isInspectionCategory("STATE INSPECTION")).toBe(true);
    expect(isInspectionCategory("Tnc Inspection")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isInspectionCategory("  State Inspection ")).toBe(true);
    expect(isInspectionCategory("Inspection\n")).toBe(true);
  });

  it("treats null/undefined/empty as not-inspection", () => {
    expect(isInspectionCategory(null)).toBe(false);
    expect(isInspectionCategory(undefined)).toBe(false);
    expect(isInspectionCategory("")).toBe(false);
  });

  it("does not match unrelated categories", () => {
    expect(isInspectionCategory("Brake Service")).toBe(false);
    expect(isInspectionCategory("Oil Change")).toBe(false);
    // Substring of an inspection word must not match — exact category only.
    expect(isInspectionCategory("Pre-Inspection Diagnostic")).toBe(false);
  });
});

describe("sumJobRevenue", () => {
  it("excludes inspection-category line items in any casing", () => {
    const jobs = [
      {
        job_line_items: [
          { total: 100, category: "Brake Service" },
          { total: 35, category: "State Inspection" },
          { total: 35, category: "state inspection" }, // mixed-case preset
          { total: 15, category: "Inspection" },
        ],
      },
    ];
    expect(sumJobRevenue(jobs)).toBe(100);
  });

  it("returns 0 for null input", () => {
    expect(sumJobRevenue(null)).toBe(0);
  });
});

describe("isRevenueJob", () => {
  it("is false for an inspection-only job (Quick Pay inspection)", () => {
    expect(isRevenueJob([{ total: 35, category: "State Inspection" }])).toBe(false);
    expect(
      isRevenueJob([
        { total: 35, category: "Inspection" },
        { total: 15, category: "TNC Inspection" },
      ])
    ).toBe(false);
  });

  it("is true when any non-inspection line has a positive total", () => {
    expect(
      isRevenueJob([
        { total: 35, category: "State Inspection" },
        { total: 120, category: "Brake Service" },
      ])
    ).toBe(true);
  });

  it("treats an uncategorized positive line as revenue", () => {
    expect(isRevenueJob([{ total: 50, category: null }])).toBe(true);
    expect(isRevenueJob([{ total: 50 }])).toBe(true);
  });

  it("is false for empty or missing line items", () => {
    expect(isRevenueJob([])).toBe(false);
    expect(isRevenueJob(null)).toBe(false);
    expect(isRevenueJob(undefined)).toBe(false);
  });

  it("is false when the only non-inspection lines are zero, negative, or null", () => {
    expect(
      isRevenueJob([
        { total: 0, category: "Brake Service" },
        { total: -10, category: "Discount" },
        { total: null, category: "Oil Change" },
      ])
    ).toBe(false);
  });

  it("matches inspection categories regardless of casing and whitespace", () => {
    expect(isRevenueJob([{ total: 35, category: "state inspection" }])).toBe(false);
    expect(isRevenueJob([{ total: 35, category: " Inspection " }])).toBe(false);
    expect(isRevenueJob([{ total: 35, category: "TNC INSPECTION" }])).toBe(false);
  });
});
