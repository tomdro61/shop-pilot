/**
 * Tests for voidOpenInvoiceForJob — closes a job's payable Stripe invoice when
 * the job is settled another way.
 *
 * The shape to protect: Stripe is settled BEFORE the local row is deleted, and
 * the local row survives whenever Stripe's state is unknown or paid. Most tests
 * assert both the reason returned AND the absence of the delete.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Stripe from "stripe";

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe";
import { voidOpenInvoiceForJob } from "./void-open-invoice";
import {
  createSupabaseMock,
  type SupabaseMockResult,
} from "@/lib/actions/__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const INVOICE_ID = "33333333-3333-4333-9333-333333333333";
const STRIPE_INVOICE_ID = "in_test123";
const SOURCE = "test-source";

type Client = Parameters<typeof voidOpenInvoiceForJob>[0];

function buildInvoiceRow(overrides: Record<string, unknown> = {}) {
  return { id: INVOICE_ID, status: "sent", stripe_invoice_id: STRIPE_INVOICE_ID, ...overrides };
}

/**
 * Query order: invoice lookup, delete (returning), and — only when the delete
 * matched no rows — a re-read of the row by id.
 */
function mockSupabase(
  rows: Record<string, unknown>[] = [buildInvoiceRow()],
  del: SupabaseMockResult = { data: [{ id: INVOICE_ID }], error: null },
  reread?: SupabaseMockResult,
) {
  return createSupabaseMock([{ data: rows, error: null }, del, ...(reread ? [reread] : [])]);
}

type Mock = ReturnType<typeof createSupabaseMock>;

function mockStripe(
  stripeInvoice: Record<string, unknown> | Error,
  voidResult: Record<string, unknown> | Error = { id: STRIPE_INVOICE_ID, status: "void" },
) {
  const retrieve =
    stripeInvoice instanceof Error
      ? vi.fn().mockRejectedValue(stripeInvoice)
      : vi.fn().mockResolvedValue(stripeInvoice);
  const voidInvoice =
    voidResult instanceof Error
      ? vi.fn().mockRejectedValue(voidResult)
      : vi.fn().mockResolvedValue(voidResult);
  vi.mocked(getStripe).mockReturnValue({
    invoices: { retrieve, voidInvoice },
  } as unknown as ReturnType<typeof getStripe>);
  return { retrieve, voidInvoice };
}

const run = (mock: Mock) => voidOpenInvoiceForJob(mock.client as unknown as Client, JOB_ID, SOURCE);
const deleted = (mock: Mock) => mock.calls.find((c) => c.method === "delete");

const resourceMissing = () =>
  new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    code: "resource_missing",
    message: "No such invoice",
  });

const transientErrors: [string, Error][] = [
  ["a connection error", new Stripe.errors.StripeConnectionError({ type: "api_error", message: "socket hang up" })],
  ["a Stripe server error", new Stripe.errors.StripeAPIError({ type: "api_error", message: "500" })],
  ["a rate limit", new Stripe.errors.StripeRateLimitError({ type: "rate_limit_error", message: "slow down" })],
];

// A test-mode key changes how resource_missing is treated, so every test runs
// with no key unless it sets one.
const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.STRIPE_SECRET_KEY;
});

afterAll(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
});

describe("voidOpenInvoiceForJob — what it reads", () => {
  it("looks up this job's newest invoice rows, paid ones included", async () => {
    const mock = mockSupabase();
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await run(mock);

    expect(mock.calls.slice(0, 5)).toEqual([
      { method: "from", args: ["invoices"] },
      { method: "select", args: ["id, status, stripe_invoice_id"] },
      { method: "eq", args: ["job_id", JOB_ID] },
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "limit", args: [3] },
    ]);
  });

  it("refuses as paid online when any returned row is paid, touching nothing", async () => {
    const mock = mockSupabase([
      buildInvoiceRow({ stripe_invoice_id: "in_newest" }),
      buildInvoiceRow({
        id: "66666666-6666-4666-9666-666666666666",
        status: "paid",
        stripe_invoice_id: "in_paid",
      }),
    ]);
    const stripe = mockStripe({ id: "in_newest", status: "open" });

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "stripe-paid", stripeInvoiceId: "in_paid" });
    expect((result as { error: string }).error).toContain("paid online");
    expect(getStripe).not.toHaveBeenCalled();
    expect(stripe.retrieve).not.toHaveBeenCalled();
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("retrieves the Stripe invoice this row points at", async () => {
    const mock = mockSupabase();
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await run(mock);

    expect(stripe.retrieve).toHaveBeenCalledTimes(1);
    expect(stripe.retrieve).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
  });

  it("refuses, touching nothing, when the lookup returns two open rows", async () => {
    const mock = mockSupabase([
      buildInvoiceRow({ stripe_invoice_id: "in_newest" }),
      buildInvoiceRow({ id: "66666666-6666-4666-9666-666666666666", stripe_invoice_id: "in_older" }),
    ]);
    const stripe = mockStripe({ id: "in_newest", status: "open" });

    const result = await run(mock);

    // Closing only the newest would report success with the older link still
    // payable; voidInvoiceForJob refuses the same way.
    expect(result).toMatchObject({ ok: false, reason: "stripe-refused" });
    expect(stripe.retrieve).not.toHaveBeenCalled();
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(mock.calls.find((c) => c.method === "delete")).toBeUndefined();
  });
});

function callsAfterDelete(mock: Mock) {
  const idx = mock.calls.findIndex((c) => c.method === "delete");
  return idx === -1 ? [] : mock.calls.slice(idx + 1);
}

describe("voidOpenInvoiceForJob — the happy path", () => {
  it("voids this row's invoice in Stripe, then deletes this row", async () => {
    const mock = mockSupabase();
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await run(mock);

    expect(result).toEqual({ ok: true, voided: true, stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(stripe.voidInvoice).toHaveBeenCalledTimes(1);
    expect(stripe.voidInvoice).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
    const delIdx = mock.calls.findIndex((c) => c.method === "delete");
    expect(mock.calls[delIdx - 1]).toEqual({ method: "from", args: ["invoices"] });
    expect(callsAfterDelete(mock).slice(0, 3)).toEqual([
      { method: "eq", args: ["id", INVOICE_ID] },
      { method: "neq", args: ["status", "paid"] },
      { method: "select", args: ["id"] },
    ]);
  });

  it("settles Stripe before it touches the local row", async () => {
    const mock = mockSupabase();
    let deleteRecordedAtVoid: boolean | null = null;
    const retrieve = vi.fn().mockResolvedValue({ id: STRIPE_INVOICE_ID, status: "open" });
    const voidInvoice = vi.fn(async () => {
      deleteRecordedAtVoid = mock.calls.some((c) => c.method === "delete");
      return { id: STRIPE_INVOICE_ID, status: "void" };
    });
    vi.mocked(getStripe).mockReturnValue({
      invoices: { retrieve, voidInvoice },
    } as unknown as ReturnType<typeof getStripe>);

    await run(mock);

    expect(voidInvoice).toHaveBeenCalledTimes(1);
    expect(deleteRecordedAtVoid).toBe(false);
    expect(deleted(mock)).toBeDefined();
  });

  it("returns nothing-to-void when the job has no unpaid invoice row", async () => {
    const mock = mockSupabase([]);

    const result = await run(mock);

    expect(result).toEqual({ ok: true, voided: false, stripeInvoiceId: null });
    expect(getStripe).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("skips the void call and clears the row when Stripe already shows it void", async () => {
    const mock = mockSupabase();
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "void" });

    const result = await run(mock);

    expect(result).toEqual({ ok: true, voided: false, stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(callsAfterDelete(mock)[0]).toEqual({ method: "eq", args: ["id", INVOICE_ID] });
  });

  it("treats an invoice Stripe doesn't have as nothing to void, and clears the row", async () => {
    const mock = mockSupabase();
    const stripe = mockStripe(resourceMissing());

    const result = await run(mock);

    expect(result).toEqual({ ok: true, voided: false, stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(callsAfterDelete(mock)[0]).toEqual({ method: "eq", args: ["id", INVOICE_ID] });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "void_open_invoice_stripe_absent",
      expect.objectContaining({ tags: { source: SOURCE, path: "void-open-invoice-absent" } }),
    );
  });
});

describe("voidOpenInvoiceForJob — a test-mode key", () => {
  it("refuses a resource_missing under a test key instead of deleting the row", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    const mock = mockSupabase();
    const stripe = mockStripe(resourceMissing());

    const result = await run(mock);

    expect(result).toMatchObject({
      ok: false,
      reason: "stripe-refused",
      stripeInvoiceId: STRIPE_INVOICE_ID,
    });
    expect((result as { error: string }).error).toContain("test-mode");
    expect(stripe.retrieve).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("still clears the row on resource_missing under a live key", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_dummy";
    const mock = mockSupabase();
    mockStripe(resourceMissing());

    const result = await run(mock);

    expect(result).toEqual({ ok: true, voided: false, stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(deleted(mock)).toBeDefined();
  });
});

describe("voidOpenInvoiceForJob — refusals that keep the row", () => {
  it("refuses when Stripe says the invoice is paid, without voiding or deleting", async () => {
    const mock = mockSupabase();
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "paid" });

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "stripe-paid", stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("refuses a row with no Stripe id without calling Stripe", async () => {
    const mock = mockSupabase([buildInvoiceRow({ stripe_invoice_id: null })]);
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "stripe-refused", stripeInvoiceId: null });
    expect(stripe.retrieve).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("reports a failed lookup as a db failure, not as no invoice", async () => {
    const mock = createSupabaseMock([{ data: null, error: { message: "statement timeout" } }]);
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "db", stripeInvoiceId: null });
    expect(getStripe).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it.each(transientErrors)("classifies %s on retrieve as transient and keeps the row", async (_label, failure) => {
    const mock = mockSupabase();
    const stripe = mockStripe(failure);

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "transient", stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: { source: SOURCE, path: "void-open-invoice-retrieve", transient: "true" },
      extra: { jobId: JOB_ID, stripeInvoiceId: STRIPE_INVOICE_ID },
    });
  });

  it.each([
    [
      "an invalid request that is not resource_missing",
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "parameter_invalid_empty",
        message: "Invalid invoice id",
      }),
    ],
    ["an error that is not from Stripe", new Error("STRIPE_SECRET_KEY is not set")],
  ])("refuses on %s at retrieve and keeps the row", async (_label, failure) => {
    const mock = mockSupabase();
    const stripe = mockStripe(failure);

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "stripe-refused" });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it.each(transientErrors)("classifies %s on void as transient and keeps the row", async (_label, failure) => {
    const mock = mockSupabase();
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" }, failure);

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "transient", stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(deleted(mock)).toBeUndefined();
  });

  it("refuses when Stripe rejects the void outright, and keeps the row", async () => {
    const mock = mockSupabase();
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" }, new Error("stripe exploded"));

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "stripe-refused" });
    expect(deleted(mock)).toBeUndefined();
  });
});

describe("voidOpenInvoiceForJob — the local delete", () => {
  const REREAD = [
    { method: "from", args: ["invoices"] },
    { method: "select", args: ["id, status"] },
    { method: "eq", args: ["id", INVOICE_ID] },
    { method: "maybeSingle", args: [] },
  ];

  it("reports a delete that matched no rows, with the row still there, as paid online", async () => {
    const mock = mockSupabase([buildInvoiceRow()], { data: [], error: null }, {
      data: { id: INVOICE_ID, status: "paid" },
      error: null,
    });
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "stripe-paid", stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(callsAfterDelete(mock).slice(3, 7)).toEqual(REREAD);
  });

  it("treats a delete that matched no rows, with the row gone, as cleared", async () => {
    const mock = mockSupabase([buildInvoiceRow()], { data: [], error: null }, {
      data: null,
      error: null,
    });
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await run(mock);

    expect(result).toEqual({ ok: true, voided: true, stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(callsAfterDelete(mock).slice(3, 7)).toEqual(REREAD);
  });

  it("reports a failed re-read after an empty delete as a db failure", async () => {
    const mock = mockSupabase([buildInvoiceRow()], { data: [], error: null }, {
      data: null,
      error: { message: "reread failed" },
    });
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "db", stripeInvoiceId: STRIPE_INVOICE_ID });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      { message: "reread failed" },
      expect.objectContaining({ tags: { source: SOURCE, path: "void-open-invoice-reread" } }),
    );
  });

  it("reports a failed delete after a void as the split state", async () => {
    const mock = mockSupabase([buildInvoiceRow()], { data: null, error: { message: "delete failed" } });
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await run(mock);

    expect(result).toMatchObject({ ok: false, reason: "db" });
    expect((result as { error: string }).error).toContain("was voided");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      { message: "delete failed" },
      expect.objectContaining({ tags: { source: SOURCE, path: "void-open-invoice-delete" } }),
    );
  });
});
