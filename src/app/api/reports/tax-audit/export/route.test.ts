import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/server", () => {
  class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), init);
    }
  }
  return { NextResponse, NextRequest: class {} };
});
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/actions/manual-income", () => ({ getManualIncomeForRange: vi.fn() }));
vi.mock("@/lib/supabase/fetch-all-rows", () => ({ fetchAllRows: vi.fn() }));

import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShopSettings } from "@/lib/actions/settings";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { DEFAULT_SETTINGS } from "@/lib/utils/totals";
import type { ShopSettings } from "@/types";
import { GET } from "./route";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

const SETTINGS = { ...DEFAULT_SETTINGS, tax_rate: 0.0625 } as ShopSettings;

const part = (total: number) => ({
  type: "part",
  description: "Pad set",
  quantity: 1,
  unit_cost: total,
  total,
  cost: null,
  category: null,
  part_number: null,
});

const shell = (ro: number, paidAt: string) => ({
  ro_number: ro,
  paid_at: paidAt,
  date_finished: paidAt.slice(0, 10),
  payment_method: "card",
  customers: { first_name: "Pat", last_name: "Lee", customer_type: "retail" },
  vehicles: { year: 2020, make: "Honda", model: "Civic", license_plate: "ABC123" },
});

// Snapshot at 6%: the export must print 6.00, not the live-rate 6.25.
const jobA = {
  ...shell(1, "2026-06-10T16:00:00Z"),
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  charge_sales_tax: true,
  taxable_collected: 100,
  tax_collected: 6.0,
  tax_rate_applied: 0.06,
  job_line_items: [part(100)],
};
// No snapshot: recomputed at the live 6.25%.
const jobB = {
  ...shell(2, "2026-06-11T16:00:00Z"),
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  charge_sales_tax: true,
  taxable_collected: null,
  tax_collected: null,
  tax_rate_applied: null,
  job_line_items: [part(100)],
};
// Snapshot of zero tax wins over the $50 part on the job today.
const jobC = {
  ...shell(3, "2026-06-12T16:00:00Z"),
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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

function request(query: string) {
  return {
    nextUrl: new URL(`https://example.com/api/reports/tax-audit/export?${query}`),
  } as unknown as NextRequest;
}

/** The JOB SUMMARIES rows, split into cells (fixture fields contain no commas). */
function jobSummaryRows(csv: string): string[][] {
  const lines = csv.split("\r\n");
  const start = lines.indexOf("JOB SUMMARIES") + 2; // skip the header row
  const end = lines.indexOf("TOTALS");
  return lines.slice(start, end).filter((l) => l !== "").map((l) => l.split(","));
}

const SALES_TAX_COL = 11;
const TAXABLE_PARTS_COL = 9;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
  vi.mocked(getShopSettings).mockResolvedValue(SETTINGS);
  vi.mocked(getManualIncomeForRange).mockResolvedValue([]);
  vi.mocked(fetchAllRows).mockImplementation(async (page) => {
    page(0, 999);
    return jobRows as never;
  });
});

describe("GET /api/reports/tax-audit/export", () => {
  it("prints each job's snapshot tax as billed and recomputes only the snapshot-less one", async () => {
    setup([jobA, jobB, jobC]);
    const res = await GET(request("year=2026&month=6"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const csv = await res.text();

    const rows = jobSummaryRows(csv);
    expect(rows.map((r) => r[1])).toEqual(["RO-0001", "RO-0002", "RO-0003"]);
    expect(rows.map((r) => r[SALES_TAX_COL])).toEqual(["6.00", "6.25", "0.00"]);
    expect(rows.map((r) => r[TAXABLE_PARTS_COL])).toEqual(["100.00", "100.00", "0.00"]);

    expect(csv).toContain("Sales Tax Collected:,12.25");
    expect(csv).toContain("Total Parts (Taxable):,200.00");
  });

  it("uses the snapshot for a job with sales tax turned off", async () => {
    setup([{ ...jobA, charge_sales_tax: false, tax_collected: 6.25, tax_rate_applied: 0.0625 }]);
    const csv = await (await GET(request("year=2026"))).text();
    const [row] = jobSummaryRows(csv);
    expect(row[TAXABLE_PARTS_COL]).toBe("100.00");
    expect(row[SALES_TAX_COL]).toBe("6.25");
  });

  it("reads paid jobs in the year window with the snapshot columns selected", async () => {
    const mock = setup([]);
    await GET(request("year=2026"));
    const select = mock.calls.find((c) => c.method === "select");
    // Collapse the template literal's indentation so the assertion is about columns.
    expect(String(select?.args[0]).replace(/\s+/g, " ")).toBe(
      "id, ro_number, paid_at, date_finished, payment_method, charge_sales_tax, " +
        "taxable_collected, tax_collected, tax_rate_applied, " +
        "customers(first_name, last_name, customer_type), " +
        "vehicles(year, make, model, license_plate), " +
        "job_line_items(type, description, quantity, unit_cost, total, cost, category, part_number)"
    );
    expect(select?.args[1]).toEqual({ count: "exact" });
    const selectIdx = mock.calls.indexOf(select!);
    expect(mock.calls.slice(selectIdx + 1)).toEqual([
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
  });

  it("returns 401 when signed out, without reading anything", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Unauthorized" });
    setup([jobA]);
    const res = await GET(request("year=2026"));
    expect(res.status).toBe(401);
    expect(fetchAllRows).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-manager", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Forbidden" });
    setup([jobA]);
    const res = await GET(request("year=2026"));
    expect(res.status).toBe(403);
    expect(fetchAllRows).not.toHaveBeenCalled();
  });

  it("returns a JSON 500, not a CSV, when settings fail to load", async () => {
    vi.mocked(getShopSettings).mockResolvedValue(null);
    setup([jobA]);
    const res = await GET(request("year=2026"));
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).not.toMatch(/text\/csv/);
  });
});
