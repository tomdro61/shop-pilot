import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/actions/manual-income", () => ({ getManualIncomeForRange: vi.fn() }));
vi.mock("@/lib/actions/inspections", () => ({ getInspectionCountsRange: vi.fn() }));
vi.mock("@/lib/supabase/fetch-all-rows", () => ({ fetchAllRows: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getShopSettings } from "@/lib/actions/settings";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { DEFAULT_SETTINGS } from "@/lib/utils/totals";
import type { ShopSettings } from "@/types";
import { getTaxReportData } from "./reports";
import { createSupabaseMock } from "./__test-helpers__/supabase-mock";

const SETTINGS = { ...DEFAULT_SETTINGS, tax_rate: 0.0625 } as ShopSettings;
const JUNE = 6;

const part = (total: number) => ({ type: "part", total, category: null });

// Paid with a frozen snapshot at a 6% rate: the report must use 6.00, not 6.25.
const jobA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  paid_at: "2026-06-10T16:00:00Z",
  date_finished: "2026-06-10",
  charge_sales_tax: true,
  taxable_collected: 100,
  tax_collected: 6.0,
  tax_rate_applied: 0.06,
  job_line_items: [part(100)],
};

// No snapshot: recomputed at the live 6.25% rate.
const jobB = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  paid_at: "2026-06-11T16:00:00Z",
  date_finished: "2026-06-11",
  charge_sales_tax: true,
  taxable_collected: null,
  tax_collected: null,
  tax_rate_applied: null,
  job_line_items: [part(100)],
};

// Snapshot says nothing taxable was billed even though the job charges tax and
// carries a $50 part (e.g. the part was added after payment). The snapshot wins.
const jobC = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  paid_at: "2026-06-12T16:00:00Z",
  date_finished: "2026-06-12",
  charge_sales_tax: true,
  taxable_collected: 0,
  tax_collected: 0,
  tax_rate_applied: 0.0625,
  job_line_items: [part(50)],
};

let jobRows: unknown[] = [];

function setup(rows: unknown[]) {
  jobRows = rows;
  const mock = createSupabaseMock({ data: null, error: null });
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getShopSettings).mockResolvedValue(SETTINGS);
  vi.mocked(getManualIncomeForRange).mockResolvedValue([]);
  // Builds the page query once (so its calls are recorded) and returns the fixture.
  vi.mocked(fetchAllRows).mockImplementation(async (page) => {
    page(0, 999);
    return jobRows as never;
  });
});

describe("getTaxReportData — snapshot vs. live rate", () => {
  it("sums snapshot tax as billed and taxes only snapshot-less jobs at the live rate", async () => {
    setup([jobA, jobB, jobC]);
    const report = await getTaxReportData(2026);
    const june = report.months[JUNE - 1];

    expect(june.taxCollected).toBe(12.25);
    expect(june.taxableAmount).toBe(200);
    expect(june.totalRevenue).toBe(250);
    expect(june.nonTaxableAmount).toBe(50);
    expect(report.jobsWithoutSnapshot).toBe(1);
    expect(report.ytd.taxCollected).toBe(12.25);
    expect(report.ytd.taxableAmount).toBe(200);
  });

  it("uses the snapshot for a job with sales tax turned off", async () => {
    setup([
      {
        ...jobA,
        charge_sales_tax: false,
        taxable_collected: 100,
        tax_collected: 6.25,
        tax_rate_applied: 0.0625,
      },
    ]);
    const june = (await getTaxReportData(2026)).months[JUNE - 1];
    expect(june.taxableAmount).toBe(100);
    expect(june.taxCollected).toBe(6.25);
  });

  it("treats a snapshot-less job with sales tax off as non-taxable", async () => {
    setup([{ ...jobB, charge_sales_tax: false }]);
    const report = await getTaxReportData(2026);
    const june = report.months[JUNE - 1];
    expect(june.taxableAmount).toBe(0);
    expect(june.taxCollected).toBe(0);
    expect(june.nonTaxableAmount).toBe(100);
    expect(report.jobsWithoutSnapshot).toBe(1);
  });

  it.each(["taxable_collected", "tax_collected", "tax_rate_applied"])(
    "counts a job missing only %s as snapshot-less and recomputes it",
    async (column) => {
      setup([{ ...jobA, [column]: null }]);
      const report = await getTaxReportData(2026);
      expect(report.jobsWithoutSnapshot).toBe(1);
      expect(report.months[JUNE - 1].taxCollected).toBe(6.25);
    }
  );

  it("throws rather than guessing a rate when settings fail to load", async () => {
    setup([jobB]);
    vi.mocked(getShopSettings).mockResolvedValue(null);
    await expect(getTaxReportData(2026)).rejects.toThrow(/shop settings/);
  });
});

describe("getTaxReportData — query shape", () => {
  it("selects the snapshot columns and reads only paid jobs in the year window", async () => {
    const mock = setup([]);
    await getTaxReportData(2026);
    expect(mock.calls).toEqual([
      { method: "from", args: ["jobs"] },
      {
        method: "select",
        args: [
          "id, paid_at, date_finished, charge_sales_tax, taxable_collected, tax_collected, tax_rate_applied, job_line_items(type, total, category)",
          { count: "exact" },
        ],
      },
      { method: "eq", args: ["payment_status", "paid"] },
      {
        method: "or",
        args: [
          "and(paid_at.gte.2025-12-31T00:00:00Z,paid_at.lte.2027-01-02T00:00:00Z)," +
            "and(paid_at.is.null,date_finished.gte.2025-12-31,date_finished.lte.2027-01-01)",
        ],
      },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [0, 999] },
      { method: "returns", args: [] },
    ]);
    expect(getManualIncomeForRange).toHaveBeenCalledWith("2026-01-01", "2026-12-31");
  });

  it("inner-joins customers and skips manual income under a customer-type filter", async () => {
    const mock = setup([]);
    await getTaxReportData(2026, "fleet");
    const select = mock.calls.find((c) => c.method === "select");
    expect(select?.args).toEqual([
      "id, paid_at, date_finished, charge_sales_tax, taxable_collected, tax_collected, tax_rate_applied, customers!inner(customer_type), job_line_items(type, total, category)",
      { count: "exact" },
    ]);
    expect(mock.calls.slice(-2)).toEqual([
      { method: "eq", args: ["customers.customer_type", "fleet"] },
      { method: "returns", args: [] },
    ]);
    expect(getManualIncomeForRange).not.toHaveBeenCalled();
  });
});
