/**
 * Tests for markJobUnpaid and the guards that force every other path through
 * it.
 *
 * The shape to protect: a job goes back to unpaid only when nothing was
 * collected for it. Flipping a job that Stripe was paid for puts the charge
 * buttons back on it, so most of these tests assert both the refusal AND that
 * no UPDATE was issued.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe/terminal", () => ({ getPaymentIntentStatus: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getPaymentIntentStatus } from "@/lib/stripe/terminal";
import { markJobUnpaid, recordPayment, updateJob } from "./jobs";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const PAID_AT = "2026-09-29T14:02:11.123456+00:00";
const PI_ID = "pi_test123";

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    payment_status: "paid",
    payment_method: "stripe",
    paid_at: PAID_AT,
    stripe_payment_intent_id: null,
    customer_id: CUSTOMER_ID,
    ...overrides,
  };
}

function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

/** Query order: job, paid invoices, update (returning). */
function queue(
  job: Record<string, unknown> | null = buildJob(),
  paidInvoices: Record<string, unknown>[] = [],
  update: SupabaseMockResult = { data: { id: JOB_ID }, error: null }
): SupabaseMockResult[] {
  return [{ data: job, error: null }, { data: paidInvoices, error: null }, update];
}

function mockPaymentIntent(status: string | Error) {
  if (status instanceof Error) {
    vi.mocked(getPaymentIntentStatus).mockRejectedValue(status);
  } else {
    vi.mocked(getPaymentIntentStatus).mockResolvedValue({
      status,
      amount: 10000,
      metadata: {},
    } as Awaited<ReturnType<typeof getPaymentIntentStatus>>);
  }
}

type Mock = ReturnType<typeof mockSupabase>;
const updated = (mock: Mock) => mock.calls.find((c) => c.method === "update");
const callsAfter = (mock: Mock, method: string, arg?: unknown) => {
  const idx = mock.calls.findIndex(
    (c) => c.method === method && (arg === undefined || c.args[0] === arg)
  );
  return idx === -1 ? [] : mock.calls.slice(idx + 1);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true } as Awaited<
    ReturnType<typeof requireManager>
  >);
});

describe("markJobUnpaid — the happy path", () => {
  it("clears the status, the method and the paid date", async () => {
    const mock = mockSupabase(queue());

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: true });
    expect(updated(mock)?.args[0]).toEqual({
      payment_status: "unpaid",
      payment_method: null,
      paid_at: null,
    });
  });

  it("pins the update to this job, still paid, at the paid_at that was read", async () => {
    const mock = mockSupabase(queue());

    await markJobUnpaid(JOB_ID);

    const afterUpdate = callsAfter(mock, "update");
    expect(afterUpdate.slice(0, 5)).toEqual([
      { method: "eq", args: ["id", JOB_ID] },
      { method: "eq", args: ["payment_status", "paid"] },
      { method: "eq", args: ["paid_at", PAID_AT] },
      { method: "select", args: ["id"] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("pins a job with no paid date on paid_at being null", async () => {
    const mock = mockSupabase(queue(buildJob({ paid_at: null })));

    await markJobUnpaid(JOB_ID);

    expect(callsAfter(mock, "update")[2]).toEqual({ method: "is", args: ["paid_at", null] });
  });

  it("revalidates the job, the lists and the customer", async () => {
    mockSupabase(queue());

    await markJobUnpaid(JOB_ID);

    expect(revalidatePath).toHaveBeenCalledWith(`/jobs/${JOB_ID}`);
    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}`);
  });

  it.each(["cash", "check", "ach", "stripe"])("allows a payment recorded as %s", async (method) => {
    const mock = mockSupabase(queue(buildJob({ payment_method: method })));

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: true });
    expect(updated(mock)).toBeDefined();
  });
});

describe("markJobUnpaid — what it reads", () => {
  it("looks the job up by id and selects every column a guard depends on", async () => {
    const mock = mockSupabase(queue());

    await markJobUnpaid(JOB_ID);

    expect(mock.calls.slice(0, 4)).toEqual([
      { method: "from", args: ["jobs"] },
      {
        method: "select",
        args: ["id, payment_status, payment_method, paid_at, stripe_payment_intent_id, customer_id"],
      },
      { method: "eq", args: ["id", JOB_ID] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("looks for paid invoices on this job only", async () => {
    const mock = mockSupabase(queue());

    await markJobUnpaid(JOB_ID);

    expect(callsAfter(mock, "from", "invoices").slice(0, 4)).toEqual([
      { method: "select", args: ["id"] },
      { method: "eq", args: ["job_id", JOB_ID] },
      { method: "eq", args: ["status", "paid"] },
      { method: "limit", args: [1] },
    ]);
  });
});

describe("markJobUnpaid — refusals", () => {
  it("refuses a non-manager before touching the database", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Not authorized" } as Awaited<
      ReturnType<typeof requireManager>
    >);
    const mock = mockSupabase(queue());

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: false, error: "Not authorized" });
    expect(mock.calls).toEqual([]);
  });

  it("refuses when the job does not exist", async () => {
    const mock = mockSupabase(queue(null));

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: false, error: "Job not found" });
    expect(updated(mock)).toBeUndefined();
  });

  it("surfaces a failed job read", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "boom" } }]);

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: false, error: "boom" });
    expect(updated(mock)).toBeUndefined();
  });

  it.each(["unpaid", "invoiced", "waived"])("refuses a job that is %s", async (status) => {
    const mock = mockSupabase(queue(buildJob({ payment_status: status })));

    const result = await markJobUnpaid(JOB_ID);

    expect(result.ok).toBe(false);
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses a job paid on the card reader", async () => {
    const mock = mockSupabase(queue(buildJob({ payment_method: "terminal" })));

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("card reader") });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses a job with a paid Stripe invoice", async () => {
    const mock = mockSupabase(queue(buildJob(), [{ id: "inv1" }]));

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Stripe invoice") });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses when the invoice lookup fails", async () => {
    const mock = mockSupabase([
      { data: buildJob(), error: null },
      { data: null, error: { message: "invoices down" } },
    ]);

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: false, error: "invoices down" });
    expect(updated(mock)).toBeUndefined();
  });

  it("reports a payment that changed underneath it, and revalidates nothing", async () => {
    mockSupabase(queue(buildJob(), [], { data: null, error: null }));

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("changed") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a failed update", async () => {
    mockSupabase(queue(buildJob(), [], { data: null, error: { message: "write failed" } }));

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: false, error: "write failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("markJobUnpaid — a card-reader attempt on the job", () => {
  const jobWithAttempt = () => buildJob({ stripe_payment_intent_id: PI_ID });

  it("does not ask Stripe when no attempt was ever started", async () => {
    mockSupabase(queue());

    await markJobUnpaid(JOB_ID);

    expect(getPaymentIntentStatus).not.toHaveBeenCalled();
  });

  it("asks Stripe about this job's PaymentIntent", async () => {
    mockSupabase(queue(jobWithAttempt()));
    mockPaymentIntent("canceled");

    await markJobUnpaid(JOB_ID);

    expect(getPaymentIntentStatus).toHaveBeenCalledTimes(1);
    expect(getPaymentIntentStatus).toHaveBeenCalledWith(PI_ID);
  });

  it.each(["canceled", "requires_payment_method"])(
    "proceeds when the attempt is %s",
    async (status) => {
      const mock = mockSupabase(queue(jobWithAttempt()));
      mockPaymentIntent(status);

      expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: true });
      expect(updated(mock)).toBeDefined();
    }
  );

  it.each(["succeeded", "processing", "requires_capture", "requires_action", "requires_confirmation"])(
    "refuses when the attempt is %s",
    async (status) => {
      const mock = mockSupabase(queue(jobWithAttempt()));
      mockPaymentIntent(status);

      const result = await markJobUnpaid(JOB_ID);

      expect(result).toEqual({ ok: false, error: expect.stringContaining("card-reader payment") });
      expect(updated(mock)).toBeUndefined();
    }
  );

  it("refuses and reports to Sentry when Stripe cannot be reached", async () => {
    const mock = mockSupabase(queue(jobWithAttempt()));
    const failure = new Error("stripe down");
    mockPaymentIntent(failure);

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("nothing was changed") });
    expect(updated(mock)).toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: { source: "mark-job-unpaid" },
      extra: { jobId: JOB_ID, paymentIntentId: PI_ID },
    });
  });
});

describe("recordPayment — cannot move a job off paid", () => {
  it.each(["unpaid", "invoiced", "waived"] as const)(
    "refuses to set a paid job to %s",
    async (status) => {
      const mock = mockSupabase([{ data: { payment_status: "paid" }, error: null }]);

      const result = await recordPayment(JOB_ID, "cash", status);

      expect(result).toEqual({ error: expect.stringContaining("Mark as Unpaid") });
      expect(mock.calls.slice(0, 4)).toEqual([
        { method: "from", args: ["jobs"] },
        { method: "select", args: ["payment_status"] },
        { method: "eq", args: ["id", JOB_ID] },
        { method: "maybeSingle", args: [] },
      ]);
      expect(updated(mock)).toBeUndefined();
    }
  );

  it("still waives a job that is not paid", async () => {
    const mock = mockSupabase([{ data: { payment_status: "unpaid" }, error: null }, { error: null }]);

    expect(await recordPayment(JOB_ID, "cash", "waived")).toEqual({ success: true });
    expect(updated(mock)).toBeDefined();
  });

  it("refuses when the job cannot be read", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "boom" } }]);

    expect(await recordPayment(JOB_ID, "cash", "unpaid")).toEqual({ error: "boom" });
    expect(updated(mock)).toBeUndefined();
  });

  it("still records a payment", async () => {
    const mock = mockSupabase([{ error: null }]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ success: true });
    expect(updated(mock)?.args[0]).toMatchObject({ payment_status: "paid", payment_method: "cash" });
  });
});

describe("updateJob — cannot move a job off paid", () => {
  const form = (payment_status: "unpaid" | "invoiced" | "paid" | "waived") => ({
    customer_id: CUSTOMER_ID,
    status: "complete" as const,
    date_received: "2026-09-29",
    notes: "",
    payment_status,
  });

  it.each(["unpaid", "invoiced", "waived"] as const)(
    "refuses to set a paid job to %s",
    async (status) => {
      const mock = mockSupabase([{ data: { payment_status: "paid" }, error: null }]);

      const result = await updateJob(JOB_ID, form(status));

      expect(result).toEqual({ error: expect.stringContaining("Mark as Unpaid") });
      expect(mock.calls.slice(0, 4)).toEqual([
        { method: "from", args: ["jobs"] },
        { method: "select", args: ["payment_status"] },
        { method: "eq", args: ["id", JOB_ID] },
        { method: "maybeSingle", args: [] },
      ]);
      expect(updated(mock)).toBeUndefined();
    }
  );

  it("still updates a paid job that stays paid", async () => {
    const mock = mockSupabase([{ data: { id: JOB_ID }, error: null }]);

    const result = await updateJob(JOB_ID, form("paid"));

    expect(result).toEqual({ data: { id: JOB_ID } });
    expect(updated(mock)).toBeDefined();
  });
});
