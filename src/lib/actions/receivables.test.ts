import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  todayET: () => "2026-10-15",
}));

import { createClient } from "@/lib/supabase/server";
import { getShopSettings } from "@/lib/actions/settings";
import { WALK_IN_CUSTOMER_ID } from "@/lib/constants";
import { DEFAULT_SETTINGS } from "@/lib/utils/totals";
import type { ShopSettings } from "@/types";
import { getReceivablesData, getReceivablesSummary } from "./receivables";
import { createSupabaseMock } from "./__test-helpers__/supabase-mock";

const SETTINGS = { ...DEFAULT_SETTINGS, tax_rate: 0.0625 } as ShopSettings;

const customer = (id: string, customer_type = "retail") => ({
  id,
  first_name: "Pat",
  last_name: "Lee",
  customer_type,
  fleet_account: null,
});

// $80 labor + $100 part + 6.25% tax on the part = $186.25.
const brakeJob = {
  id: "job-brakes",
  title: "Brakes",
  date_finished: "2026-10-01",
  payment_status: "invoiced",
  ro_number: 101,
  customer_id: "cust-1",
  charge_sales_tax: true,
  customers: customer("cust-1"),
  job_line_items: [
    { type: "labor", quantity: 1, unit_cost: 80, total: 80, category: "Brakes" },
    { type: "part", quantity: 1, unit_cost: 100, total: 100, category: "Brakes" },
  ],
};

// An inspection the customer has not paid for — owed, so it belongs in A/R.
// Finished 75 days before "today", so it lands in the 60+ bucket.
const inspectionJob = {
  id: "job-insp",
  title: "Inspection",
  date_finished: "2026-08-01",
  payment_status: "unpaid",
  ro_number: 102,
  customer_id: "cust-2",
  charge_sales_tax: true,
  customers: customer("cust-2"),
  job_line_items: [{ type: "labor", quantity: 1, unit_cost: 35, total: 35, category: "State Inspection" }],
};

const walkInJob = {
  ...brakeJob,
  id: "job-walkin",
  customer_id: WALK_IN_CUSTOMER_ID,
  customers: customer(WALK_IN_CUSTOMER_ID),
};

const customerlessJob = { ...brakeJob, id: "job-nocust", customer_id: null, customers: null };

const ALL_ROWS = [brakeJob, inspectionJob, walkInJob, customerlessJob];

function mockRows(rows: unknown[]) {
  const mock = createSupabaseMock({ data: rows, error: null, count: rows.length });
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getShopSettings).mockResolvedValue(SETTINGS);
});

describe("getReceivablesSummary", () => {
  it("counts sales tax and inspection lines, and skips walk-in and customer-less jobs", async () => {
    mockRows(ALL_ROWS);
    const summary = await getReceivablesSummary();
    expect(summary.totalOutstanding).toBe(186.25 + 35);
    expect(summary.aging60plus).toBe(35);
  });

  it("agrees with the A/R ledger on the same rows", async () => {
    mockRows(ALL_ROWS);
    const summary = await getReceivablesSummary();
    mockRows(ALL_ROWS);
    const ledger = await getReceivablesData();
    expect(ledger.totalOutstanding).toBe(summary.totalOutstanding);
    expect(ledger.aging60plus).toBe(summary.aging60plus);
    expect(ledger.jobs.map((j) => j.id).sort()).toEqual(["job-brakes", "job-insp"]);
  });

  it("selects the columns the amount depends on, and only unpaid complete jobs", async () => {
    const mock = mockRows([]);
    await getReceivablesSummary();
    expect(mock.calls).toEqual([
      { method: "from", args: ["jobs"] },
      {
        method: "select",
        args: [
          "customer_id, date_finished, charge_sales_tax, customers(id), job_line_items(type, quantity, unit_cost, total, category)",
          { count: "exact" },
        ],
      },
      { method: "eq", args: ["status", "complete"] },
      { method: "neq", args: ["payment_status", "paid"] },
      { method: "neq", args: ["payment_status", "waived"] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [0, 999] },
      { method: "returns", args: [] },
    ]);
  });

  it("throws rather than guessing a tax rate when settings fail to load", async () => {
    mockRows(ALL_ROWS);
    vi.mocked(getShopSettings).mockResolvedValue(null);
    await expect(getReceivablesSummary()).rejects.toThrow(/shop settings/);
  });
});

describe("getReceivablesData", () => {
  it("reports the taxed amount per job", async () => {
    mockRows([brakeJob]);
    const ledger = await getReceivablesData();
    expect(ledger.jobs[0].amount).toBe(186.25);
  });

  it("omits tax for a job with sales tax turned off", async () => {
    mockRows([{ ...brakeJob, charge_sales_tax: false }]);
    const ledger = await getReceivablesData();
    expect(ledger.jobs[0].amount).toBe(180);
  });

  it("selects charge_sales_tax and the full line-item shape, and only unpaid complete jobs", async () => {
    const mock = mockRows([]);
    await getReceivablesData();
    expect(mock.calls).toEqual([
      { method: "from", args: ["jobs"] },
      {
        method: "select",
        args: [
          "id, title, date_finished, payment_status, ro_number, customer_id, charge_sales_tax, customers(id, first_name, last_name, customer_type, fleet_account), job_line_items(type, quantity, unit_cost, total, category)",
          { count: "exact" },
        ],
      },
      { method: "eq", args: ["status", "complete"] },
      { method: "neq", args: ["payment_status", "paid"] },
      { method: "neq", args: ["payment_status", "waived"] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [0, 999] },
      { method: "returns", args: [] },
    ]);
  });

  it("inner-joins customers and filters on customer_type under a customer-type filter", async () => {
    const mock = mockRows([]);
    await getReceivablesData("fleet");
    expect(mock.calls).toEqual([
      { method: "from", args: ["jobs"] },
      {
        method: "select",
        args: [
          "id, title, date_finished, payment_status, ro_number, customer_id, charge_sales_tax, customers!inner(id, first_name, last_name, customer_type, fleet_account), job_line_items(type, quantity, unit_cost, total, category)",
          { count: "exact" },
        ],
      },
      { method: "eq", args: ["status", "complete"] },
      { method: "neq", args: ["payment_status", "paid"] },
      { method: "neq", args: ["payment_status", "waived"] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [0, 999] },
      { method: "eq", args: ["customers.customer_type", "fleet"] },
      { method: "returns", args: [] },
    ]);
  });

  it("throws rather than guessing a tax rate when settings fail to load", async () => {
    mockRows([brakeJob]);
    vi.mocked(getShopSettings).mockResolvedValue(null);
    await expect(getReceivablesData()).rejects.toThrow(/shop settings/);
  });
});
