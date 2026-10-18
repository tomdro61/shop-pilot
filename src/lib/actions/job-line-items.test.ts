/**
 * Tests for the settled-job lock on line items, and for updateLineItem keeping
 * a line on its own job.
 *
 * The shape to protect: once a job is paid or waived, its collected amount has
 * been snapshotted and reported, so no line may be added, removed, or have its
 * type, quantity or unit cost changed. Most tests assert both the refusal AND
 * that no write was issued.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getShopSettings } from "@/lib/actions/settings";
import { LINE_ITEMS_LOCKED_MSG } from "@/lib/jobs/line-item-lock";
import {
  PART_INSPECTION_LOCKED_MSG,
  SPLIT_FEE_MSG,
  SPLIT_LINE_TOTAL_MSG,
  SPLIT_PART_INSPECTION_MSG,
} from "@/lib/validators/job";
import { createLineItem, deleteLineItem, splitLineItem, updateLineItem } from "./job-line-items";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";
import type { ShopSettings } from "@/types";

const SETTINGS = {
  tax_rate: 0.0625,
  shop_supplies_enabled: false,
  shop_supplies_method: "percent_of_labor",
  shop_supplies_rate: 0,
  shop_supplies_cap: null,
  hazmat_enabled: false,
  hazmat_amount: 0,
  hazmat_label: "Hazmat",
  shop_supplies_categories: null,
  hazmat_categories: null,
} as unknown as ShopSettings;

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const OTHER_JOB_ID = "44444444-4444-4444-9444-444444444444";
const LINE_ID = "55555555-5555-4555-9555-555555555555";

function buildForm(
  overrides: Partial<{
    job_id: string;
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
    cost: number | null;
    part_number: string;
    category: string | null;
  }> = {},
) {
  return {
    job_id: JOB_ID,
    type: "part" as const,
    description: "Brake pads",
    quantity: 1,
    unit_cost: 100,
    cost: 40,
    part_number: "BP-1",
    category: "Brakes",
    ...overrides,
  };
}

const existingLine = { job_id: JOB_ID, type: "part", quantity: 1, unit_cost: 100, category: "Brakes" };

function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

type Mock = ReturnType<typeof mockSupabase>;
const findCall = (mock: Mock, method: string) => mock.calls.find((c) => c.method === method);
const tables = (mock: Mock) =>
  mock.calls.filter((c) => c.method === "from").map((c) => c.args[0]);
const callsAfter = (mock: Mock, method: string, arg?: unknown) => {
  const idx = mock.calls.findIndex(
    (c) => c.method === method && (arg === undefined || c.args[0] === arg),
  );
  return idx === -1 ? [] : mock.calls.slice(idx + 1);
};

const lockLookup = (jobId: string) => [
  { method: "from", args: ["jobs"] },
  { method: "select", args: ["payment_status"] },
  { method: "eq", args: ["id", jobId] },
  { method: "maybeSingle", args: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
  vi.mocked(getShopSettings).mockResolvedValue(SETTINGS);
});

describe("createLineItem — the settled-job lock", () => {
  it.each(["paid", "waived"])("refuses to add a line to a %s job, and inserts nothing", async (status) => {
    const mock = mockSupabase([{ data: { payment_status: status }, error: null }]);

    expect(await createLineItem(buildForm())).toEqual({ error: LINE_ITEMS_LOCKED_MSG });
    expect(mock.calls.slice(0, 4)).toEqual(lockLookup(JOB_ID));
    expect(findCall(mock, "insert")).toBeUndefined();
  });

  it.each(["unpaid", "invoiced"])("adds a line to a %s job", async (status) => {
    const mock = mockSupabase([
      { data: { payment_status: status }, error: null },
      { data: { id: LINE_ID }, error: null },
    ]);

    expect(await createLineItem(buildForm())).toEqual({ data: { id: LINE_ID } });
    expect(tables(mock)).toEqual(["jobs", "job_line_items"]);
    expect(findCall(mock, "insert")?.args[0]).toMatchObject({ job_id: JOB_ID, unit_cost: 100 });
  });

  it("refuses when the job can't be read", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "boom" } }]);

    expect(await createLineItem(buildForm())).toEqual({ error: "boom" });
    expect(findCall(mock, "insert")).toBeUndefined();
  });

  it("refuses when the job does not exist", async () => {
    const mock = mockSupabase([{ data: null, error: null }]);

    expect(await createLineItem(buildForm())).toEqual({ error: "Job not found" });
    expect(findCall(mock, "insert")).toBeUndefined();
  });
});

describe("deleteLineItem — the settled-job lock", () => {
  it.each(["paid", "waived"])("refuses to remove a line from a %s job", async (status) => {
    const mock = mockSupabase([{ data: { payment_status: status }, error: null }]);

    expect(await deleteLineItem(LINE_ID, JOB_ID)).toEqual({ error: LINE_ITEMS_LOCKED_MSG });
    expect(mock.calls.slice(0, 4)).toEqual(lockLookup(JOB_ID));
    expect(findCall(mock, "delete")).toBeUndefined();
  });

  it("deletes this line, scoped to this job, on an unpaid job", async () => {
    const mock = mockSupabase([
      { data: { payment_status: "unpaid" }, error: null },
      { data: [{ id: LINE_ID }], error: null },
    ]);

    expect(await deleteLineItem(LINE_ID, JOB_ID)).toEqual({ success: true });
    expect(callsAfter(mock, "delete").slice(0, 3)).toEqual([
      { method: "eq", args: ["id", LINE_ID] },
      { method: "eq", args: ["job_id", JOB_ID] },
      { method: "select", args: ["id"] },
    ]);
  });

  it("reports a delete that matched no line on this job, and revalidates nothing", async () => {
    const mock = mockSupabase([
      { data: { payment_status: "unpaid" }, error: null },
      { data: [], error: null },
    ]);

    expect(await deleteLineItem(LINE_ID, JOB_ID)).toEqual({
      error: "Line item not found on this job",
    });
    expect(callsAfter(mock, "delete").slice(0, 3)).toEqual([
      { method: "eq", args: ["id", LINE_ID] },
      { method: "eq", args: ["job_id", JOB_ID] },
      { method: "select", args: ["id"] },
    ]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a failed delete", async () => {
    mockSupabase([
      { data: { payment_status: "unpaid" }, error: null },
      { data: null, error: { message: "delete failed" } },
    ]);

    expect(await deleteLineItem(LINE_ID, JOB_ID)).toEqual({ error: "delete failed" });
  });

  it("refuses when the job can't be read", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "boom" } }]);

    expect(await deleteLineItem(LINE_ID, JOB_ID)).toEqual({ error: "boom" });
    expect(findCall(mock, "delete")).toBeUndefined();
  });
});

describe("updateLineItem — what it reads", () => {
  /** Query order: existing line, job lock, update (returning). */
  const queue = (
    paymentStatus = "unpaid",
    existing: Record<string, unknown> | null = existingLine,
  ): SupabaseMockResult[] => [
    { data: existing, error: null },
    { data: { payment_status: paymentStatus }, error: null },
    { data: { id: LINE_ID }, error: null },
  ];

  it("reads the line's own job and the money fields the lock compares", async () => {
    const mock = mockSupabase(queue());

    await updateLineItem(LINE_ID, buildForm());

    expect(mock.calls.slice(0, 4)).toEqual([
      { method: "from", args: ["job_line_items"] },
      { method: "select", args: ["job_id, type, quantity, unit_cost, category"] },
      { method: "eq", args: ["id", LINE_ID] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("checks the lock on the line's own job, not the payload's job_id", async () => {
    const mock = mockSupabase(queue());

    await updateLineItem(LINE_ID, buildForm({ job_id: OTHER_JOB_ID }));

    expect(mock.calls.slice(4, 8)).toEqual(lockLookup(JOB_ID));
  });

  it("writes the line's own job_id and scopes the update to it", async () => {
    const mock = mockSupabase(queue());

    expect(await updateLineItem(LINE_ID, buildForm({ job_id: OTHER_JOB_ID }))).toEqual({
      data: { id: LINE_ID },
    });
    expect(findCall(mock, "update")?.args[0]).toMatchObject({ job_id: JOB_ID });
    expect(callsAfter(mock, "update").slice(0, 4)).toEqual([
      { method: "eq", args: ["id", LINE_ID] },
      { method: "eq", args: ["job_id", JOB_ID] },
      { method: "select", args: [] },
      { method: "single", args: [] },
    ]);
  });

  it("refuses when the line does not exist, before checking any job", async () => {
    const mock = mockSupabase([{ data: null, error: null }]);

    expect(await updateLineItem(LINE_ID, buildForm())).toEqual({ error: "Line item not found" });
    expect(tables(mock)).toEqual(["job_line_items"]);
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("refuses when the line can't be read", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "boom" } }]);

    expect(await updateLineItem(LINE_ID, buildForm())).toEqual({ error: "boom" });
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("refuses when the lock read fails", async () => {
    const mock = mockSupabase([
      { data: existingLine, error: null },
      { data: null, error: { message: "jobs down" } },
    ]);

    expect(await updateLineItem(LINE_ID, buildForm())).toEqual({ error: "jobs down" });
    expect(findCall(mock, "update")).toBeUndefined();
  });
});

describe("updateLineItem — on a settled job", () => {
  const queue = (paymentStatus: string): SupabaseMockResult[] => [
    { data: existingLine, error: null },
    { data: { payment_status: paymentStatus }, error: null },
    { data: { id: LINE_ID }, error: null },
  ];

  it.each([
    ["quantity", { quantity: 2 }],
    ["unit cost", { unit_cost: 120 }],
    ["type", { type: "labor" as const }],
  ])("refuses a %s change on a paid job, and issues no update", async (_label, change) => {
    const mock = mockSupabase(queue("paid"));

    expect(await updateLineItem(LINE_ID, buildForm(change))).toEqual({ error: LINE_ITEMS_LOCKED_MSG });
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("refuses a quantity change on a waived job", async () => {
    const mock = mockSupabase(queue("waived"));

    expect(await updateLineItem(LINE_ID, buildForm({ quantity: 3 }))).toEqual({
      error: LINE_ITEMS_LOCKED_MSG,
    });
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it.each([
    ["description", { description: "Ceramic brake pads" }],
    ["category", { category: "Suspension" }],
    ["wholesale cost", { cost: 55 }],
    ["part number", { part_number: "BP-2" }],
  ])("allows a %s edit on a paid job", async (_label, change) => {
    const mock = mockSupabase(queue("paid"));

    expect(await updateLineItem(LINE_ID, buildForm(change))).toEqual({ data: { id: LINE_ID } });
    expect(findCall(mock, "update")?.args[0]).toMatchObject(change);
  });

  // A Quick Pay that mixes an inspection with other work is one labor line
  // with no category; filing part of it under State Inspection afterward is
  // the normal cleanup. The frozen tax snapshot doesn't depend on category.
  // The revenue reports do, and moving the inspection out of them is the point.
  it.each([
    ["into", "Brakes", "State Inspection"],
    ["out of", "inspection", "Brakes"],
  ])("allows moving a labor line %s an inspection category on a paid job", async (_label, from, to) => {
    const mock = mockSupabase([
      { data: { ...existingLine, type: "labor", category: from }, error: null },
      { data: { payment_status: "paid" }, error: null },
      { data: { id: LINE_ID }, error: null },
    ]);

    expect(await updateLineItem(LINE_ID, buildForm({ type: "labor", category: to }))).toEqual({
      data: { id: LINE_ID },
    });
    expect(findCall(mock, "update")?.args[0]).toMatchObject({ category: to });
  });

  // The tax reports pair live non-inspection line totals with the frozen
  // taxable figure, so a part moved under an inspection category after
  // payment shows a taxable base larger than the gross.
  it.each([
    ["into", "Brakes", "State Inspection"],
    ["out of", "inspection", "Brakes"],
  ])("refuses moving a part %s an inspection category on a paid job, and issues no update", async (_label, from, to) => {
    const mock = mockSupabase([
      { data: { ...existingLine, category: from }, error: null },
      { data: { payment_status: "paid" }, error: null },
      { data: { id: LINE_ID }, error: null },
    ]);

    expect(await updateLineItem(LINE_ID, buildForm({ category: to }))).toEqual({
      error: PART_INSPECTION_LOCKED_MSG,
    });
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("allows moving a part into an inspection category on an unpaid job", async () => {
    const mock = mockSupabase(queue("unpaid"));

    expect(await updateLineItem(LINE_ID, buildForm({ category: "State Inspection" }))).toEqual({
      data: { id: LINE_ID },
    });
    expect(findCall(mock, "update")?.args[0]).toMatchObject({ category: "State Inspection" });
  });

  it("allows a category change between two inspection categories on a paid job", async () => {
    const mock = mockSupabase([
      { data: { ...existingLine, category: "State Inspection" }, error: null },
      { data: { payment_status: "paid" }, error: null },
      { data: { id: LINE_ID }, error: null },
    ]);

    expect(await updateLineItem(LINE_ID, buildForm({ category: "TNC Inspection" }))).toEqual({
      data: { id: LINE_ID },
    });
    expect(findCall(mock, "update")?.args[0]).toMatchObject({ category: "TNC Inspection" });
  });

  it("allows moving a line into an inspection category on an unpaid job", async () => {
    const mock = mockSupabase(queue("unpaid"));

    expect(await updateLineItem(LINE_ID, buildForm({ category: "State Inspection" }))).toEqual({
      data: { id: LINE_ID },
    });
    expect(findCall(mock, "update")?.args[0]).toMatchObject({ category: "State Inspection" });
  });

  it("treats a money column read back as a numeric string as unchanged", async () => {
    const mock = mockSupabase([
      { data: { ...existingLine, quantity: "1.00", unit_cost: "100.00" }, error: null },
      { data: { payment_status: "paid" }, error: null },
      { data: { id: LINE_ID }, error: null },
    ]);

    expect(await updateLineItem(LINE_ID, buildForm({ description: "Pads" }))).toEqual({
      data: { id: LINE_ID },
    });
    expect(findCall(mock, "update")).toBeDefined();
  });

  it("allows a money change on an unpaid job", async () => {
    const mock = mockSupabase(queue("unpaid"));

    expect(await updateLineItem(LINE_ID, buildForm({ quantity: 2, unit_cost: 120 }))).toEqual({
      data: { id: LINE_ID },
    });
    expect(findCall(mock, "update")?.args[0]).toMatchObject({ quantity: 2, unit_cost: 120 });
  });
});

describe("splitLineItem", () => {
  const NEW_A = "66666666-6666-4666-9666-666666666666";
  const NEW_B = "77777777-7777-4777-9777-777777777777";
  const line = {
    id: LINE_ID,
    job_id: JOB_ID,
    type: "labor",
    quantity: 1,
    unit_cost: 100,
    total: 100,
    cost: null,
    category: null,
  };
  const jobRow = (lines: object[] = [line], chargeSalesTax = false) => ({
    charge_sales_tax: chargeSalesTax,
    job_line_items: lines,
  });
  const parts = [
    { description: "Oil change", amount: 60, category: "Oil Change" },
    { description: "State inspection", amount: 40, category: "State Inspection" },
  ];
  const rpcParts = [
    { description: "Oil change", amount: 60, category: "Oil Change", cost: null },
    { description: "State inspection", amount: 40, category: "State Inspection", cost: null },
  ];
  const happy = (): SupabaseMockResult[] => [
    { data: line, error: null },
    { data: jobRow(), error: null },
    { data: [NEW_A, NEW_B], error: null },
  ];
  const rpcCall = (mock: Mock) => findCall(mock, "rpc");
  const sentParts = <K extends string>(mock: Mock, key: K) =>
    (rpcCall(mock)?.args[1] as { p_parts: Record<K, unknown>[] }).p_parts.map((p) => p[key]);

  it("reads the line by id with the columns the sum, the cost share and the rules depend on", async () => {
    const mock = mockSupabase(happy());

    await splitLineItem(LINE_ID, { parts });

    expect(mock.calls.slice(0, 4)).toEqual([
      { method: "from", args: ["job_line_items"] },
      { method: "select", args: ["id, job_id, type, quantity, unit_cost, total, cost, category"] },
      { method: "eq", args: ["id", LINE_ID] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("reads the line's own job with its lines for the fee check, then calls the split function", async () => {
    const mock = mockSupabase(happy());

    expect(await splitLineItem(LINE_ID, { parts })).toEqual({ data: { ids: [NEW_A, NEW_B] } });

    expect(tables(mock)).toEqual(["job_line_items", "jobs"]);
    expect(callsAfter(mock, "from", "jobs").slice(0, 3)).toEqual([
      {
        method: "select",
        args: ["charge_sales_tax, job_line_items(id, type, quantity, unit_cost, total, category)"],
      },
      { method: "eq", args: ["id", JOB_ID] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(rpcCall(mock)?.args).toEqual([
      "split_job_line_item",
      { p_line_id: LINE_ID, p_parts: rpcParts },
    ]);
    expect(findCall(mock, "insert")).toBeUndefined();
    expect(findCall(mock, "delete")).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith(`/jobs/${JOB_ID}`);
  });

  it("never checks the job's payment status: a split is allowed whether or not the job is settled", async () => {
    const mock = mockSupabase(happy());

    expect(await splitLineItem(LINE_ID, { parts })).toEqual({ data: { ids: [NEW_A, NEW_B] } });
    expect(mock.calls.filter((c) => c.method === "select").map((c) => c.args[0])).not.toContain(
      "payment_status",
    );
  });

  it.each([
    ["under by ten dollars", 30],
    ["under by a cent", 39.99],
    ["over by a cent", 40.01],
  ])("refuses parts that are %s, and calls nothing", async (_label, second) => {
    const mock = mockSupabase(happy());

    expect(
      await splitLineItem(LINE_ID, { parts: [parts[0], { ...parts[1], amount: second }] }),
    ).toEqual({ error: SPLIT_LINE_TOTAL_MSG });
    expect(rpcCall(mock)).toBeUndefined();
    expect(tables(mock)).toEqual(["job_line_items"]);
  });

  it("compares in cents, so thirds that round to the total are accepted", async () => {
    const mock = mockSupabase(happy());
    const thirds = [
      { description: "A", amount: 33.33 },
      { description: "B", amount: 33.33 },
      { description: "C", amount: 33.34 },
    ];

    expect(await splitLineItem(LINE_ID, { parts: thirds })).toEqual({ data: { ids: [NEW_A, NEW_B] } });
    expect(sentParts(mock, "amount")).toEqual([33.33, 33.33, 33.34]);
  });

  it("stores whole cents, not the raw amount the caller sent", async () => {
    const mock = mockSupabase(happy());

    await splitLineItem(LINE_ID, {
      parts: [
        { description: "A", amount: 60.004 },
        { description: "B", amount: 39.996 },
      ],
    });

    expect(sentParts(mock, "amount")).toEqual([60, 40]);
  });

  it("measures against the stored total, not quantity x unit cost", async () => {
    // The numeric(10,2) column is what the page shows, and on fractional
    // hours it can sit a cent away from the float product. The fixture makes
    // the two disagree by more than rounding so the precedence is pinned.
    const stored = { ...line, quantity: 1, unit_cost: 100, total: 99.99 };
    const mock = mockSupabase([
      { data: stored, error: null },
      { data: jobRow([stored]), error: null },
      { data: [NEW_A, NEW_B], error: null },
    ]);

    expect(
      await splitLineItem(LINE_ID, {
        parts: [
          { description: "A", amount: 60 },
          { description: "B", amount: 39.99 },
        ],
      }),
    ).toEqual({ data: { ids: [NEW_A, NEW_B] } });
    expect(rpcCall(mock)).toBeDefined();
  });

  it("falls back to quantity x unit cost when the stored total is null", async () => {
    const noTotal = { ...line, quantity: 2, unit_cost: 50, total: null };
    const mock = mockSupabase([
      { data: noTotal, error: null },
      { data: jobRow([noTotal]), error: null },
      { data: [NEW_A, NEW_B], error: null },
    ]);

    expect(await splitLineItem(LINE_ID, { parts })).toEqual({ data: { ids: [NEW_A, NEW_B] } });
    expect(rpcCall(mock)).toBeDefined();
  });

  it("trims categories and sends blank ones as null", async () => {
    const mock = mockSupabase(happy());

    await splitLineItem(LINE_ID, {
      parts: [
        { description: "A", amount: 50, category: "  State Inspection  " },
        { description: "B", amount: 30, category: "   " },
        { description: "C", amount: 20 },
      ],
    });

    expect(sentParts(mock, "category")).toEqual(["State Inspection", null, null]);
  });

  describe("a part line", () => {
    const partLine = { ...line, type: "part", cost: 30, category: "Brakes" };
    const partParts = [
      { description: "Pads", amount: 60, category: "Brakes" },
      { description: "Rotors", amount: 40, category: "Brakes" },
    ];
    const partHappy = (): SupabaseMockResult[] => [
      { data: partLine, error: null },
      { data: jobRow([partLine], true), error: null },
      { data: [NEW_A, NEW_B], error: null },
    ];

    it("shares the wholesale cost across the parts in proportion to their amounts", async () => {
      const mock = mockSupabase(partHappy());

      expect(await splitLineItem(LINE_ID, { parts: partParts })).toEqual({ data: { ids: [NEW_A, NEW_B] } });
      expect(sentParts(mock, "cost")).toEqual([18, 12]);
    });

    it("puts the rounding remainder of the cost on the last part, so the costs still add up", async () => {
      const tenDollarCost = { ...partLine, cost: 10 };
      const mock = mockSupabase([
        { data: tenDollarCost, error: null },
        { data: jobRow([tenDollarCost], true), error: null },
        { data: [NEW_A, NEW_B], error: null },
      ]);

      await splitLineItem(LINE_ID, {
        parts: [
          { description: "A", amount: 33.33, category: "Brakes" },
          { description: "B", amount: 33.33, category: "Brakes" },
          { description: "C", amount: 33.34, category: "Brakes" },
        ],
      });

      const costs = sentParts(mock, "cost") as number[];
      expect(costs).toEqual([3.33, 3.33, 3.34]);
      expect(Math.round(costs.reduce((a, b) => a + b, 0) * 100)).toBe(1000);
    });

    it("multiplies a per-unit cost by the quantity before sharing it", async () => {
      const twoUnits = { ...partLine, quantity: 2, unit_cost: 50, total: 100, cost: 15 };
      const mock = mockSupabase([
        { data: twoUnits, error: null },
        { data: jobRow([twoUnits], true), error: null },
        { data: [NEW_A, NEW_B], error: null },
      ]);

      await splitLineItem(LINE_ID, { parts: partParts });

      expect(sentParts(mock, "cost")).toEqual([18, 12]);
    });

    it.each([
      ["into", "Brakes", "State Inspection"],
      ["out of", "State Inspection", "Brakes"],
    ])("refuses a part split %s an inspection category, and calls nothing", async (_label, from, to) => {
      const mock = mockSupabase([
        { data: { ...partLine, category: from }, error: null },
        { data: jobRow([{ ...partLine, category: from }], true), error: null },
        { data: [NEW_A, NEW_B], error: null },
      ]);

      expect(
        await splitLineItem(LINE_ID, {
          parts: [
            { description: "A", amount: 60, category: from },
            { description: "B", amount: 40, category: to },
          ],
        }),
      ).toEqual({ error: SPLIT_PART_INSPECTION_MSG });
      expect(rpcCall(mock)).toBeUndefined();
      expect(tables(mock)).toEqual(["job_line_items"]);
    });
  });

  describe("category-scoped fees", () => {
    const hazmatOnOilChange = {
      ...SETTINGS,
      hazmat_enabled: true,
      hazmat_amount: 3,
      hazmat_categories: ["Oil Change"],
    } as unknown as ShopSettings;

    it("refuses when the new categories would switch a fee on and move the total", async () => {
      vi.mocked(getShopSettings).mockResolvedValue(hazmatOnOilChange);
      const mock = mockSupabase(happy());

      expect(await splitLineItem(LINE_ID, { parts })).toEqual({ error: SPLIT_FEE_MSG });
      expect(rpcCall(mock)).toBeUndefined();
    });

    it("allows the split when the fee already applied before and still applies after", async () => {
      vi.mocked(getShopSettings).mockResolvedValue(hazmatOnOilChange);
      const oilLine = { ...line, category: "Oil Change" };
      const mock = mockSupabase([
        { data: oilLine, error: null },
        { data: jobRow([oilLine]), error: null },
        { data: [NEW_A, NEW_B], error: null },
      ]);

      expect(await splitLineItem(LINE_ID, { parts })).toEqual({ data: { ids: [NEW_A, NEW_B] } });
      expect(rpcCall(mock)).toBeDefined();
    });

    it("refuses when settings can't be loaded, so the fee check can't be skipped", async () => {
      vi.mocked(getShopSettings).mockResolvedValue(null);
      const mock = mockSupabase(happy());

      expect(await splitLineItem(LINE_ID, { parts })).toEqual({
        error: expect.stringContaining("shop settings"),
      });
      expect(rpcCall(mock)).toBeUndefined();
    });
  });

  it.each([
    ["one part", [parts[0]]],
    ["a zero amount", [parts[0], { ...parts[1], amount: 0 }]],
    ["an amount under a cent", [parts[0], { ...parts[1], amount: 0.004 }]],
    ["a blank description", [parts[0], { ...parts[1], description: "  " }]],
  ])("refuses %s before touching the database", async (_label, bad) => {
    const mock = mockSupabase(happy());

    const result = await splitLineItem(LINE_ID, { parts: bad });

    expect(result).toHaveProperty("error");
    expect(result).not.toEqual({ error: SPLIT_LINE_TOTAL_MSG });
    expect(mock.calls).toEqual([]);
  });

  it("refuses when the line does not exist", async () => {
    const mock = mockSupabase([{ data: null, error: null }]);

    expect(await splitLineItem(LINE_ID, { parts })).toEqual({ error: "Line item not found" });
    expect(rpcCall(mock)).toBeUndefined();
  });

  it("surfaces a failed job read and calls nothing", async () => {
    const mock = mockSupabase([
      { data: line, error: null },
      { data: null, error: { message: "job boom" } },
    ]);

    expect(await splitLineItem(LINE_ID, { parts })).toEqual({ error: "job boom" });
    expect(rpcCall(mock)).toBeUndefined();
  });

  it("passes the split function's refusal through and revalidates nothing", async () => {
    const mock = mockSupabase([
      { data: line, error: null },
      { data: jobRow(), error: null },
      { data: null, error: { message: "The new lines must add up to exactly the original amount" } },
    ]);

    expect(await splitLineItem(LINE_ID, { parts })).toEqual({
      error: "The new lines must add up to exactly the original amount",
    });
    expect(rpcCall(mock)).toBeDefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when the caller is not a manager, before any read", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Not allowed" });
    const mock = mockSupabase(happy());

    expect(await splitLineItem(LINE_ID, { parts })).toEqual({ error: "Not allowed" });
    expect(mock.calls).toEqual([]);
  });
});
