/**
 * duplicateJob: a copy must carry the work and reset everything that
 * describes the original visit, and its line-item lookup must be scoped to
 * the source job.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, todayET: () => "2026-10-13" };
});

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { duplicateJob } from "./jobs";
import { createSupabaseMock, type RecordedCall } from "./__test-helpers__/supabase-mock";

const JOB_A = "11111111-1111-4111-9111-111111111111";
const NEW_JOB = "22222222-2222-4222-9222-222222222222";
const CUSTOMER_A = "44444444-4444-4444-9444-444444444444";
const VEHICLE_A = "66666666-6666-4666-9666-666666666666";

type Client = Awaited<ReturnType<typeof createClient>>;

function mockClient(queue: Parameters<typeof createSupabaseMock>[0]) {
  const mock = createSupabaseMock(queue);
  vi.mocked(createClient).mockResolvedValue(mock.client as unknown as Client);
  return mock;
}

function writeIndex(calls: RecordedCall[], method: string, nth = 0) {
  let seen = 0;
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].method === method) {
      if (seen === nth) return i;
      seen += 1;
    }
  }
  return -1;
}

function eqsAfter(calls: RecordedCall[], idx: number) {
  const out: unknown[][] = [];
  for (let i = idx + 1; i < calls.length; i++) {
    const c = calls[i];
    if (c.method === "eq") out.push(c.args);
    else if (c.method === "select" || c.method === "order") continue;
    else break;
  }
  return out;
}

const SOURCE = {
  id: JOB_A,
  customer_id: CUSTOMER_A,
  vehicle_id: VEHICLE_A,
  title: "Front brakes",
  category: "Brakes",
  notes: "Squeal on cold start",
  charge_sales_tax: false,
};

const ITEMS = [
  {
    type: "labor",
    description: "Replace pads",
    quantity: 1.5,
    unit_cost: 140,
    cost: 50,
    part_number: null,
    category: "Brakes",
  },
  {
    type: "part",
    description: "Pads",
    quantity: 1,
    unit_cost: 90,
    cost: 55,
    part_number: "P-100",
    category: "Brakes",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
});

describe("duplicateJob", () => {
  it("inserts a reset copy with the source's customer, vehicle, title, notes, and tax flag", async () => {
    const mock = mockClient([
      { data: SOURCE, error: null },
      { data: ITEMS, error: null },
      { data: { id: NEW_JOB }, error: null },
      { error: null },
    ]);

    const result = await duplicateJob(JOB_A);

    expect(result).toEqual({ data: { id: NEW_JOB } });

    const sourceLookup = mock.calls.findIndex((c) => c.method === "from" && c.args[0] === "jobs");
    expect(eqsAfter(mock.calls, sourceLookup)).toEqual([["id", JOB_A]]);

    const itemLookup = mock.calls.findIndex(
      (c) => c.method === "from" && c.args[0] === "job_line_items"
    );
    expect(eqsAfter(mock.calls, itemLookup)).toEqual([["job_id", JOB_A]]);

    const insert = writeIndex(mock.calls, "insert", 0);
    expect(mock.calls[insert - 1]).toEqual({ method: "from", args: ["jobs"] });
    expect(mock.calls[insert].args[0]).toEqual({
      customer_id: CUSTOMER_A,
      vehicle_id: VEHICLE_A,
      title: "Front brakes",
      category: "Brakes",
      notes: "Squeal on cold start",
      charge_sales_tax: false,
      status: "not_started",
      date_received: "2026-10-13",
      date_finished: null,
      scheduled_at: null,
      assigned_tech: null,
      mileage_in: null,
      payment_status: "unpaid",
      payment_method: null,
      paid_at: null,
      stripe_payment_intent_id: null,
    });
  });

  it("copies the line items onto the new job, dropping cost on labor rows", async () => {
    const mock = mockClient([
      { data: SOURCE, error: null },
      { data: ITEMS, error: null },
      { data: { id: NEW_JOB }, error: null },
      { error: null },
    ]);

    await duplicateJob(JOB_A);

    const copy = writeIndex(mock.calls, "insert", 1);
    expect(mock.calls[copy - 1]).toEqual({ method: "from", args: ["job_line_items"] });
    expect(mock.calls[copy].args[0]).toEqual([
      {
        job_id: NEW_JOB,
        type: "labor",
        description: "Replace pads",
        quantity: 1.5,
        unit_cost: 140,
        cost: null,
        part_number: null,
        category: "Brakes",
      },
      {
        job_id: NEW_JOB,
        type: "part",
        description: "Pads",
        quantity: 1,
        unit_cost: 90,
        cost: 55,
        part_number: "P-100",
        category: "Brakes",
      },
    ]);
  });

  it("rolls back the new job when the line-item copy fails", async () => {
    const mock = mockClient([
      { data: SOURCE, error: null },
      { data: ITEMS, error: null },
      { data: { id: NEW_JOB }, error: null },
      { error: { message: "copy failed" } },
      { error: null },
    ]);

    const result = await duplicateJob(JOB_A);

    expect(result).toEqual({ error: "Failed to copy line items: copy failed" });
    const del = writeIndex(mock.calls, "delete");
    expect(mock.calls[del - 1]).toEqual({ method: "from", args: ["jobs"] });
    expect(eqsAfter(mock.calls, del)).toEqual([["id", NEW_JOB]]);
  });

  it("reports the orphan when rollback also fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockClient([
      { data: SOURCE, error: null },
      { data: ITEMS, error: null },
      { data: { id: NEW_JOB }, error: null },
      { error: { message: "copy failed" } },
      { error: { message: "delete failed" } },
    ]);

    const result = await duplicateJob(JOB_A);

    expect(result).toEqual({
      error:
        "Couldn't copy line items and rollback failed — the job may need manual cleanup: copy failed",
    });
    spy.mockRestore();
  });

  it("refuses non-managers before touching the database", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Unauthorized" });

    const result = await duplicateJob(JOB_A);

    expect(result).toEqual({ error: "Unauthorized" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
