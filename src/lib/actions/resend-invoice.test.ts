/**
 * Tests for resendInvoiceForJob — the invoice payment-reminder action.
 *
 * This action is almost entirely refusals, so that is what these cover. The
 * refusals are the feature: sending when we shouldn't means texting a live
 * payment link to someone who already paid, or handing customer A's invoice to
 * customer B. Each `it` below corresponds to a guard, and a regression in any
 * one of them is a customer-visible incident rather than a cosmetic bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/actions/messages", () => ({ sendCustomerSMS: vi.fn() }));
vi.mock("@/lib/actions/email", () => ({ sendCustomerEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { sendCustomerSMS } from "@/lib/actions/messages";
import { sendCustomerEmail } from "@/lib/actions/email";
import { resendInvoiceForJob } from "./invoices";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const INVOICE_ID = "33333333-3333-4333-9333-333333333333";
const STRIPE_CUSTOMER_ID = "cus_test123";
const STRIPE_INVOICE_ID = "in_test123";
const HOSTED_URL = "https://invoice.stripe.com/i/acct_1/test";

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    title: "Front brakes",
    payment_status: "unpaid",
    customers: {
      id: CUSTOMER_ID,
      first_name: "Mike",
      email: "mike@example.com",
      phone: "+15551234567",
      stripe_customer_id: STRIPE_CUSTOMER_ID,
      customer_type: "retail",
    },
    vehicles: { year: 2019, make: "Honda", model: "Civic" },
    ...overrides,
  };
}

function buildInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    status: "sent",
    stripe_invoice_id: STRIPE_INVOICE_ID,
    stripe_hosted_invoice_url: HOSTED_URL,
    last_sent_at: null,
    ...overrides,
  };
}

function buildStripeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: STRIPE_INVOICE_ID,
    status: "open",
    customer: STRIPE_CUSTOMER_ID,
    hosted_invoice_url: HOSTED_URL,
    amount_remaining: 48620,
    default_payment_method: null,
    status_transitions: { paid_at: null },
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

function mockStripeRetrieve(invoiceOrError: Record<string, unknown> | Error) {
  const retrieve =
    invoiceOrError instanceof Error
      ? vi.fn().mockRejectedValue(invoiceOrError)
      : vi.fn().mockResolvedValue(invoiceOrError);
  vi.mocked(getStripe).mockReturnValue({
    invoices: { retrieve },
  } as unknown as ReturnType<typeof getStripe>);
  return retrieve;
}

/** Happy-path queue: job row, then the invoice-row list, then two bookkeeping writes. */
function happyQueue(job = buildJob(), invoice = buildInvoiceRow()): SupabaseMockResult[] {
  return [
    { data: job, error: null },
    { data: [invoice], error: null },
    { data: null, error: null },
    { data: null, error: null },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true } as Awaited<
    ReturnType<typeof requireManager>
  >);
  vi.mocked(sendCustomerSMS).mockResolvedValue({ data: { testMode: false } } as Awaited<
    ReturnType<typeof sendCustomerSMS>
  >);
  vi.mocked(sendCustomerEmail).mockResolvedValue({ sent: true });
});

describe("resendInvoiceForJob — auth and input", () => {
  it("requires a manager", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Not authorized" } as Awaited<
      ReturnType<typeof requireManager>
    >);
    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });
    expect(r).toEqual({ ok: false, error: "Not authorized" });
  });

  it("refuses when no channel is selected", async () => {
    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: false, sms: false });
    expect(r.ok).toBe(false);
    expect(sendCustomerSMS).not.toHaveBeenCalled();
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });
});

describe("resendInvoiceForJob — settled outside Stripe", () => {
  // The headline bug this feature had to avoid: recordPayment and the terminal
  // paths update `jobs` only, so a cash-paid job keeps an `open` Stripe invoice
  // forever. Asking Stripe can never reveal it — only payment_status can.
  // The queue deliberately supplies a healthy invoice row after the job. If the
  // payment_status guard is ever removed, execution reaches the Stripe call and
  // sends — asserting on the SPECIFIC refusal is what makes that a test failure.
  // Asserting only `ok === false` passed even with the guard deleted, because the
  // fallthrough refused for an unrelated reason.
  it.each([
    ["paid", /already marked paid/],
    ["waived", /waived/],
  ])("refuses a %s job before ever calling Stripe", async (status, expected) => {
    mockSupabase(happyQueue(buildJob({ payment_status: status })));
    const retrieve = mockStripeRetrieve(buildStripeInvoice());

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(expected);
    expect(retrieve).not.toHaveBeenCalled();
    expect(sendCustomerSMS).not.toHaveBeenCalled();
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("still allows 'invoiced', which means billed-but-unpaid", async () => {
    mockSupabase(happyQueue(buildJob({ payment_status: "invoiced" })));
    mockStripeRetrieve(buildStripeInvoice());

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: false, sms: true });

    expect(r.ok).toBe(true);
    expect(sendCustomerSMS).toHaveBeenCalled();
  });
});

describe("resendInvoiceForJob — Stripe state", () => {
  it("refuses a paid invoice and writes NOTHING", async () => {
    const mock = mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    mockStripeRetrieve(buildStripeInvoice({ status: "paid" }));

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(false);
    expect(sendCustomerSMS).not.toHaveBeenCalled();
    // handleInvoicePaid owns the paid transition. Any update here would trip its
    // idempotency guard and the customer would never get a receipt.
    expect(mock.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });

  it.each(["void", "uncollectible"])("refuses a %s invoice", async (status) => {
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    mockStripeRetrieve(buildStripeInvoice({ status }));

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });
    expect(r.ok).toBe(false);
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("fails closed when Stripe is unreachable", async () => {
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    mockStripeRetrieve(new Error("connection reset"));

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain("connection reset"); // no raw Stripe strings
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("distinguishes a deleted invoice from a transient outage", async () => {
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    const missing = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "resource_missing",
      message: "No such invoice",
    });
    mockStripeRetrieve(missing);

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no longer exists");
  });
});

describe("resendInvoiceForJob — recipient binding", () => {
  // A job's customer_id is editable after invoicing, and the hosted URL is an
  // unauthenticated bearer link showing the billed customer's details.
  it("refuses when the invoice belongs to a different Stripe customer", async () => {
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    mockStripeRetrieve(buildStripeInvoice({ customer: "cus_someone_else" }));

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("different customer");
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("refuses when the local customer has no Stripe id to compare against", async () => {
    const job = buildJob();
    (job.customers as Record<string, unknown>).stripe_customer_id = null;
    mockSupabase([
      { data: job, error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    mockStripeRetrieve(buildStripeInvoice());

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(false);
    // Must NOT tell the shop to void — a valid invoice can sit against a customer
    // row whose stripe_customer_id write failed non-fatally.
    if (!r.ok) expect(r.error).not.toContain("void");
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });
});

describe("resendInvoiceForJob — other refusals", () => {
  it("refuses a fleet customer", async () => {
    const job = buildJob();
    (job.customers as Record<string, unknown>).customer_type = "fleet";
    // Healthy invoice behind it, so removing the fleet guard sends rather than
    // refusing for an unrelated reason. See the payment_status note above.
    mockSupabase(happyQueue(job));
    mockStripeRetrieve(buildStripeInvoice());

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/[Ff]leet/);
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("refuses an invoice that auto-charges a card on file", async () => {
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    mockStripeRetrieve(buildStripeInvoice({ default_payment_method: "pm_test123" }));

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });
    expect(r.ok).toBe(false);
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("treats an empty-string stripe_invoice_id as missing, not as a valid id", async () => {
    // createStripeInvoice persists `|| ""`, so a null check would let this through.
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow({ stripe_invoice_id: "" })], error: null },
    ]);
    const retrieve = mockStripeRetrieve(buildStripeInvoice());

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(false);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("refuses when the job has no invoice", async () => {
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [], error: null },
    ]);
    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });
    expect(r.ok).toBe(false);
  });
});

describe("resendInvoiceForJob — sending", () => {
  it("reports per-channel results and stamps last_sent_at", async () => {
    const mock = mockSupabase(happyQueue());
    mockStripeRetrieve(buildStripeInvoice());

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sms).toEqual({ sent: true, testMode: false });
      expect(r.email).toEqual({ sent: true, testMode: undefined });
    }
    const updates = mock.calls.filter((c) => c.method === "update");
    expect(updates[0].args[0]).toHaveProperty("last_sent_at");
    // Guarded so a webhook that flipped the row to paid mid-flight isn't clobbered.
    expect(mock.calls).toContainEqual({ method: "neq", args: ["status", "paid"] });
  });

  it("uses the live balance, not the stored amount", async () => {
    mockSupabase(happyQueue());
    mockStripeRetrieve(buildStripeInvoice({ amount_remaining: 12345 }));

    await resendInvoiceForJob({ jobId: JOB_ID, email: false, sms: true });

    const body = vi.mocked(sendCustomerSMS).mock.calls[0][0].body;
    expect(body).toContain("$123.45");
  });

  it("sends first-send copy for a draft that was never delivered", async () => {
    mockSupabase(happyQueue(buildJob(), buildInvoiceRow({ status: "draft", last_sent_at: null })));
    mockStripeRetrieve(buildStripeInvoice({ status: "draft" }));

    await resendInvoiceForJob({ jobId: JOB_ID, email: false, sms: true });

    const body = vi.mocked(sendCustomerSMS).mock.calls[0][0].body;
    expect(body).toContain("is ready");
    expect(body).not.toContain("reminder");
  });

  it("keeps one channel alive when the other throws", async () => {
    mockSupabase(happyQueue());
    mockStripeRetrieve(buildStripeInvoice());
    vi.mocked(sendCustomerEmail).mockRejectedValue(new Error("Resend down"));

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: true, sms: true });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sms).toMatchObject({ sent: true });
      expect(r.email).toMatchObject({ sent: false });
    }
    expect(sendCustomerSMS).toHaveBeenCalled();
  });

  it("still reports success when the bookkeeping write fails", async () => {
    // The text is already gone. Reporting failure would invite a retry that
    // sends it twice.
    mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
      { data: null, error: { message: "column not found" } },
    ]);
    mockStripeRetrieve(buildStripeInvoice());

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: false, sms: true });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sms).toMatchObject({ sent: true });
      expect(r.stampWarning).toBeTruthy();
    }
  });

  it("does not stamp anything when every channel fails", async () => {
    const mock = mockSupabase([
      { data: buildJob(), error: null },
      { data: [buildInvoiceRow()], error: null },
    ]);
    mockStripeRetrieve(buildStripeInvoice());
    vi.mocked(sendCustomerSMS).mockResolvedValue({ error: "No phone number on file" } as Awaited<
      ReturnType<typeof sendCustomerSMS>
    >);

    const r = await resendInvoiceForJob({ jobId: JOB_ID, email: false, sms: true });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sms).toMatchObject({ sent: false });
    expect(mock.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });
});
