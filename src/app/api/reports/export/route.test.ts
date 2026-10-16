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
vi.mock("@/lib/actions/manual-income", () => ({ getManualIncomeForRange: vi.fn() }));
vi.mock("@/lib/supabase/fetch-all-rows", () => ({ fetchAllRows: vi.fn() }));

import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { GET } from "./route";
import {
  createSupabaseMock,
  type RecordedCall,
  type SupabaseMockResult,
} from "@/lib/actions/__test-helpers__/supabase-mock";

const RANGE = "range=custom&from=2026-06-01&to=2026-06-30";

// $80 labor + $100 part = $180 of job revenue; the $35 inspection line is
// counted on the inspections sheet instead, not in job revenue.
const job = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ro_number: 7,
  status: "complete",
  date_received: "2026-06-09",
  date_finished: "2026-06-10",
  payment_status: "paid",
  payment_method: "card",
  paid_at: "2026-06-10T16:00:00Z",
  notes: null,
  assigned_tech: null,
  users: null,
  customers: {
    first_name: "Pat",
    last_name: "Lee",
    phone: null,
    email: null,
    customer_type: "retail",
    fleet_account: null,
  },
  vehicles: null,
  job_line_items: [
    { type: "labor", description: "Brakes", quantity: 1, unit_cost: 80, total: 80, cost: null, part_number: null, category: "Brakes" },
    { type: "part", description: "Pads", quantity: 1, unit_cost: 100, total: 100, cost: 40, part_number: null, category: "Brakes" },
    { type: "labor", description: "Sticker", quantity: 1, unit_cost: 35, total: 35, cost: null, part_number: null, category: "State Inspection" },
  ],
};

// 2 state ($35) + 1 TNC ($15) = $85.
const inspections: SupabaseMockResult = {
  data: [{ date: "2026-06-10", state_count: 2, tnc_count: 1 }],
  error: null,
  count: 1,
};

const manual = [
  { date: "2026-06-05", amount: 50, shop_keep_pct: 20, category: "Towing", customer_id: null },
];

let jobRows: unknown[] = [];

function setup(rows: unknown[], results: SupabaseMockResult[] = []) {
  jobRows = rows;
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

function request(query: string) {
  return {
    nextUrl: new URL(`https://example.com/api/reports/export?${query}`),
  } as unknown as NextRequest;
}

function jobsQuery(calls: RecordedCall[]): RecordedCall[] {
  const start = calls.findIndex((c) => c.method === "from" && c.args[0] === "jobs");
  const end = calls.findIndex((c, i) => i > start && c.method === "returns");
  return calls.slice(start, end + 1);
}

const collapse = (s: unknown) => String(s).replace(/\s+/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
  vi.mocked(getManualIncomeForRange).mockResolvedValue(manual);
  vi.mocked(fetchAllRows).mockImplementation(async (page) => {
    page(0, 999);
    return jobRows as never;
  });
});

describe("GET /api/reports/export", () => {
  it("rejects an unknown customerType with 400 before reading anything", async () => {
    setup([job]);
    const res = await GET(request(`${RANGE}&customerType=bogus`));
    expect(res.status).toBe(400);
    expect(fetchAllRows).not.toHaveBeenCalled();
    expect(getManualIncomeForRange).not.toHaveBeenCalled();
  });

  it("inner-joins customers on a fleet filter and skips inspections and manual income", async () => {
    const mock = setup([]);
    const res = await GET(request(`${RANGE}&customerType=fleet`));
    expect(res.status).toBe(200);

    const q = jobsQuery(mock.calls);
    expect(q[0]).toEqual({ method: "from", args: ["jobs"] });
    expect(q[1].method).toBe("select");
    expect(collapse(q[1].args[0])).toBe(
      "id, ro_number, status, date_received, date_finished, payment_status, payment_method, paid_at, notes, " +
        "assigned_tech, users!jobs_assigned_tech_fkey(name), " +
        "customers!inner(first_name, last_name, phone, email, customer_type, fleet_account), " +
        "vehicles(year, make, model, vin, license_plate), " +
        "job_line_items(type, description, quantity, unit_cost, total, cost, part_number, category)"
    );
    expect(q[1].args[1]).toEqual({ count: "exact" });
    expect(q.slice(2)).toEqual([
      { method: "eq", args: ["status", "complete"] },
      { method: "gte", args: ["date_finished", "2026-06-01"] },
      { method: "lte", args: ["date_finished", "2026-06-30"] },
      { method: "order", args: ["date_finished", { ascending: true }] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [0, 999] },
      { method: "eq", args: ["customers.customer_type", "fleet"] },
      { method: "returns", args: [] },
    ]);

    expect(mock.calls).not.toContainEqual({ method: "from", args: ["daily_inspection_counts"] });
    expect(getManualIncomeForRange).not.toHaveBeenCalled();
  });

  it("adds inspections and manual income to job revenue in the grand total when unfiltered", async () => {
    const mock = setup([job], [inspections]);
    const res = await GET(request(RANGE));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const csv = await res.text();

    expect(csv).toContain("Job Revenue Total:,180.00");
    expect(csv).toContain("Inspection Total:,85.00");
    expect(csv).toContain("Manual Income Total:,50.00");
    expect(csv).toContain("GRAND TOTAL REVENUE:,315.00");

    const q = jobsQuery(mock.calls);
    expect(collapse(q[1].args[0])).toContain(" customers(first_name,");
    expect(q).not.toContainEqual({ method: "eq", args: ["customers.customer_type", expect.anything()] });
    expect(mock.calls).toContainEqual({ method: "from", args: ["daily_inspection_counts"] });
    expect(getManualIncomeForRange).toHaveBeenCalledWith("2026-06-01", "2026-06-30");
  });

  it("returns a JSON 500, not a CSV, when the inspection read is truncated", async () => {
    setup([job], [{ ...inspections, count: 5 }]);
    const res = await GET(request(RANGE));
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("returns 403 for a non-manager", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Forbidden" });
    setup([job]);
    const res = await GET(request(RANGE));
    expect(res.status).toBe(403);
    expect(fetchAllRows).not.toHaveBeenCalled();
  });
});
