import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LINE_ITEMS_LOCKED_MSG } from "@/lib/jobs/line-item-lock";
import { applyPresetToJob } from "./presets";
import { addCatalogItemsToJob } from "./catalog";
import {
  createSupabaseMock,
  type RecordedCall,
  type SupabaseMockResult,
} from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const PRESET_ID = "22222222-2222-4222-9222-222222222222";
const CATALOG_ID_1 = "33333333-3333-4333-9333-333333333333";
const CATALOG_ID_2 = "44444444-4444-4444-9444-444444444444";

function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

const LOCK_LOOKUP: RecordedCall[] = [
  { method: "from", args: ["jobs"] },
  { method: "select", args: ["payment_status"] },
  { method: "eq", args: ["id", JOB_ID] },
  { method: "maybeSingle", args: [] },
];

function lockLookup(calls: RecordedCall[]): RecordedCall[] {
  const i = calls.findIndex((c) => c.method === "from" && c.args[0] === "jobs");
  return i === -1 ? [] : calls.slice(i, i + 4);
}

function insertedRows(calls: RecordedCall[]): Record<string, unknown>[] {
  const i = calls.findIndex((c) => c.method === "insert");
  expect(i).toBeGreaterThan(0);
  expect(calls[i - 1]).toEqual({ method: "from", args: ["job_line_items"] });
  return calls[i].args[0] as Record<string, unknown>[];
}

const preset = {
  data: {
    category: "Brakes",
    line_items: [
      { type: "labor", description: "Pad replacement", quantity: 1, unit_cost: 80 },
      { type: "part", description: "Pads", quantity: 1, unit_cost: 60, cost: 30 },
    ],
  },
  error: null,
};

const catalogRows = {
  data: [
    {
      id: CATALOG_ID_1,
      type: "labor",
      description: "Oil change labor",
      default_quantity: 1,
      default_unit_cost: 40,
      default_cost: null,
      part_number: null,
      category: "Maintenance",
    },
    {
      id: CATALOG_ID_2,
      type: "part",
      description: "Oil filter",
      default_quantity: 1,
      default_unit_cost: 15,
      default_cost: 6,
      part_number: "OF-1",
      category: "Maintenance",
    },
  ],
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
});

describe("applyPresetToJob — line-item lock", () => {
  it.each(["paid", "waived"])("refuses a %s job and inserts nothing", async (status) => {
    const mock = mockSupabase([preset, { data: { payment_status: status }, error: null }]);
    const result = await applyPresetToJob(JOB_ID, PRESET_ID);

    expect(result).toEqual({ error: LINE_ITEMS_LOCKED_MSG });
    expect(lockLookup(mock.calls)).toEqual(LOCK_LOOKUP);
    expect(mock.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("inserts every preset line onto this job when it is unpaid", async () => {
    const mock = mockSupabase([
      preset,
      { data: { payment_status: "unpaid" }, error: null },
      { data: null, error: null },
    ]);
    const result = await applyPresetToJob(JOB_ID, PRESET_ID);

    expect(result).toEqual({ success: true, inserted: 2 });
    expect(lockLookup(mock.calls)).toEqual(LOCK_LOOKUP);
    const rows = insertedRows(mock.calls);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.job_id === JOB_ID)).toBe(true);
  });

  it("refuses when the job is not found", async () => {
    const mock = mockSupabase([preset, { data: null, error: null }]);
    const result = await applyPresetToJob(JOB_ID, PRESET_ID);
    expect(result).toEqual({ error: "Job not found" });
    expect(mock.calls.some((c) => c.method === "insert")).toBe(false);
  });
});

describe("addCatalogItemsToJob — line-item lock", () => {
  const items = [{ catalog_item_id: CATALOG_ID_1 }, { catalog_item_id: CATALOG_ID_2 }];

  it.each(["paid", "waived"])("refuses a %s job and inserts nothing", async (status) => {
    const mock = mockSupabase([{ data: { payment_status: status }, error: null }]);
    const result = await addCatalogItemsToJob(JOB_ID, items);

    expect(result).toEqual({ error: LINE_ITEMS_LOCKED_MSG });
    expect(mock.calls).toEqual(LOCK_LOOKUP);
  });

  it("inserts every catalog line onto this job when it is unpaid", async () => {
    const mock = mockSupabase([
      { data: { payment_status: "unpaid" }, error: null },
      catalogRows,
      { data: null, error: null },
    ]);
    const result = await addCatalogItemsToJob(JOB_ID, items);

    expect(result).toEqual({ success: true, count: 2 });
    expect(mock.calls.slice(0, 4)).toEqual(LOCK_LOOKUP);
    const rows = insertedRows(mock.calls);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.job_id === JOB_ID)).toBe(true);
  });

  it("refuses when the job is not found", async () => {
    const mock = mockSupabase([{ data: null, error: null }]);
    const result = await addCatalogItemsToJob(JOB_ID, items);
    expect(result).toEqual({ error: "Job not found" });
    expect(mock.calls.some((c) => c.method === "insert")).toBe(false);
  });
});
