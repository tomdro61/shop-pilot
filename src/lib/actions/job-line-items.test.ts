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

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { LINE_ITEMS_LOCKED_MSG } from "@/lib/jobs/line-item-lock";
import { createLineItem, deleteLineItem, updateLineItem } from "./job-line-items";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

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

  it.each([
    ["into", "Brakes", "State Inspection"],
    ["out of", "inspection", "Brakes"],
  ])(
    "refuses moving a line %s an inspection category on a paid job, and issues no update",
    async (_label, from, to) => {
      const mock = mockSupabase([
        { data: { ...existingLine, category: from }, error: null },
        { data: { payment_status: "paid" }, error: null },
        { data: { id: LINE_ID }, error: null },
      ]);

      expect(await updateLineItem(LINE_ID, buildForm({ category: to }))).toEqual({
        error: expect.stringContaining("inspection category"),
      });
      expect(findCall(mock, "update")).toBeUndefined();
    }
  );

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
