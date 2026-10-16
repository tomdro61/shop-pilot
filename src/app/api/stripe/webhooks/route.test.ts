/**
 * Tests for the invoice.paid webhook's atomic flip.
 *
 * These pin the flip's predicate and its bail-out behavior. They deliberately do
 * NOT claim to prove Postgres concurrency semantics — the Supabase client is a
 * mock that records calls and replays queued results, so it never evaluates a
 * predicate. What a unit test CAN guarantee is that the predicate stays
 * `.neq("status", "paid")` and that a zero-row flip still stops the handler
 * before any side effect. Both are the things a future edit is likely to break.
 *
 * Each case routes through an invoice with neither job_id nor parking_reservation_id
 * so the handler returns at the orphan-invoice guard immediately after the flip —
 * that isolates the flip without mocking the receipt/SMS/notify cascade.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, init }) },
}));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/stripe/quick-pay", () => ({ recordQuickPayJob: vi.fn() }));
vi.mock("@/lib/quo/client", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/resend/client", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/messaging/notify-owners", () => ({ notifyOwners: vi.fn() }));
vi.mock("@/lib/stripe/terminal-payment", () => ({ recordTerminalPayment: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend/client";
import { notifyOwners } from "@/lib/messaging/notify-owners";
import { recordTerminalPayment } from "@/lib/stripe/terminal-payment";
import * as Sentry from "@sentry/nextjs";
import { POST } from "./route";
import {
  createSupabaseMock,
  type RecordedCall,
  type SupabaseMockResult,
} from "@/lib/actions/__test-helpers__/supabase-mock";

const STRIPE_INVOICE_ID = "in_test123";
const INVOICE_ROW_ID = "33333333-3333-4333-9333-333333333333";

function buildRequest() {
  return new Request("https://example.com/api/stripe/webhooks", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });
}

/** Wires getStripe so constructEvent yields an invoice.paid event. */
function mockStripeEvent(invoice: Partial<Stripe.Invoice> = {}) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEvent: () => ({
        type: "invoice.paid",
        data: { object: { id: STRIPE_INVOICE_ID, amount_paid: 48620, ...invoice } },
      }),
    },
  } as unknown as ReturnType<typeof getStripe>);
}

/**
 * `results` feeds the mock's queue in order. The handler's first query is the
 * invoice lookup; the second is the atomic flip.
 */
function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createAdminClient).mockReturnValue(
    mock.client as unknown as ReturnType<typeof createAdminClient>
  );
  return mock;
}

/** The orphan row: exercises the flip, then returns at the job_id guard. */
const orphanInvoice = (status: string) => ({
  data: { id: INVOICE_ROW_ID, job_id: null, parking_reservation_id: null, status },
  error: null,
});

const updateCalls = (calls: RecordedCall[]) => calls.filter((c) => c.method === "update");

const statusOf = (res: unknown) =>
  (res as { init?: { status?: number } }).init?.status ?? 200;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("invoice.paid — atomic flip predicate", () => {
  it("guards the flip on .neq('status','paid'), never on the status it just read", async () => {
    mockStripeEvent();
    const mock = mockSupabase([orphanInvoice("draft"), { data: { id: INVOICE_ROW_ID }, error: null }]);

    await POST(buildRequest());

    expect(mock.calls).toContainEqual({ method: "neq", args: ["status", "paid"] });
    // Pinning to the status we read is the regression: any concurrent non-paid
    // write would make the flip match zero rows and silently skip every side
    // effect below it.
    expect(mock.calls).not.toContainEqual({ method: "eq", args: ["status", "draft"] });
    expect(mock.calls).not.toContainEqual({ method: "eq", args: ["status", "sent"] });
  });

  it("scopes the flip to one row of the invoices table", async () => {
    mockStripeEvent();
    const mock = mockSupabase([orphanInvoice("draft"), { data: { id: INVOICE_ROW_ID }, error: null }]);

    await POST(buildRequest());

    // Without `.eq("id", …)` this becomes
    // `UPDATE invoices SET status='paid' WHERE status <> 'paid'` — every unpaid
    // invoice in the database marked paid, each firing the job flip, receipt
    // email, customer SMS and owner notify below.
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", INVOICE_ROW_ID] });
    expect(mock.calls).toContainEqual({ method: "from", args: ["invoices"] });
  });

  it("writes the full paid payload, and proceeds past the flip", async () => {
    mockStripeEvent();
    const mock = mockSupabase([orphanInvoice("draft"), { data: { id: INVOICE_ROW_ID }, error: null }]);

    await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(1);
    expect(updateCalls(mock.calls)[0].args[0]).toMatchObject({
      status: "paid",
      payment_method: "stripe",
      // paid_at feeds receipts and the tax export; dropping it leaves paid
      // invoices with no paid date and no test would have noticed.
      paid_at: expect.any(String),
    });
    // Proceeded past the flip — reached the orphan guard rather than bailing early.
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "stripe_webhook_orphan_invoice",
      expect.anything()
    );
  });
});

describe("invoice.paid — idempotency", () => {
  it("issues no update at all when the row is already paid", async () => {
    mockStripeEvent();
    const mock = mockSupabase([orphanInvoice("paid")]);

    await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(0);
  });

  it("stops before any side effect when the flip matches zero rows", async () => {
    mockStripeEvent();
    // maybeSingle() resolving to null data = another delivery already flipped it.
    const mock = mockSupabase([orphanInvoice("sent"), { data: null, error: null }]);

    await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(1);
    // A zero-row flip is an expected race, not an error — and it must not reach
    // the orphan guard, which lives after the bail-out.
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports and stops when the flip itself errors", async () => {
    mockStripeEvent();
    const mock = mockSupabase([
      orphanInvoice("sent"),
      { data: null, error: { message: "deadlock detected" } },
    ]);

    const res = await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "deadlock detected" }),
      expect.objectContaining({
        tags: { source: "stripe-webhook", path: "invoice-status-flip" },
      })
    );
    // Non-2xx so Stripe redelivers; the retry re-attempts only the job side.
    expect((res as unknown as { init: { status: number } }).init.status).toBe(500);
  });

  it("asks Stripe to redeliver when the invoice lookup fails", async () => {
    mockStripeEvent();
    mockSupabase([{ data: null, error: { message: "connection reset" } }]);

    const res = await POST(buildRequest());

    expect((res as unknown as { init: { status: number } }).init.status).toBe(500);
  });
});

/**
 * The receipt email headlines what Stripe collected, but its itemised table is
 * recomputed at webhook time from current job_line_items and shop_settings.
 * Nothing locks line items once a job is invoiced and an invoice can sit unpaid
 * for 30 days, so those two can drift apart. These pin that a drift refuses to
 * send rather than emailing a receipt whose parts contradict its own total.
 */
describe("invoice.paid — receipt total must match what Stripe collected", () => {
  const JOB_ID = "44444444-4444-4444-9444-444444444444";
  const CUSTOMER_ID = "55555555-5555-4555-9555-555555555555";

  const SETTINGS = { tax_rate: 0.0625, shop_supplies_enabled: false, hazmat_enabled: false };

  const jobRow = (unitCost: number, overrides: Record<string, unknown> = {}) => ({
    id: JOB_ID,
    ro_number: 2059,
    title: "Brake job",
    payment_status: "unpaid",
    payment_method: null,
    paid_at: null,
    charge_sales_tax: false,
    customers: {
      id: CUSTOMER_ID,
      first_name: "Maria",
      last_name: "Silva",
      email: "maria@example.com",
      phone: null,
    },
    vehicles: null,
    job_line_items: [
      { type: "labor", description: "Labor", quantity: 1, unit_cost: unitCost, total: unitCost, category: null },
    ],
    ...overrides,
  });

  /** Queue for the job branch: lookup, invoice flip, settings, job fetch, job flip. */
  function queueForJobBranch(unitCost: number, job: Record<string, unknown> = jobRow(unitCost)): SupabaseMockResult[] {
    return [
      {
        data: { id: INVOICE_ROW_ID, job_id: JOB_ID, parking_reservation_id: null, status: "sent" },
        error: null,
      },
      { data: { id: INVOICE_ROW_ID }, error: null }, // atomic invoice flip
      { data: SETTINGS, error: null },
      { data: job, error: null },
      { data: { id: JOB_ID }, error: null }, // jobs flip -> paid
    ];
  }

  it("flips the job with a snapshot of what Stripe collected, guarded on not-yet-paid", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const mock = mockSupabase(queueForJobBranch(100));
    vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });

    await POST(buildRequest());

    const jobUpdate = updateCalls(mock.calls)[1];
    expect(jobUpdate.args[0]).toMatchObject({
      payment_status: "paid",
      payment_method: "stripe",
      amount_collected: 100,
      taxable_collected: 0,
      tax_collected: 0,
      tax_rate_applied: 0.0625,
    });
    const idx = mock.calls.indexOf(jobUpdate);
    expect(mock.calls.slice(idx + 1, idx + 5)).toEqual([
      { method: "eq", args: ["id", JOB_ID] },
      { method: "neq", args: ["payment_status", "paid"] },
      { method: "select", args: ["id"] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("does not overwrite a job already paid another way: it alerts the owners instead", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const mock = mockSupabase(
      queueForJobBranch(100, jobRow(100, { payment_status: "paid", payment_method: "cash", paid_at: "2026-10-01T15:00:00Z" }))
    );

    const res = await POST(buildRequest());

    // The invoice row flips (Stripe did collect), the job does not.
    expect(updateCalls(mock.calls)).toHaveLength(1);
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("DOUBLE PAYMENT");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "stripe_webhook_double_payment",
      expect.objectContaining({ level: "error" })
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect((res as unknown as { init?: { status: number } }).init?.status ?? 200).toBe(200);
  });

  it("asks Stripe to redeliver when the job flip fails, and sends no receipt", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const queue = queueForJobBranch(100);
    queue[4] = { data: null, error: { message: "timeout" } };
    mockSupabase(queue);

    const res = await POST(buildRequest());

    expect((res as unknown as { init: { status: number } }).init.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("on redelivery with the invoice row already paid, flips only a job that is still unpaid", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const mock = mockSupabase([
      {
        data: { id: INVOICE_ROW_ID, job_id: JOB_ID, parking_reservation_id: null, status: "paid" },
        error: null,
      },
      { data: { payment_status: "unpaid" }, error: null }, // redelivery job check
      { data: SETTINGS, error: null },
      { data: jobRow(100), error: null },
      { data: { id: JOB_ID }, error: null },
    ]);
    vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });

    await POST(buildRequest());

    const updates = updateCalls(mock.calls);
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toMatchObject({ payment_status: "paid", amount_collected: 100 });
    // The invoice row is not flipped again.
    expect(updates.filter((u) => "status" in (u.args[0] as Record<string, unknown>))).toHaveLength(0);
  });

  /** Redelivery: lookup (row already paid), redelivery job check, settings, job fetch. */
  const redeliveryQueue = (job: Record<string, unknown>): SupabaseMockResult[] => [
    {
      data: { id: INVOICE_ROW_ID, job_id: JOB_ID, parking_reservation_id: null, status: "paid" },
      error: null,
    },
    { data: { payment_status: job.payment_status }, error: null },
    { data: SETTINGS, error: null },
    { data: job, error: null },
  ];

  const JOB_FETCH_SELECT =
    "id, ro_number, title, payment_status, payment_method, paid_at, charge_sales_tax, customers(id, first_name, last_name, email, phone), vehicles(year, make, model, license_plate, vin), job_line_items(type, description, quantity, unit_cost, total, category)";

  it("on redelivery with both rows paid by this invoice, writes nothing and alerts no one", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const mock = mockSupabase(
      redeliveryQueue(
        jobRow(100, { payment_status: "paid", payment_method: "stripe", paid_at: "2026-10-01T15:00:00Z" })
      )
    );

    const res = await POST(buildRequest());

    // Reached the real job row rather than running out of queue.
    const fetchIdx = mock.calls.findIndex(
      (c) => c.method === "select" && c.args[0] === JOB_FETCH_SELECT
    );
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(mock.calls[fetchIdx + 1]).toEqual({ method: "eq", args: ["id", JOB_ID] });
    expect(updateCalls(mock.calls)).toHaveLength(0);
    expect(notifyOwners).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(statusOf(res)).toBe(200);
  });

  it("on redelivery, alerts the owners when the job was paid some other way", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const mock = mockSupabase(
      redeliveryQueue(
        jobRow(100, { payment_status: "paid", payment_method: "cash", paid_at: "2026-10-01T15:00:00Z" })
      )
    );

    const res = await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(0);
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(notifyOwners).toHaveBeenCalledWith(expect.stringContaining("DOUBLE PAYMENT"), "stripe-webhook");
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("cash");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "stripe_webhook_double_payment",
      expect.objectContaining({ level: "error" })
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(statusOf(res)).toBe(200);
  });

  it("on first delivery, treats a job already paid by 'stripe' as a double payment", async () => {
    // A hand-recorded card payment also stores "stripe"; this delivery has just
    // won the one-time invoice flip, so the job was not paid by this invoice.
    mockStripeEvent({ amount_paid: 10000 });
    const mock = mockSupabase(
      queueForJobBranch(
        100,
        jobRow(100, { payment_status: "paid", payment_method: "stripe", paid_at: "2026-10-01T15:00:00Z" })
      )
    );

    const res = await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(1);
    expect(updateCalls(mock.calls)[0].args[0]).toMatchObject({ status: "paid" });
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("DOUBLE PAYMENT");
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("$100.00");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "stripe_webhook_double_payment",
      expect.objectContaining({ level: "error" })
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(statusOf(res)).toBe(200);
  });

  it("asks Stripe to redeliver when the redelivery job lookup fails", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const mock = mockSupabase([
      {
        data: { id: INVOICE_ROW_ID, job_id: JOB_ID, parking_reservation_id: null, status: "paid" },
        error: null,
      },
      { data: null, error: { message: "jobs down" } },
    ]);

    const res = await POST(buildRequest());

    expect(statusOf(res)).toBe(500);
    expect(updateCalls(mock.calls)).toHaveLength(0);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      { message: "jobs down" },
      expect.objectContaining({
        tags: { source: "stripe-webhook", path: "redelivery-job-lookup" },
      })
    );
  });

  it("asks Stripe to redeliver when the job fetch fails, and updates no job", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    const queue = queueForJobBranch(100);
    queue[3] = { data: null, error: { message: "job fetch failed" } };
    const mock = mockSupabase(queue);

    const res = await POST(buildRequest());

    expect(statusOf(res)).toBe(500);
    // Only the invoice row flip.
    expect(updateCalls(mock.calls)).toHaveLength(1);
    expect(updateCalls(mock.calls)[0].args[0]).toMatchObject({ status: "paid" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyOwners).not.toHaveBeenCalled();
  });

  describe("when the job flip matches no rows", () => {
    const REREAD = [
      { method: "from", args: ["jobs"] },
      { method: "select", args: ["ro_number, payment_method, paid_at"] },
      { method: "eq", args: ["id", JOB_ID] },
      { method: "maybeSingle", args: [] },
    ];

    const raceQueue = (winner: SupabaseMockResult): SupabaseMockResult[] => {
      const queue = queueForJobBranch(100);
      queue[4] = { data: null, error: null };
      return [...queue, winner];
    };

    it("alerts the owners when a counter payment won the race", async () => {
      mockStripeEvent({ amount_paid: 10000 });
      const mock = mockSupabase(
        raceQueue({
          data: { ro_number: 2059, payment_method: "cash", paid_at: "2026-10-01T15:00:00Z" },
          error: null,
        })
      );

      const res = await POST(buildRequest());

      const jobUpdate = updateCalls(mock.calls)[1];
      const idx = mock.calls.indexOf(jobUpdate);
      expect(mock.calls.slice(idx + 5, idx + 9)).toEqual(REREAD);
      expect(notifyOwners).toHaveBeenCalledTimes(1);
      expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("DOUBLE PAYMENT");
      expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("RO-2059");
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "stripe_webhook_double_payment",
        expect.objectContaining({ tags: expect.objectContaining({ path: "double-payment-race" }) })
      );
      expect(sendEmail).not.toHaveBeenCalled();
      expect(statusOf(res)).toBe(200);
    });

    it("stays quiet when a concurrent delivery of this invoice won the race", async () => {
      mockStripeEvent({ amount_paid: 10000 });
      mockSupabase(
        raceQueue({
          data: { ro_number: 2059, payment_method: "stripe", paid_at: "2026-10-01T15:00:00Z" },
          error: null,
        })
      );

      const res = await POST(buildRequest());

      expect(notifyOwners).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(statusOf(res)).toBe(200);
    });

    it("asks Stripe to redeliver when the re-read fails", async () => {
      mockStripeEvent({ amount_paid: 10000 });
      mockSupabase(raceQueue({ data: null, error: { message: "reread failed" } }));

      const res = await POST(buildRequest());

      expect(notifyOwners).not.toHaveBeenCalled();
      expect(statusOf(res)).toBe(500);
    });
  });

  describe("the payment snapshot", () => {
    const partJob = jobRow(0, {
      charge_sales_tax: true,
      job_line_items: [
        { type: "part", description: "Pads", quantity: 1, unit_cost: 100, total: 100, category: null },
      ],
    });

    it("freezes the computed tax when the lines add up to what Stripe collected", async () => {
      mockStripeEvent({ amount_paid: 10625 });
      const mock = mockSupabase(queueForJobBranch(0, partJob));
      vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });

      expect(statusOf(await POST(buildRequest()))).toBe(200);

      expect(updateCalls(mock.calls)[1].args[0]).toMatchObject({
        payment_status: "paid",
        payment_method: "stripe",
        amount_collected: 106.25,
        taxable_collected: 100,
        tax_collected: 6.25,
        tax_rate_applied: 0.0625,
      });
      expect(Sentry.captureMessage).not.toHaveBeenCalledWith(
        "stripe_webhook_snapshot_mismatch",
        expect.anything()
      );
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("keeps Stripe's amount and leaves the tax figures null when the lines disagree", async () => {
      mockStripeEvent({ amount_paid: 10000 });
      const mock = mockSupabase(queueForJobBranch(0, partJob));
      vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });

      expect(statusOf(await POST(buildRequest()))).toBe(200);

      expect(updateCalls(mock.calls)[1].args[0]).toMatchObject({
        payment_status: "paid",
        amount_collected: 100,
        taxable_collected: null,
        tax_collected: null,
        tax_rate_applied: null,
      });
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "stripe_webhook_snapshot_mismatch",
        expect.objectContaining({
          level: "error",
          extra: expect.objectContaining({ paidCents: 10000, computedCents: 10625 }),
        })
      );
      // The receipt's own mismatch guard refuses too.
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  it("sends when the recomputed total equals amount_paid", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    mockSupabase(queueForJobBranch(100));
    vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });

    await POST(buildRequest());

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sent.to).toBe("maria@example.com");
    // The receipt labels the method from the literal "stripe", not the job row.
    expect(sent.html).toContain("Card (Stripe)");
  });

  it("refuses to email a receipt whose itemisation disagrees with the charge", async () => {
    // Line items were edited to $150 after a $100 invoice was sent and paid.
    mockStripeEvent({ amount_paid: 10000 });
    mockSupabase(queueForJobBranch(150));

    await POST(buildRequest());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("still sends a genuinely comped $0 invoice — 0 is a real amount, not a missing one", async () => {
    mockStripeEvent({ amount_paid: 0 });
    mockSupabase(queueForJobBranch(0));
    vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });

    await POST(buildRequest());

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

function mockEvent(type: string, object: Record<string, unknown>) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: () => ({ type, data: { object } }) },
  } as unknown as ReturnType<typeof getStripe>);
}

describe("payment_intent.succeeded on a job — the shared terminal recorder", () => {
  const JOB_ID = "66666666-6666-4666-9666-666666666666";

  it("records through recordTerminalPayment with the PaymentIntent's own amount", async () => {
    mockEvent("payment_intent.succeeded", { id: "pi_1", amount: 12345, metadata: { job_id: JOB_ID } });
    vi.mocked(recordTerminalPayment).mockResolvedValue({ ok: true, outcome: "recorded" });
    mockSupabase([]);

    const res = await POST(buildRequest());

    expect(recordTerminalPayment).toHaveBeenCalledWith({
      paymentIntentId: "pi_1",
      amountCents: 12345,
      jobId: JOB_ID,
      source: "stripe-webhook",
    });
    expect((res as unknown as { init?: { status: number } }).init?.status ?? 200).toBe(200);
  });

  it("asks Stripe to redeliver when the record fails", async () => {
    mockEvent("payment_intent.succeeded", { id: "pi_1", amount: 12345, metadata: { job_id: JOB_ID } });
    vi.mocked(recordTerminalPayment).mockResolvedValue({ ok: false, error: "db down" });
    mockSupabase([]);

    const res = await POST(buildRequest());

    expect((res as unknown as { init: { status: number } }).init.status).toBe(500);
  });
});

describe("charge.refunded — the refund reaches the job", () => {
  const JOB_ID = "77777777-7777-4777-9777-777777777777";

  /** charge.refunded plus the invoicePayments lookup findJobForPaymentIntent falls back to. */
  function mockRefundEvent(list: ReturnType<typeof vi.fn>) {
    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: () => ({
          type: "charge.refunded",
          data: { object: { id: "ch_1", payment_intent: "pi_9", amount_refunded: 4500 } },
        }),
      },
      invoicePayments: { list },
    } as unknown as ReturnType<typeof getStripe>);
  }

  const pinnedRefundWrite = (jobId: string) => [
    { method: "eq", args: ["id", jobId] },
    { method: "or", args: ["refunded_amount.is.null,refunded_amount.lt.45"] },
    { method: "select", args: ["id"] },
    { method: "maybeSingle", args: [] },
  ];

  it("writes Stripe's absolute refunded amount onto the job found by PaymentIntent", async () => {
    mockEvent("charge.refunded", { id: "ch_1", payment_intent: "pi_9", amount_refunded: 4500 });
    const mock = mockSupabase([
      { data: { id: JOB_ID, ro_number: 1234 }, error: null },
      { data: { id: JOB_ID }, error: null },
    ]);

    const res = await POST(buildRequest());

    expect(mock.calls.slice(0, 4)).toEqual([
      { method: "from", args: ["jobs"] },
      { method: "select", args: ["id, ro_number"] },
      { method: "eq", args: ["stripe_payment_intent_id", "pi_9"] },
      { method: "maybeSingle", args: [] },
    ]);
    const update = updateCalls(mock.calls)[0];
    expect(update.args[0]).toEqual({ refunded_amount: 45, refunded_at: expect.any(String) });
    const idx = mock.calls.indexOf(update);
    expect(mock.calls.slice(idx + 1, idx + 5)).toEqual(pinnedRefundWrite(JOB_ID));
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("$45.00");
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("RO-1234");
    expect(statusOf(res)).toBe(200);
  });

  it("sends no text when the job already carries this refund", async () => {
    mockEvent("charge.refunded", { id: "ch_1", payment_intent: "pi_9", amount_refunded: 4500 });
    const mock = mockSupabase([
      { data: { id: JOB_ID, ro_number: 1234 }, error: null },
      { data: null, error: null },
    ]);

    const res = await POST(buildRequest());

    const idx = mock.calls.indexOf(updateCalls(mock.calls)[0]);
    expect(mock.calls.slice(idx + 1, idx + 5)).toEqual(pinnedRefundWrite(JOB_ID));
    expect(notifyOwners).not.toHaveBeenCalled();
    expect(statusOf(res)).toBe(200);
  });

  it("falls back to the invoice the PaymentIntent paid, then that invoice's job", async () => {
    const INVOICE_JOB_ID = "88888888-8888-4888-9888-888888888888";
    const list = vi.fn().mockResolvedValue({ data: [{ invoice: "in_x" }] });
    mockRefundEvent(list);
    const mock = mockSupabase([
      { data: null, error: null }, // no job carries the PaymentIntent
      { data: { job_id: INVOICE_JOB_ID }, error: null }, // invoices row
      { data: { id: INVOICE_JOB_ID, ro_number: 77 }, error: null }, // jobs row
      { data: { id: INVOICE_JOB_ID }, error: null }, // refund write
    ]);

    const res = await POST(buildRequest());

    expect(list).toHaveBeenCalledWith({
      payment: { type: "payment_intent", payment_intent: "pi_9" },
      limit: 1,
    });
    const invIdx = mock.calls.findIndex(
      (c) => c.method === "from" && c.args[0] === "invoices"
    );
    expect(mock.calls.slice(invIdx, invIdx + 4)).toEqual([
      { method: "from", args: ["invoices"] },
      { method: "select", args: ["job_id"] },
      { method: "eq", args: ["stripe_invoice_id", "in_x"] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(mock.calls.slice(invIdx + 4, invIdx + 8)).toEqual([
      { method: "from", args: ["jobs"] },
      { method: "select", args: ["id, ro_number"] },
      { method: "eq", args: ["id", INVOICE_JOB_ID] },
      { method: "maybeSingle", args: [] },
    ]);
    const idx = mock.calls.indexOf(updateCalls(mock.calls)[0]);
    expect(mock.calls.slice(idx + 1, idx + 5)).toEqual(pinnedRefundWrite(INVOICE_JOB_ID));
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("RO-0077");
    expect(statusOf(res)).toBe(200);
  });

  it("texts that the refund could not be matched when no job or invoice carries it", async () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    mockRefundEvent(list);
    const mock = mockSupabase([{ data: null, error: null }]);

    const res = await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(0);
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("could not be matched to a job");
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("$45.00");
    expect(statusOf(res)).toBe(200);
  });

  it("asks Stripe to redeliver when the invoice-payment lookup fails transiently", async () => {
    const list = vi
      .fn()
      .mockRejectedValue(
        new Stripe.errors.StripeConnectionError({ type: "api_error", message: "socket hang up" })
      );
    mockRefundEvent(list);
    const mock = mockSupabase([{ data: null, error: null }]);

    const res = await POST(buildRequest());

    expect(statusOf(res)).toBe(500);
    expect(updateCalls(mock.calls)).toHaveLength(0);
    expect(notifyOwners).not.toHaveBeenCalled();
  });

  it("asks Stripe to redeliver when the refund write fails", async () => {
    mockEvent("charge.refunded", { id: "ch_1", payment_intent: "pi_9", amount_refunded: 4500 });
    mockSupabase([
      { data: { id: JOB_ID, ro_number: 1234 }, error: null },
      { data: null, error: { message: "write failed" } },
    ]);

    const res = await POST(buildRequest());

    expect((res as unknown as { init: { status: number } }).init.status).toBe(500);
  });
});

/**
 * invoice.voided is the backstop that makes voidInvoiceForJob's "Voided in
 * Stripe, but ShopPilot still shows the old invoice" message recoverable rather
 * than terminal, and the only thing that reconciles a void done in the Stripe
 * dashboard. An untested backstop is a claim, not a mechanism.
 */
function mockVoidedEvent(invoice: Partial<Stripe.Invoice> = {}) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEvent: () => ({
        type: "invoice.voided",
        data: { object: { id: STRIPE_INVOICE_ID, ...invoice } },
      }),
    },
  } as unknown as ReturnType<typeof getStripe>);
}

const JOB_ROW_ID = "44444444-4444-4444-9444-444444444444";

/** A job-linked row, the only kind the handler deletes. */
const jobInvoice = (status: string) => ({
  data: {
    id: INVOICE_ROW_ID,
    job_id: JOB_ROW_ID,
    parking_reservation_id: null,
    status,
  },
  error: null,
});

const deleteCalls = (calls: RecordedCall[]) => calls.filter((c) => c.method === "delete");

describe("invoice.voided — reconciling a void", () => {
  it("deletes the local row so the job can be invoiced again", async () => {
    mockVoidedEvent();
    const mock = mockSupabase([
      jobInvoice("sent"),
      { data: [{ id: INVOICE_ROW_ID }], error: null },
      { error: null },
    ]);

    const res = (await POST(buildRequest())) as unknown as { init?: { status?: number } };

    expect(deleteCalls(mock.calls)).toHaveLength(1);
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", INVOICE_ROW_ID] });
    expect(res.init?.status).toBeUndefined();
  });

  it("guards the delete against a row that turned paid since the read", async () => {
    // handleInvoicePaid can flip the row between the lookup and this write.
    mockVoidedEvent();
    const mock = mockSupabase([
      jobInvoice("sent"),
      { data: [{ id: INVOICE_ROW_ID }], error: null },
      { error: null },
    ]);

    await POST(buildRequest());

    expect(mock.calls).toContainEqual({ method: "neq", args: ["status", "paid"] });
  });

  it("returns the job to unpaid so cancel and delete stop refusing", async () => {
    mockVoidedEvent();
    const mock = mockSupabase([
      jobInvoice("sent"),
      { data: [{ id: INVOICE_ROW_ID }], error: null },
      { error: null },
    ]);

    await POST(buildRequest());

    const update = mock.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ payment_status: "unpaid" });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["payment_status", "invoiced"] });
  });

  it("treats a missing row as the normal end state, silently", async () => {
    // The action already deleted it, or chargeCardOnFile voided an invoice it
    // never recorded, or this is a redelivery. Alerting here would make every
    // successful void look like a failure.
    mockVoidedEvent();
    const mock = mockSupabase([{ data: null, error: null }]);

    const res = (await POST(buildRequest())) as unknown as { init?: { status?: number } };

    expect(deleteCalls(mock.calls)).toHaveLength(0);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(res.init?.status).toBeUndefined();
  });

  it("refuses to delete a row that reads paid, and escalates instead", async () => {
    // Stripe won't void a paid invoice, so this means the two have diverged.
    // Deleting would orphan the payment from the job.
    mockVoidedEvent();
    const mock = mockSupabase([jobInvoice("paid")]);

    await POST(buildRequest());

    expect(deleteCalls(mock.calls)).toHaveLength(0);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "stripe_webhook_void_on_paid_invoice",
      expect.objectContaining({ level: "error" })
    );
  });

  it("keeps parking invoices, which have no re-billing block to clear", async () => {
    mockVoidedEvent();
    const mock = mockSupabase([
      {
        data: {
          id: INVOICE_ROW_ID,
          job_id: null,
          parking_reservation_id: "res-1",
          status: "sent",
        },
        error: null,
      },
    ]);

    await POST(buildRequest());

    expect(deleteCalls(mock.calls)).toHaveLength(0);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "stripe_webhook_void_parking_invoice",
      expect.anything()
    );
  });

  it("asks Stripe to redeliver when the lookup fails", async () => {
    // The failure being backstopped is a DB write failing; if the DB is
    // unhealthy both this and the action fail the same way. One attempt each is
    // not a recovery path, and re-running is free.
    mockVoidedEvent();
    mockSupabase([{ data: null, error: { message: "statement timeout" } }]);

    const res = (await POST(buildRequest())) as unknown as { init?: { status?: number } };

    expect(res.init?.status).toBe(500);
  });

  it("asks Stripe to redeliver when the delete fails", async () => {
    mockVoidedEvent();
    mockSupabase([jobInvoice("sent"), { data: null, error: { message: "delete failed" } }]);

    const res = (await POST(buildRequest())) as unknown as { init?: { status?: number } };

    expect(res.init?.status).toBe(500);
  });

  it("escalates when the delete matched nothing rather than reporting quietly", async () => {
    // The row turned paid between the read and the delete — the divergence the
    // paid guard shouts about, reached through the race instead.
    mockVoidedEvent();
    mockSupabase([jobInvoice("sent"), { data: [], error: null }]);

    const res = (await POST(buildRequest())) as unknown as { init?: { status?: number } };

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "stripe_webhook_void_delete_matched_nothing",
      expect.objectContaining({ level: "error" })
    );
    // A retry can't fix a paid row, so this one is not redelivered.
    expect(res.init?.status).toBeUndefined();
  });
});
