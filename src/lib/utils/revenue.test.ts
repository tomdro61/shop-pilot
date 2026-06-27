import { describe, it, expect } from "vitest";
import { isInspectionCategory, sumJobRevenue } from "./revenue";

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
