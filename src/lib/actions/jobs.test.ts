/**
 * Server-action tests for src/lib/actions/jobs.ts. Focused on payment +
 * status guards on cancelJob and deleteJob — the bulwarks against leaving
 * orphaned Stripe state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  todayET: vi.fn(() => "2026-07-04"),
}));

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { cancelJob, createJob, deleteJob, getJobs, updateJobStatus } from "./jobs";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const INVOICE_ID = "33333333-3333-4333-9333-333333333333";
const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const TODAY = "2026-07-04";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
});

function mockClientReturning(jobRow: Record<string, unknown>) {
  const mock = createSupabaseMock({ data: jobRow, error: null });
  vi.mocked(createClient).mockResolvedValueOnce(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

function mockSearch(customers: { id: string }[] = [], vehicles: { id: string }[] = []) {
  const mock = createSupabaseMock([
    { data: customers, error: null },
    { data: vehicles, error: null },
    { data: [], error: null },
  ]);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

// The customer and vehicle lookups call .or() on the same builder before the
// jobs query does, so the jobs filter is the last one recorded.
function jobsOrFilter(mock: ReturnType<typeof mockSearch>) {
  const ors = mock.calls.filter((c) => c.method === "or");
  return ors[ors.length - 1]?.args[0];
}

describe("getJobs RO-number search", () => {
  it("adds an exact ro_number match when the search reads as an RO", async () => {
    const mock = mockSearch();
    await getJobs({ search: "RO-1860" });
    expect(jobsOrFilter(mock)).toBe(
      "title.ilike.%ro-1860%,notes.ilike.%ro-1860%,ro_number.eq.1860",
    );
  });

  it("keeps the customer and vehicle clauses alongside the RO match", async () => {
    const mock = mockSearch([{ id: "c1" }], [{ id: "v1" }]);
    await getJobs({ search: "1860" });
    expect(jobsOrFilter(mock)).toBe(
      "title.ilike.%1860%,notes.ilike.%1860%,ro_number.eq.1860,customer_id.in.(c1),vehicle_id.in.(v1)",
    );
  });

  it("adds no ro_number clause for a plain text search", async () => {
    const mock = mockSearch();
    await getJobs({ search: "honda" });
    expect(jobsOrFilter(mock)).toBe("title.ilike.%honda%,notes.ilike.%honda%");
  });
});

describe("cancelJob payment guards (H-6)", () => {
  it("blocks cancellation of a paid job and never issues an UPDATE", async () => {
    const mock = mockClientReturning({
      id: JOB_ID,
      status: "complete",
      payment_status: "paid",
      customer_id: null,
    });
    // The first guard the action hits is `status === "complete"` — that's
    // where this test exits.
    const result = await cancelJob(JOB_ID);
    expect(result).toEqual({ error: "Completed jobs can't be cancelled — delete instead" });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("blocks cancellation of a paid (non-complete) job", async () => {
    const mock = mockClientReturning({
      id: JOB_ID,
      status: "in_progress",
      payment_status: "paid",
      customer_id: null,
    });
    const result = await cancelJob(JOB_ID);
    expect(result).toEqual({
      error: "Paid jobs can't be cancelled — refund the payment in Stripe first",
    });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("blocks cancellation of an invoiced job", async () => {
    const mock = mockClientReturning({
      id: JOB_ID,
      status: "in_progress",
      payment_status: "invoiced",
      customer_id: null,
    });
    const result = await cancelJob(JOB_ID);
    expect(result).toEqual({
      error: "This job has an open invoice — void it in Stripe before cancelling",
    });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("blocks re-cancelling an already-cancelled job", async () => {
    const mock = mockClientReturning({
      id: JOB_ID,
      status: "cancelled",
      payment_status: "unpaid",
      customer_id: null,
    });
    const result = await cancelJob(JOB_ID);
    expect(result).toEqual({ error: "Job is already cancelled" });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });
});

describe("deleteJob payment guards (MP-3)", () => {
  it("blocks deletion of a paid job and never issues a DELETE", async () => {
    const mock = mockClientReturning({
      id: JOB_ID,
      payment_status: "paid",
      customer_id: null,
    });
    const result = await deleteJob(JOB_ID);
    expect(result).toEqual({
      error: "Paid jobs can't be deleted — refund the payment in Stripe first",
    });
    expect(mock.calls.find((c) => c.method === "delete")).toBeUndefined();
  });

  it("blocks deletion of an invoiced job and never issues a DELETE", async () => {
    const mock = mockClientReturning({
      id: JOB_ID,
      payment_status: "invoiced",
      customer_id: null,
    });
    const result = await deleteJob(JOB_ID);
    expect(result).toEqual({
      error: "This job has an open invoice — void it in Stripe before deleting",
    });
    expect(mock.calls.find((c) => c.method === "delete")).toBeUndefined();
  });

  it("returns 'Job not found' when the job doesn't exist", async () => {
    // Make the .single() lookup return data: null with no error.
    const mock = createSupabaseMock({ data: null, error: null });
    vi.mocked(createClient).mockResolvedValueOnce(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const result = await deleteJob(JOB_ID);
    expect(result).toEqual({ error: "Job not found" });
    expect(mock.calls.find((c) => c.method === "delete")).toBeUndefined();
  });
});

// Queue mode: each terminal call takes the next result, so the job read and the
// invoice lookup can answer differently.
function mockQueue(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

type QueueMock = ReturnType<typeof mockQueue>;
const tables = (mock: QueueMock) =>
  mock.calls.filter((c) => c.method === "from").map((c) => c.args[0]);
const callsAfter = (mock: QueueMock, method: string, arg?: unknown) => {
  const idx = mock.calls.findIndex(
    (c) => c.method === method && (arg === undefined || c.args[0] === arg),
  );
  return idx === -1 ? [] : mock.calls.slice(idx + 1);
};
const findCall = (mock: QueueMock, method: string) =>
  mock.calls.find((c) => c.method === method);

const UPDATED: SupabaseMockResult = { data: { id: JOB_ID }, error: null };

// updateJobStatus pins its write to the state its guards read.
const pinnedUpdate = (status: string, paymentStatus: string) => [
  { method: "eq", args: ["id", JOB_ID] },
  { method: "eq", args: ["status", status] },
  { method: "eq", args: ["payment_status", paymentStatus] },
  { method: "select", args: ["id"] },
  { method: "maybeSingle", args: [] },
];

const INVOICE_LOOKUP = [
  { method: "select", args: ["id"] },
  { method: "eq", args: ["job_id", JOB_ID] },
  { method: "limit", args: [1] },
  { method: "maybeSingle", args: [] },
];

describe("cancelJob — an invoices row blocks the cancel", () => {
  const openJob = { id: JOB_ID, status: "in_progress", payment_status: "unpaid", customer_id: null };

  it("refuses when this job has an invoice row, and never issues an UPDATE", async () => {
    const mock = mockQueue([
      { data: openJob, error: null },
      { data: { id: INVOICE_ID }, error: null },
    ]);

    const result = await cancelJob(JOB_ID);

    expect(result).toEqual({ error: "This job has an invoice on file — void it before cancelling" });
    expect(callsAfter(mock, "from", "invoices").slice(0, 4)).toEqual(INVOICE_LOOKUP);
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("refuses when the invoice lookup fails, and never issues an UPDATE", async () => {
    const mock = mockQueue([
      { data: openJob, error: null },
      { data: null, error: { message: "invoices down" } },
    ]);

    expect(await cancelJob(JOB_ID)).toEqual({ error: "invoices down" });
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("cancels this job when no invoice row exists", async () => {
    const mock = mockQueue([
      { data: openJob, error: null },
      { data: null, error: null },
      { error: null },
    ]);

    expect(await cancelJob(JOB_ID)).toEqual({ success: true });
    expect(tables(mock)).toEqual(["jobs", "invoices", "jobs"]);
    expect(callsAfter(mock, "from", "invoices").slice(0, 4)).toEqual(INVOICE_LOOKUP);
    expect(findCall(mock, "update")?.args[0]).toEqual({ status: "cancelled", date_finished: null });
    expect(callsAfter(mock, "update")[0]).toEqual({ method: "eq", args: ["id", JOB_ID] });
  });
});

describe("deleteJob — an invoices row blocks the delete", () => {
  const unpaidJob = { id: JOB_ID, payment_status: "unpaid", customer_id: null };

  it("refuses when this job has an invoice row, and never issues a DELETE", async () => {
    const mock = mockQueue([
      { data: unpaidJob, error: null },
      { data: { id: INVOICE_ID }, error: null },
    ]);

    const result = await deleteJob(JOB_ID);

    expect(result).toEqual({ error: "This job has an invoice on file — void it before deleting" });
    expect(callsAfter(mock, "from", "invoices").slice(0, 4)).toEqual(INVOICE_LOOKUP);
    expect(findCall(mock, "delete")).toBeUndefined();
  });

  it("refuses when the invoice lookup fails, and never issues a DELETE", async () => {
    const mock = mockQueue([
      { data: unpaidJob, error: null },
      { data: null, error: { message: "invoices down" } },
    ]);

    expect(await deleteJob(JOB_ID)).toEqual({ error: "invoices down" });
    expect(findCall(mock, "delete")).toBeUndefined();
  });

  it("deletes this job when no invoice row exists", async () => {
    const mock = mockQueue([
      { data: unpaidJob, error: null },
      { data: null, error: null },
      { error: null },
    ]);

    expect(await deleteJob(JOB_ID)).toEqual({ success: true });
    expect(tables(mock)).toEqual(["jobs", "invoices", "jobs"]);
    expect(callsAfter(mock, "from", "invoices").slice(0, 4)).toEqual(INVOICE_LOOKUP);
    expect(callsAfter(mock, "delete")[0]).toEqual({ method: "eq", args: ["id", JOB_ID] });
  });
});

describe("updateJobStatus — leaving complete", () => {
  const completeJob = (payment_status: string, date_finished: string | null = "2026-09-01") => ({
    status: "complete",
    payment_status,
    date_finished,
  });

  it("reads the columns its guards depend on, for this job", async () => {
    const mock = mockQueue([
      { data: completeJob("unpaid"), error: null },
      { data: null, error: null },
      UPDATED,
    ]);

    await updateJobStatus(JOB_ID, "in_progress");

    expect(mock.calls.slice(0, 4)).toEqual([
      { method: "from", args: ["jobs"] },
      { method: "select", args: ["status, payment_status, date_finished"] },
      { method: "eq", args: ["id", JOB_ID] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it.each(["paid", "waived"])("refuses to move a %s job off complete", async (paymentStatus) => {
    const mock = mockQueue([{ data: completeJob(paymentStatus), error: null }]);

    const result = await updateJobStatus(JOB_ID, "in_progress");

    expect(result).toEqual({ error: expect.stringContaining("settled") });
    expect(findCall(mock, "update")).toBeUndefined();
    expect(tables(mock)).toEqual(["jobs"]);
  });

  it("refuses to move an invoiced job off complete", async () => {
    const mock = mockQueue([{ data: completeJob("invoiced"), error: null }]);

    const result = await updateJobStatus(JOB_ID, "waiting_for_parts");

    expect(result).toEqual({ error: expect.stringContaining("invoice on file") });
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("refuses when an unpaid job has an invoices row", async () => {
    const mock = mockQueue([
      { data: completeJob("unpaid"), error: null },
      { data: { id: INVOICE_ID }, error: null },
    ]);

    const result = await updateJobStatus(JOB_ID, "in_progress");

    expect(result).toEqual({ error: expect.stringContaining("invoice on file") });
    expect(callsAfter(mock, "from", "invoices").slice(0, 4)).toEqual(INVOICE_LOOKUP);
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("refuses when the invoice lookup fails", async () => {
    const mock = mockQueue([
      { data: completeJob("unpaid"), error: null },
      { data: null, error: { message: "invoices down" } },
    ]);

    expect(await updateJobStatus(JOB_ID, "in_progress")).toEqual({ error: "invoices down" });
    expect(findCall(mock, "update")).toBeUndefined();
  });

  it("moves an unpaid, uninvoiced job off complete without touching date_finished", async () => {
    const mock = mockQueue([
      { data: completeJob("unpaid"), error: null },
      { data: null, error: null },
      UPDATED,
    ]);

    expect(await updateJobStatus(JOB_ID, "in_progress")).toEqual({ success: true });
    expect(findCall(mock, "update")?.args[0]).toEqual({ status: "in_progress" });
    expect(callsAfter(mock, "update").slice(0, 5)).toEqual(
      pinnedUpdate("complete", "unpaid")
    );
  });

  it("reports a job that changed between the read and the write, and revalidates nothing", async () => {
    const mock = mockQueue([
      { data: completeJob("unpaid"), error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    expect(await updateJobStatus(JOB_ID, "in_progress")).toEqual({
      error: "This job changed while you were updating it — reload and try again",
    });
    expect(callsAfter(mock, "update").slice(0, 5)).toEqual(
      pinnedUpdate("complete", "unpaid")
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a failed update", async () => {
    mockQueue([
      { data: completeJob("unpaid"), error: null },
      { data: null, error: null },
      { data: null, error: { message: "write failed" } },
    ]);

    expect(await updateJobStatus(JOB_ID, "in_progress")).toEqual({ error: "write failed" });
  });

  it("refuses a job that does not exist", async () => {
    const mock = mockQueue([{ data: null, error: null }]);

    expect(await updateJobStatus(JOB_ID, "complete")).toEqual({ error: "Job not found" });
    expect(findCall(mock, "update")).toBeUndefined();
  });
});

describe("updateJobStatus — the finish date", () => {
  it("keeps the existing date_finished when a job comes back to complete", async () => {
    const mock = mockQueue([
      { data: { status: "in_progress", payment_status: "unpaid", date_finished: "2026-09-01" }, error: null },
      UPDATED,
    ]);

    expect(await updateJobStatus(JOB_ID, "complete")).toEqual({ success: true });
    expect(findCall(mock, "update")?.args[0]).toEqual({
      status: "complete",
      date_finished: "2026-09-01",
    });
    expect(callsAfter(mock, "update").slice(0, 5)).toEqual(
      pinnedUpdate("in_progress", "unpaid")
    );
  });

  it("stamps today when the job has never been finished", async () => {
    const mock = mockQueue([
      { data: { status: "in_progress", payment_status: "unpaid", date_finished: null }, error: null },
      UPDATED,
    ]);

    expect(await updateJobStatus(JOB_ID, "complete")).toEqual({ success: true });

    expect(findCall(mock, "update")?.args[0]).toEqual({ status: "complete", date_finished: TODAY });
  });

  it("does not check invoices or write date_finished between non-complete statuses", async () => {
    const mock = mockQueue([
      { data: { status: "not_started", payment_status: "invoiced", date_finished: "2026-09-01" }, error: null },
      UPDATED,
    ]);

    expect(await updateJobStatus(JOB_ID, "in_progress")).toEqual({ success: true });
    expect(tables(mock)).toEqual(["jobs", "jobs"]);
    expect(findCall(mock, "update")?.args[0]).toEqual({ status: "in_progress" });
    expect(callsAfter(mock, "update").slice(0, 5)).toEqual(
      pinnedUpdate("not_started", "invoiced")
    );
  });
});

describe("createJob — payment and cancel state can't be set on create", () => {
  const form = (
    overrides: Partial<{ status: "not_started" | "cancelled"; payment_status: "unpaid" | "paid" }> = {},
  ) => ({
    customer_id: CUSTOMER_ID,
    status: "not_started" as const,
    date_received: "2026-10-15",
    notes: "",
    payment_status: "unpaid" as const,
    ...overrides,
  });

  it("refuses a job created as paid, and inserts nothing", async () => {
    const mock = mockQueue([{ data: { id: JOB_ID }, error: null }]);

    const result = await createJob(form({ payment_status: "paid" }));

    expect(result).toEqual({ error: expect.stringContaining("record the payment") });
    expect(findCall(mock, "insert")).toBeUndefined();
  });

  it("refuses a job created as cancelled, and inserts nothing", async () => {
    const mock = mockQueue([{ data: { id: JOB_ID }, error: null }]);

    const result = await createJob(form({ status: "cancelled" }));

    expect(result).toEqual({ error: expect.stringContaining("cancel it") });
    expect(findCall(mock, "insert")).toBeUndefined();
  });

  it("creates an unpaid, not-started job", async () => {
    const mock = mockQueue([{ data: { id: JOB_ID }, error: null }]);

    expect(await createJob(form())).toEqual({ data: { id: JOB_ID } });
    expect(findCall(mock, "insert")?.args[0]).toMatchObject({
      status: "not_started",
      payment_status: "unpaid",
    });
  });
});
