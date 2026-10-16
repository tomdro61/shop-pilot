/**
 * Tests for markJobUnpaid, and for the guards in recordPayment and updateJob
 * that stop those two from changing a paid job.
 *
 * The shape to protect: a job goes back to unpaid only when nothing was
 * collected for it. Flipping a job that Stripe was paid for puts the charge
 * buttons back on it, so most of these tests assert both the refusal AND that
 * no UPDATE was issued.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe/terminal", () => ({ getPaymentIntentStatus: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/invoices/void-open-invoice", () => ({ voidOpenInvoiceForJob: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getPaymentIntentStatus } from "@/lib/stripe/terminal";
import { getShopSettings } from "@/lib/actions/settings";
import { voidOpenInvoiceForJob } from "@/lib/invoices/void-open-invoice";
import { markJobUnpaid, recordPayment, updateJob } from "./jobs";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const PAID_AT = "2026-09-29T14:02:11.123456+00:00";
const PI_ID = "pi_test123";
const NOW = new Date("2026-09-29T18:00:00.000Z");
const MINUTE = 60 * 1000;
const secondsAgo = (ms: number) => Math.floor((NOW.getTime() - ms) / 1000);
const LONG_AGO = secondsAgo(24 * 60 * MINUTE);

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

function mockPaymentIntent(status: string | Error, created: number = LONG_AGO) {
  if (status instanceof Error) {
    vi.mocked(getPaymentIntentStatus).mockRejectedValue(status);
  } else {
    vi.mocked(getPaymentIntentStatus).mockResolvedValue({
      status,
      amount: 10000,
      metadata: {},
      created,
    } as Awaited<ReturnType<typeof getPaymentIntentStatus>>);
  }
}

type Mock = ReturnType<typeof mockSupabase>;
const updated = (mock: Mock) => mock.calls.find((c) => c.method === "update");
const tables = (mock: Mock) =>
  mock.calls.filter((c) => c.method === "from").map((c) => c.args[0]);
const callsAfter = (mock: Mock, method: string, arg?: unknown) => {
  const idx = mock.calls.findIndex(
    (c) => c.method === method && (arg === undefined || c.args[0] === arg)
  );
  return idx === -1 ? [] : mock.calls.slice(idx + 1);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(requireManager).mockResolvedValue({ ok: true } as Awaited<
    ReturnType<typeof requireManager>
  >);
});

afterEach(() => {
  vi.useRealTimers();
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
      amount_collected: null,
      taxable_collected: null,
      tax_collected: null,
      tax_rate_applied: null,
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

  // The table list pins the query count: the mock hands results out by
  // position, so a skipped invoice check would otherwise be absorbed by the
  // update consuming its result.
  it.each(["cash", "check", "ach", "stripe"])(
    "checks invoices, then updates, for a payment recorded as %s",
    async (method) => {
      const mock = mockSupabase(queue(buildJob({ payment_method: method })));

      expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: true });
      expect(tables(mock)).toEqual(["jobs", "invoices", "jobs"]);
    }
  );
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

    expect(result).toEqual({ ok: false, error: "This job isn't marked paid" });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses a job paid on the card reader", async () => {
    const mock = mockSupabase(queue(buildJob({ payment_method: "terminal" })));

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("card reader") });
    expect(updated(mock)).toBeUndefined();
  });

  it.each(["cash", "check", "ach", "stripe"])(
    "refuses a job with a paid Stripe invoice, recorded as %s",
    async (method) => {
      const mock = mockSupabase(queue(buildJob({ payment_method: method }), [{ id: "inv1" }]));

      const result = await markJobUnpaid(JOB_ID);

      expect(result).toEqual({ ok: false, error: expect.stringContaining("Stripe invoice") });
      expect(updated(mock)).toBeUndefined();
    }
  );

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
  // Recorded as cash: a reader attempt that was abandoned, then settled by hand.
  const jobWithAttempt = (method = "cash") =>
    buildJob({ payment_method: method, stripe_payment_intent_id: PI_ID });

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

  it.each(["cash", "check", "ach", "stripe"])(
    "asks Stripe whatever the payment was recorded as (%s)",
    async (method) => {
      const mock = mockSupabase(queue(jobWithAttempt(method)));
      mockPaymentIntent("succeeded");

      const result = await markJobUnpaid(JOB_ID);

      expect(result.ok).toBe(false);
      expect(getPaymentIntentStatus).toHaveBeenCalledWith(PI_ID);
      expect(updated(mock)).toBeUndefined();
    }
  );

  it.each(["canceled", "requires_payment_method"])(
    "proceeds when an old attempt is %s",
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

      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining("went through or is still in progress"),
      });
      expect(updated(mock)).toBeUndefined();
    }
  );

  it("refuses an attempt started 14 minutes ago that is still waiting for a card", async () => {
    const mock = mockSupabase(queue(jobWithAttempt()));
    mockPaymentIntent("requires_payment_method", secondsAgo(14 * MINUTE));

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("last 15 minutes") });
    expect(updated(mock)).toBeUndefined();
  });

  it("proceeds when that attempt is 16 minutes old", async () => {
    const mock = mockSupabase(queue(jobWithAttempt()));
    mockPaymentIntent("requires_payment_method", secondsAgo(16 * MINUTE));

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: true });
    expect(updated(mock)).toBeDefined();
  });

  it("proceeds on an attempt cancelled a minute ago", async () => {
    const mock = mockSupabase(queue(jobWithAttempt()));
    mockPaymentIntent("canceled", secondsAgo(MINUTE));

    expect(await markJobUnpaid(JOB_ID)).toEqual({ ok: true });
    expect(updated(mock)).toBeDefined();
  });

  it("refuses a recent attempt that succeeded, as a payment and not as a pending charge", async () => {
    mockSupabase(queue(jobWithAttempt()));
    mockPaymentIntent("succeeded", secondsAgo(MINUTE));

    expect(await markJobUnpaid(JOB_ID)).toEqual({
      ok: false,
      error: expect.stringContaining("went through or is still in progress"),
    });
  });

  it.each([
    [
      "a connection error",
      new Stripe.errors.StripeConnectionError({ type: "api_error", message: "socket hang up" }),
    ],
    ["a Stripe server error", new Stripe.errors.StripeAPIError({ type: "api_error", message: "500" })],
    [
      "a rate limit",
      new Stripe.errors.StripeRateLimitError({ type: "rate_limit_error", message: "slow down" }),
    ],
  ])("says to try again after %s", async (_label, failure) => {
    const mock = mockSupabase(queue(jobWithAttempt()));
    mockPaymentIntent(failure);

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Try again") });
    expect(updated(mock)).toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: { source: "mark-job-unpaid", path: "payment-intent-check", transient: "true" },
      extra: { jobId: JOB_ID, paymentIntentId: PI_ID },
    });
  });

  it.each([
    [
      "a PaymentIntent Stripe does not have",
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "resource_missing",
        message: "No such payment_intent",
      }),
    ],
    [
      "a rejected API key",
      new Stripe.errors.StripeAuthenticationError({ type: "authentication_error", message: "bad key" }),
    ],
    ["an error that is not from Stripe", new Error("STRIPE_SECRET_KEY is not set")],
  ])("does not say to try again after %s", async (_label, failure) => {
    const mock = mockSupabase(queue(jobWithAttempt()));
    mockPaymentIntent(failure);

    const result = await markJobUnpaid(JOB_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Look the payment up") });
    expect(result).not.toEqual({ ok: false, error: expect.stringContaining("Try again") });
    expect(updated(mock)).toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: { source: "mark-job-unpaid", path: "payment-intent-check", transient: "false" },
      extra: { jobId: JOB_ID, paymentIntentId: PI_ID },
    });
  });
});

const SETTINGS = {
  tax_rate: 0.0625,
  shop_supplies_enabled: false,
  shop_supplies_method: "percent_of_labor",
  shop_supplies_rate: 0.05,
  shop_supplies_cap: null,
  hazmat_enabled: false,
  hazmat_amount: 3,
  hazmat_label: "Environmental Fee",
  shop_supplies_categories: null,
  hazmat_categories: null,
} as unknown as Awaited<ReturnType<typeof getShopSettings>>;

const LINE_ITEMS = [
  { type: "labor", quantity: 1, unit_cost: 200, total: 200, category: "Brake Service" },
  { type: "part", quantity: 2, unit_cost: 50, total: 100, category: "Brake Service" },
];

const unpaidJob = (overrides: Record<string, unknown> = {}) => ({
  payment_status: "unpaid",
  charge_sales_tax: true,
  job_line_items: LINE_ITEMS,
  ...overrides,
});

const freshJob = (overrides: Record<string, unknown> = {}) => ({
  charge_sales_tax: true,
  job_line_items: LINE_ITEMS,
  ...overrides,
});

const FRESH_SELECT = "charge_sales_tax, job_line_items(type, quantity, unit_cost, total, category)";

/**
 * recordPayment reads the job, loads settings, closes any open Stripe invoice,
 * re-reads the job's lines, then flips the job with a payment snapshot built
 * from that second read. The snapshot is what the tax report files, and the
 * void is what stops a second payment from an old text, so both are pinned
 * next to the write.
 *
 * Query order: job, fresh job (lines), update (returning).
 */
describe("recordPayment — leaves a paid job alone", () => {
  const LOOKUP = [
    { method: "from", args: ["jobs"] },
    {
      method: "select",
      args: ["payment_status, charge_sales_tax, job_line_items(type, quantity, unit_cost, total, category)"],
    },
    { method: "eq", args: ["id", JOB_ID] },
    { method: "maybeSingle", args: [] },
  ];

  beforeEach(() => {
    vi.mocked(getShopSettings).mockResolvedValue(SETTINGS);
    vi.mocked(voidOpenInvoiceForJob).mockResolvedValue({ ok: true, voided: false, stripeInvoiceId: null });
  });

  it.each(["unpaid", "invoiced"] as const)(
    "refuses to record %s at all, before touching the database",
    async (status) => {
      const mock = mockSupabase([{ data: unpaidJob(), error: null }]);

      // @ts-expect-error the AI tool surface used to pass these; the runtime guard is the point
      const result = await recordPayment(JOB_ID, "cash", status);

      expect(result).toEqual({ error: expect.stringContaining("paid or waived") });
      expect(tables(mock)).toEqual([]);
      expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
    }
  );

  it.each(["paid", "waived"] as const)(
    "refuses to set a paid job to %s",
    async (status) => {
      const mock = mockSupabase([{ data: unpaidJob({ payment_status: "paid" }), error: null }]);

      const result = await recordPayment(JOB_ID, "cash", status);

      expect(result).toEqual({ error: expect.stringContaining("Mark as Unpaid") });
      expect(mock.calls.slice(0, 4)).toEqual(LOOKUP);
      expect(updated(mock)).toBeUndefined();
      expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
    }
  );

  it("refuses when the job cannot be read", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "boom" } }]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ error: "boom" });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses when the job does not exist", async () => {
    const mock = mockSupabase([{ data: null, error: null }]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ error: "Job not found" });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses when settings cannot be loaded, before closing any invoice", async () => {
    vi.mocked(getShopSettings).mockResolvedValue(null);
    const mock = mockSupabase([{ data: unpaidJob(), error: null }]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({
      error: expect.stringContaining("shop settings"),
    });
    expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
    expect(updated(mock)).toBeUndefined();
  });

  it("closes this job's open Stripe invoice before writing anything", async () => {
    const mock = mockSupabase([
      { data: unpaidJob(), error: null },
      { data: freshJob(), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);
    let updatesWhenVoided = -1;
    let selectsWhenVoided = -1;
    vi.mocked(voidOpenInvoiceForJob).mockImplementation(async () => {
      updatesWhenVoided = mock.calls.filter((c) => c.method === "update").length;
      selectsWhenVoided = mock.calls.filter((c) => c.method === "select").length;
      return { ok: true, voided: true, stripeInvoiceId: "in_1" };
    });

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ success: true });
    expect(voidOpenInvoiceForJob).toHaveBeenCalledWith(mock.client, JOB_ID, "record-payment");
    expect(updatesWhenVoided).toBe(0);
    // The line re-read happens after the void, not before it.
    expect(selectsWhenVoided).toBe(1);
  });

  it("snapshots the lines read AFTER the invoice is closed, not the first read", async () => {
    const mock = mockSupabase([
      {
        data: unpaidJob({ job_line_items: [LINE_ITEMS[0]] }),
        error: null,
      },
      { data: freshJob(), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ success: true });

    const freshIdx = mock.calls.findIndex(
      (c) => c.method === "select" && c.args[0] === FRESH_SELECT
    );
    expect(freshIdx).toBeGreaterThan(-1);
    expect(mock.calls[freshIdx - 1]).toEqual({ method: "from", args: ["jobs"] });
    expect(mock.calls.slice(freshIdx + 1, freshIdx + 3)).toEqual([
      { method: "eq", args: ["id", JOB_ID] },
      { method: "maybeSingle", args: [] },
    ]);
    // $200 labor + $100 part with 6.25% on the part — the part only exists in
    // the second read.
    expect(updated(mock)?.args[0]).toMatchObject({
      amount_collected: 306.25,
      taxable_collected: 100,
      tax_collected: 6.25,
      tax_rate_applied: 0.0625,
    });
  });

  it("surfaces a failed re-read of the lines, and writes nothing", async () => {
    const mock = mockSupabase([
      { data: unpaidJob(), error: null },
      { data: null, error: { message: "reread failed" } },
    ]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ error: "reread failed" });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses when the job vanished between the void and the re-read", async () => {
    const mock = mockSupabase([
      { data: unpaidJob(), error: null },
      { data: null, error: null },
    ]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ error: "Job not found" });
    expect(updated(mock)).toBeUndefined();
  });

  it("records nothing when the open invoice cannot be closed", async () => {
    vi.mocked(voidOpenInvoiceForJob).mockResolvedValue({
      ok: false,
      reason: "transient",
      error: "Couldn't reach Stripe",
      stripeInvoiceId: "in_1",
    });
    const mock = mockSupabase([{ data: unpaidJob(), error: null }]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ error: "Couldn't reach Stripe" });
    expect(updated(mock)).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("records a payment with its snapshot, on this job, and only while it is not paid", async () => {
    const mock = mockSupabase([
      { data: unpaidJob(), error: null },
      { data: freshJob(), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ success: true });
    expect(updated(mock)?.args[0]).toEqual({
      payment_method: "cash",
      payment_status: "paid",
      paid_at: NOW.toISOString(),
      amount_collected: 306.25,
      taxable_collected: 100,
      tax_collected: 6.25,
      tax_rate_applied: 0.0625,
    });
    expect(callsAfter(mock, "update").slice(0, 4)).toEqual([
      { method: "eq", args: ["id", JOB_ID] },
      { method: "neq", args: ["payment_status", "paid"] },
      { method: "select", args: ["id"] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("snapshots no tax on a job with sales tax turned off", async () => {
    const mock = mockSupabase([
      { data: unpaidJob({ charge_sales_tax: false }), error: null },
      { data: freshJob({ charge_sales_tax: false }), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    await recordPayment(JOB_ID, "check");
    expect(updated(mock)?.args[0]).toMatchObject({
      amount_collected: 300,
      taxable_collected: 0,
      tax_collected: 0,
      tax_rate_applied: 0.0625,
    });
  });

  it("waives an unpaid job with no paid date and no snapshot", async () => {
    const mock = mockSupabase([
      { data: unpaidJob(), error: null },
      { data: freshJob(), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    expect(await recordPayment(JOB_ID, "cash", "waived")).toEqual({ success: true });
    expect(updated(mock)?.args[0]).toEqual({
      payment_method: "cash",
      payment_status: "waived",
      paid_at: null,
      amount_collected: null,
      taxable_collected: null,
      tax_collected: null,
      tax_rate_applied: null,
    });
    expect(voidOpenInvoiceForJob).toHaveBeenCalledTimes(1);
  });

  it("refuses when the job became paid between the read and the write", async () => {
    const mock = mockSupabase([
      { data: unpaidJob(), error: null },
      { data: freshJob(), error: null },
      { data: null, error: null },
    ]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({
      error: expect.stringContaining("Mark as Unpaid"),
    });
    expect(updated(mock)).toBeDefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a failed write", async () => {
    const mock = mockSupabase([
      { data: unpaidJob(), error: null },
      { data: freshJob(), error: null },
      { data: null, error: { message: "write failed" } },
    ]);

    expect(await recordPayment(JOB_ID, "cash")).toEqual({ error: "write failed" });
    expect(updated(mock)).toBeDefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/**
 * updateJob carries the form through but may not change payment state or
 * cancel: payments go through recordPayment / markJobUnpaid (which snapshot
 * and close invoices) and cancels through cancelJob (which has the guards).
 */
describe("updateJob — cannot change payment state", () => {
  const form = (
    payment_status: "unpaid" | "invoiced" | "paid" | "waived",
    status: "complete" | "in_progress" | "cancelled" = "complete"
  ) => ({
    customer_id: CUSTOMER_ID,
    status,
    date_received: "2026-09-29",
    notes: "",
    payment_status,
  });

  const CURRENT_LOOKUP = [
    { method: "from", args: ["jobs"] },
    { method: "select", args: ["payment_status, payment_method, status, date_finished"] },
    { method: "eq", args: ["id", JOB_ID] },
    { method: "maybeSingle", args: [] },
  ];

  const current = (overrides: Record<string, unknown> = {}) => ({
    payment_status: "paid",
    payment_method: "cash",
    status: "complete",
    date_finished: "2026-09-28",
    ...overrides,
  });

  it.each(["unpaid", "invoiced", "waived"] as const)(
    "refuses to set a paid job to %s",
    async (status) => {
      const mock = mockSupabase([{ data: current(), error: null }]);

      const result = await updateJob(JOB_ID, form(status));

      expect(result).toEqual({ error: expect.stringContaining("Mark as Unpaid") });
      expect(mock.calls.slice(0, 4)).toEqual(CURRENT_LOOKUP);
      expect(updated(mock)).toBeUndefined();
    }
  );

  it("refuses to mark an unpaid job paid through the form", async () => {
    const mock = mockSupabase([{ data: current({ payment_status: "unpaid", payment_method: null }), error: null }]);

    expect(await updateJob(JOB_ID, form("paid"))).toEqual({
      error: expect.stringContaining("Mark as Paid"),
    });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses to cancel through the form, after reading only the job", async () => {
    const mock = mockSupabase([{ data: current(), error: null }]);

    expect(await updateJob(JOB_ID, form("paid", "cancelled"))).toEqual({
      error: expect.stringContaining("Cancel Job"),
    });
    expect(mock.calls.slice(0, 4)).toEqual(CURRENT_LOOKUP);
    expect(tables(mock)).toEqual(["jobs"]);
    expect(updated(mock)).toBeUndefined();
  });

  it("lets the form edit a job that is already cancelled", async () => {
    const mock = mockSupabase([
      {
        data: current({
          payment_status: "unpaid",
          payment_method: null,
          status: "cancelled",
          date_finished: null,
        }),
        error: null,
      },
      { data: { id: JOB_ID }, error: null },
    ]);

    expect(await updateJob(JOB_ID, form("unpaid", "cancelled"))).toEqual({
      data: { id: JOB_ID },
    });
    expect(updated(mock)?.args[0]).toMatchObject({ status: "cancelled", date_finished: null });
    expect(callsAfter(mock, "update")[0]).toEqual({ method: "eq", args: ["id", JOB_ID] });
  });

  it("refuses when the job cannot be read", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "boom" } }]);

    expect(await updateJob(JOB_ID, form("unpaid"))).toEqual({ error: "boom" });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses when the job does not exist", async () => {
    const mock = mockSupabase([{ data: null, error: null }]);

    expect(await updateJob(JOB_ID, form("unpaid"))).toEqual({ error: "Job not found" });
    expect(updated(mock)).toBeUndefined();
  });

  it("updates an unpaid job, by id, and leaves the payment fields out of the write", async () => {
    const mock = mockSupabase([
      { data: current({ payment_status: "unpaid", payment_method: null, date_finished: null, status: "in_progress" }), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    expect(await updateJob(JOB_ID, form("unpaid"))).toEqual({ data: { id: JOB_ID } });
    const payload = updated(mock)?.args[0];
    expect(payload).toMatchObject({ status: "complete", customer_id: CUSTOMER_ID });
    expect(payload).not.toHaveProperty("payment_status");
    expect(payload).not.toHaveProperty("payment_method");
    expect(callsAfter(mock, "update")[0]).toEqual({ method: "eq", args: ["id", JOB_ID] });
  });

  it("writes no payment fields on a paid job when the form carries paid through, and keeps its finish date", async () => {
    const mock = mockSupabase([
      { data: current(), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    expect(await updateJob(JOB_ID, { ...form("paid"), payment_method: "check" })).toEqual({
      data: { id: JOB_ID },
    });
    const payload = updated(mock)?.args[0];
    expect(payload).toMatchObject({ date_finished: "2026-09-28" });
    expect(payload).not.toHaveProperty("payment_status");
    expect(payload).not.toHaveProperty("payment_method");
  });

  it("keeps the stored finish date when the form moves an unpaid, uninvoiced job off complete", async () => {
    const mock = mockSupabase([
      { data: current({ payment_status: "unpaid", payment_method: null }), error: null },
      { data: null, error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    expect(await updateJob(JOB_ID, form("unpaid", "in_progress"))).toEqual({
      data: { id: JOB_ID },
    });
    expect(tables(mock)).toEqual(["jobs", "invoices", "jobs"]);
    expect(updated(mock)?.args[0]).toMatchObject({
      status: "in_progress",
      date_finished: "2026-09-28",
    });
  });

  it("refuses to move a paid job off complete", async () => {
    const mock = mockSupabase([{ data: current(), error: null }]);

    expect(await updateJob(JOB_ID, form("paid", "in_progress"))).toEqual({
      error: expect.stringContaining("can't leave Complete"),
    });
    expect(updated(mock)).toBeUndefined();
  });

  it("refuses to move an invoiced-but-unpaid job off complete when an invoice row exists", async () => {
    const mock = mockSupabase([
      { data: current({ payment_status: "unpaid", payment_method: null }), error: null },
      { data: { id: "inv1" }, error: null },
    ]);

    expect(await updateJob(JOB_ID, form("unpaid", "in_progress"))).toEqual({
      error: expect.stringContaining("invoice on file"),
    });
    expect(mock.calls).toContainEqual({ method: "from", args: ["invoices"] });
    expect(updated(mock)).toBeUndefined();
  });
});
