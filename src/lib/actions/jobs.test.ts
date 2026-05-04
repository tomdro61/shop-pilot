/**
 * Server-action tests for src/lib/actions/jobs.ts. Focused on payment +
 * status guards on cancelJob and deleteJob — the bulwarks against leaving
 * orphaned Stripe state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { cancelJob, deleteJob } from "./jobs";
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
