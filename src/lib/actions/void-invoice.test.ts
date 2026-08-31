/**
 * Tests for voidInvoiceForJob — the action that clears a wrong invoice so the
 * job can be billed again.
 *
 * The shape to protect: Stripe is settled BEFORE the local row is deleted. The
 * invoices row is the only link between a job and its Stripe invoice, and
 * handleInvoicePaid finds it by stripe_invoice_id — delete it while Stripe still
 * holds a payable invoice and nothing can ever reconcile that payment onto the
 * job. The refusals exist for that reason, and most of these tests assert both
 * the message returned AND the absence of the destructive side effect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { voidInvoiceForJob } from "./invoices";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const INVOICE_ID = "33333333-3333-4333-9333-333333333333";
const STRIPE_INVOICE_ID = "in_test123";

function buildJob(overrides: Record<string, unknown> = {}) {
  return { id: JOB_ID, payment_status: "unpaid", ...overrides };
}

function buildInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    status: "sent",
    stripe_invoice_id: STRIPE_INVOICE_ID,
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

function mockStripe(stripeInvoice: Record<string, unknown> | Error) {
  const retrieve =
    stripeInvoice instanceof Error
      ? vi.fn().mockRejectedValue(stripeInvoice)
      : vi.fn().mockResolvedValue(stripeInvoice);
  const voidInvoice = vi.fn().mockResolvedValue({ id: STRIPE_INVOICE_ID, status: "void" });
  vi.mocked(getStripe).mockReturnValue({
    invoices: { retrieve, voidInvoice },
  } as unknown as ReturnType<typeof getStripe>);
  return { retrieve, voidInvoice };
}

/** Query order: job, invoice list, delete (returning), payment_status reset. */
function queue(
  invoice: Record<string, unknown> | null = buildInvoiceRow(),
  job = buildJob(),
  del: SupabaseMockResult = { data: [{ id: INVOICE_ID }], error: null }
): SupabaseMockResult[] {
  return [
    { data: job, error: null },
    { data: invoice ? [invoice] : [], error: null },
    del,
    { error: null },
  ];
}

const deleted = (mock: ReturnType<typeof mockSupabase>) =>
  mock.calls.find((c) => c.method === "delete");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true } as Awaited<
    ReturnType<typeof requireManager>
  >);
});

describe("voidInvoiceForJob — the happy path", () => {
  it("voids in Stripe, then deletes the local row", async () => {
    const mock = mockSupabase(queue());
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({ ok: true });
    expect(stripe.voidInvoice).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
    expect(deleted(mock)).toBeDefined();
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", INVOICE_ID] });
    // The delete must return the rows it hit: without .select("id") a delete
    // that matched nothing is indistinguishable from one that worked.
    const delIdx = mock.calls.findIndex((c) => c.method === "delete");
    expect(mock.calls.slice(delIdx)).toContainEqual({ method: "select", args: ["id"] });
  });

  it("settles Stripe before it touches the local row", async () => {
    // The invariant the whole action is built around, asserted directly rather
    // than left to the refusal tests to imply.
    const mock = mockSupabase(queue());
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await voidInvoiceForJob(JOB_ID);

    // builder is typed Record<string, unknown>; the delete spy is a vi.fn().
    const deleteSpy = mock.builder.delete as ReturnType<typeof vi.fn>;
    expect(stripe.voidInvoice.mock.invocationCallOrder[0]).toBeLessThan(
      deleteSpy.mock.invocationCallOrder[0]
    );
  });

  it("looks the invoice up by this job, not any job", async () => {
    // Without the predicate the action loads whatever invoice sorts newest
    // across the whole table and voids someone else's live bill.
    const mock = mockSupabase(queue());
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await voidInvoiceForJob(JOB_ID);

    expect(mock.calls).toContainEqual({ method: "eq", args: ["job_id", JOB_ID] });
  });

  it("selects the columns the Stripe branch depends on", async () => {
    // Dropping stripe_invoice_id from the select silently skips the entire
    // Stripe block; the mock can't see that, so pin the column list.
    const mock = mockSupabase(queue());
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await voidInvoiceForJob(JOB_ID);

    expect(mock.calls).toContainEqual({
      method: "select",
      args: ["id, status, stripe_invoice_id"],
    });
  });

  it("reads the Stripe invoice this row points at", async () => {
    const mock = mockSupabase(queue());
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await voidInvoiceForJob(JOB_ID);

    expect(stripe.retrieve).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
    expect(deleted(mock)).toBeDefined();
  });

  it("asks for the newest invoice row and keeps duplicate detection on", async () => {
    const mock = mockSupabase(queue());
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await voidInvoiceForJob(JOB_ID);

    expect(mock.calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(mock.calls).toContainEqual({ method: "limit", args: [2] });
  });

  it("returns the job to unpaid so it can still be cancelled", async () => {
    // cancelJob and deleteJob refuse while payment_status reads 'invoiced' and
    // nothing else moves it back — without this the job is stuck forever.
    const mock = mockSupabase(queue());
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await voidInvoiceForJob(JOB_ID);

    const update = mock.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ payment_status: "unpaid" });
    // Scoped, so a cash settlement recorded after invoicing isn't overwritten.
    expect(mock.calls).toContainEqual({ method: "eq", args: ["payment_status", "invoiced"] });
  });

  it("revalidates every surface that shows the invoice", async () => {
    mockSupabase(queue());
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    await voidInvoiceForJob(JOB_ID);

    for (const path of [`/jobs/${JOB_ID}`, "/jobs", "/invoices", "/dashboard"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("skips the void call when Stripe already shows it void", async () => {
    // The state the shop reaches by voiding in the Stripe dashboard first.
    // Clearing the local row is all that's left.
    const mock = mockSupabase(queue());
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "void" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({ ok: true });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeDefined();
  });

  it("still voids an uncollectible invoice, which is a write-off and stays payable", async () => {
    const mock = mockSupabase(queue());
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "uncollectible" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({ ok: true });
    expect(stripe.voidInvoice).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
    expect(deleted(mock)).toBeDefined();
  });

  it("clears the local row when the Stripe invoice no longer exists", async () => {
    const missing = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "resource_missing",
      message: "No such invoice",
    });
    const mock = mockSupabase(queue());
    const stripe = mockStripe(missing);

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({ ok: true });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeDefined();
    // A key/mode mismatch reports resource_missing too, so record what vanished.
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "void_invoice_stripe_absent",
      expect.objectContaining({ tags: { source: "void-invoice", path: "stripe-absent" } })
    );
  });
});

describe("voidInvoiceForJob — refusals that protect a payment", () => {
  it("refuses a locally-paid invoice without touching Stripe", async () => {
    const mock = mockSupabase(queue(buildInvoiceRow({ status: "paid" })));
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "paid" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({
      ok: false,
      error: "This invoice is already paid — refund it in Stripe rather than voiding it.",
    });
    expect(stripe.retrieve).not.toHaveBeenCalled();
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it.each([["paid"], ["waived"]])(
    "refuses when the job itself is already %s",
    async (paymentStatus) => {
      // A job invoiced through Stripe then settled at the counter: the invoice
      // row still reads sent, but voiding would delete the only in-app link to
      // the Stripe invoice on a job that can no longer be re-billed.
      const mock = mockSupabase(queue(buildInvoiceRow(), buildJob({ payment_status: paymentStatus })));
      const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

      const result = await voidInvoiceForJob(JOB_ID);

      expect(result).toMatchObject({ ok: false });
      expect((result as { error: string }).error).toContain("already settled");
      expect(stripe.retrieve).not.toHaveBeenCalled();
      expect(deleted(mock)).toBeUndefined();
    }
  );

  it("refuses when Stripe says paid even though the local row says sent", async () => {
    // The local row only turns paid when handleInvoicePaid runs, so it lags
    // Stripe by the webhook's delivery time. Stripe's answer wins — deleting
    // here would orphan the payment from the job.
    const mock = mockSupabase(queue());
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "paid" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({
      ok: false,
      error: "Stripe shows this invoice as paid — refresh the job, then record the payment.",
    });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("keeps the local row when Stripe rejects the retrieve for any other reason", async () => {
    // resource_missing is the ONLY Stripe error that may fall through to the
    // delete. Anything else — a bad id, a permissions problem, a live/test key
    // mismatch — means we don't know the invoice's state.
    const denied = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "parameter_invalid_empty",
      message: "Invalid invoice id",
    });
    const mock = mockSupabase(queue());
    const stripe = mockStripe(denied);

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach Stripe to void this invoice. Try again in a moment.",
    });
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("keeps the local row when Stripe refuses the void", async () => {
    const mock = mockSupabase(queue());
    const retrieve = vi.fn().mockResolvedValue({ id: STRIPE_INVOICE_ID, status: "open" });
    const voidInvoice = vi.fn().mockRejectedValue(new Error("stripe exploded"));
    vi.mocked(getStripe).mockReturnValue({
      invoices: { retrieve, voidInvoice },
    } as unknown as ReturnType<typeof getStripe>);

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({
      ok: false,
      error:
        "Stripe wouldn't void this invoice. Open it in Stripe and void it there, then try again.",
    });
    expect(deleted(mock)).toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { source: "void-invoice", path: "stripe-void" } })
    );
  });

  it("keeps the local row when Stripe can't be reached at all", async () => {
    const mock = mockSupabase(queue());
    mockStripe(new Error("network down"));

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toMatchObject({ ok: false });
    expect(deleted(mock)).toBeUndefined();
  });

  it("refuses a row with no Stripe id rather than clearing it blind", async () => {
    // We can't confirm the invoice's state, and the row may point at something
    // payable whose id we lost. Voiding in Stripe fires invoice.voided, which
    // clears the row through the webhook instead.
    const mock = mockSupabase(queue(buildInvoiceRow({ stripe_invoice_id: null })));
    const stripe = mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain("isn't linked to Stripe");
    expect(stripe.retrieve).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
  });

  it("refuses when the job has more than one invoice on file", async () => {
    // Clearing only the newest leaves the job just as blocked, and the other
    // row's Stripe invoice live — behind a message saying it worked.
    const newest = buildInvoiceRow({ stripe_invoice_id: "in_newest" });
    const older = buildInvoiceRow({ id: "other", stripe_invoice_id: "in_older" });
    const mock = mockSupabase([
      { data: buildJob(), error: null },
      { data: [newest, older], error: null },
    ]);
    const stripe = mockStripe({ id: "in_newest", status: "open" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain("more than one invoice");
    expect(stripe.voidInvoice).not.toHaveBeenCalled();
    expect(deleted(mock)).toBeUndefined();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "void_invoice_duplicate_rows",
      expect.anything()
    );
  });

  it("reports the split state when Stripe voided but the local delete failed", async () => {
    mockSupabase(queue(buildInvoiceRow(), buildJob(), { data: null, error: { message: "delete failed" } }));
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain("Voided in Stripe");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: { source: "void-invoice", path: "delete-local-row" } })
    );
  });

  it("reports the split state when the delete matched no rows", async () => {
    // PostgREST reports error: null for a delete that hit nothing. Reporting
    // success would send the manager to create a replacement the surviving row
    // blocks — the exact dead end this feature exists to remove.
    mockSupabase(queue(buildInvoiceRow(), buildJob(), { data: [], error: null }));
    mockStripe({ id: STRIPE_INVOICE_ID, status: "open" });

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain("Voided in Stripe");
  });
});

describe("voidInvoiceForJob — lookups that fail", () => {
  it("surfaces a job lookup failure", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "statement timeout" } }]);

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({
      ok: false,
      error: "Couldn't load this job. Try again in a moment.",
    });
    expect(deleted(mock)).toBeUndefined();
  });

  it("surfaces an invoice lookup failure instead of claiming there's no invoice", async () => {
    // On a statement timeout, "this job has no invoice" is the wrong answer on
    // the one screen whose purpose is clearing one.
    const mock = mockSupabase([
      { data: buildJob(), error: null },
      { data: null, error: { message: "statement timeout" } },
    ]);

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({
      ok: false,
      error: "Couldn't load this job's invoice. Try again in a moment.",
    });
    expect(deleted(mock)).toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: { source: "void-invoice", path: "invoice-lookup" } })
    );
  });

  it("refuses when the job has no invoice", async () => {
    const mock = mockSupabase(queue(null));

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({ ok: false, error: "This job has no invoice to void." });
    expect(deleted(mock)).toBeUndefined();
  });

  it("refuses a non-manager without reading anything", async () => {
    vi.mocked(requireManager).mockResolvedValue({
      ok: false,
      error: "Unauthorized",
    } as Awaited<ReturnType<typeof requireManager>>);
    const mock = mockSupabase(queue());

    const result = await voidInvoiceForJob(JOB_ID);

    expect(result).toEqual({ ok: false, error: "Unauthorized" });
    expect(mock.calls).toHaveLength(0);
  });
});
