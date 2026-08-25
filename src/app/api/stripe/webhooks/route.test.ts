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
import type Stripe from "stripe";

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, init }) },
}));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/stripe/quick-pay", () => ({ recordQuickPayJob: vi.fn() }));
vi.mock("@/lib/quo/client", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/resend/client", () => ({ sendEmail: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend/client";
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

    await POST(buildRequest());

    expect(updateCalls(mock.calls)).toHaveLength(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "deadlock detected" }),
      expect.objectContaining({
        tags: { source: "stripe-webhook", path: "invoice-status-flip" },
      })
    );
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

  /** Queue for the job branch: lookup, flip, job update, job fetch, settings. */
  function queueForJobBranch(unitCost: number): SupabaseMockResult[] {
    return [
      {
        data: { id: INVOICE_ROW_ID, job_id: JOB_ID, parking_reservation_id: null, status: "sent" },
        error: null,
      },
      { data: { id: INVOICE_ROW_ID }, error: null }, // atomic flip
      { data: null, error: null }, // jobs update -> paid
      {
        data: {
          id: JOB_ID,
          title: "Brake job",
          payment_method: "stripe",
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
            { type: "labor", description: "Labor", quantity: 1, unit_cost: unitCost },
          ],
        },
        error: null,
      },
      { data: { tax_rate: 0.0625, shop_supplies_enabled: false, hazmat_enabled: false }, error: null },
    ];
  }

  it("sends when the recomputed total equals amount_paid", async () => {
    mockStripeEvent({ amount_paid: 10000 });
    mockSupabase(queueForJobBranch(100));
    vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });

    await POST(buildRequest());

    expect(sendEmail).toHaveBeenCalledTimes(1);
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
