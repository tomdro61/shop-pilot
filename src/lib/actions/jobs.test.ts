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

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { cancelJob, deleteJob, getJobs } from "./jobs";
import { createSupabaseMock } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";

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
