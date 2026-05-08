/**
 * Tests for chargeCardOnFile — the merchant-initiated payment action.
 * Covers preflight guards, decline + SCA error mapping, and rollback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { getShopSettings } from "@/lib/actions/settings";
import { chargeCardOnFile } from "./charge-card-on-file";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const STRIPE_CUSTOMER_ID = "cus_test123";
const STRIPE_PM_ID = "pm_test123";
const STRIPE_INVOICE_ID = "in_test123";

interface MockStripe {
  customers: {
    retrieve: ReturnType<typeof vi.fn>;
  };
  invoices: {
    create: ReturnType<typeof vi.fn>;
    finalizeInvoice: ReturnType<typeof vi.fn>;
    pay: ReturnType<typeof vi.fn>;
    voidInvoice: ReturnType<typeof vi.fn>;
  };
  invoiceItems: {
    create: ReturnType<typeof vi.fn>;
  };
}

let stripeMock: MockStripe;

function buildJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    status: "complete",
    payment_status: "unpaid",
    customers: {
      id: CUSTOMER_ID,
      first_name: "Test",
      last_name: "Customer",
      email: "test@example.com",
      phone: null,
      stripe_customer_id: STRIPE_CUSTOMER_ID,
    },
    job_line_items: [
      { type: "labor", description: "Oil change labor", quantity: 1, unit_cost: 50, category: "Oil Change" },
      { type: "part", description: "Filter", quantity: 1, unit_cost: 20, category: "Oil Change" },
    ],
    ...overrides,
  };
}

function buildShopSettings() {
  return {
    tax_rate: 0.0625,
    shop_supplies_enabled: false,
    shop_supplies_method: "percent_of_labor",
    shop_supplies_rate: 0.05,
    shop_supplies_cap: null,
    hazmat_enabled: false,
    hazmat_amount: 3.0,
    hazmat_label: "Environmental Fee",
    job_categories: [],
    shop_supplies_categories: null,
    hazmat_categories: null,
  } as unknown as Awaited<ReturnType<typeof getShopSettings>>;
}

function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValueOnce(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
  vi.mocked(getShopSettings).mockResolvedValue(buildShopSettings());

  stripeMock = {
    customers: {
      retrieve: vi.fn().mockResolvedValue({
        id: STRIPE_CUSTOMER_ID,
        invoice_settings: { default_payment_method: { id: STRIPE_PM_ID } },
      }),
    },
    invoices: {
      create: vi.fn().mockResolvedValue({ id: STRIPE_INVOICE_ID }),
      finalizeInvoice: vi.fn().mockResolvedValue({
        id: STRIPE_INVOICE_ID,
        amount_due: 7438, // $74.38 — matches buildJobRow line items + 6.25% tax on parts
        hosted_invoice_url: "https://stripe.com/invoice/abc",
      }),
      pay: vi.fn().mockResolvedValue({ id: STRIPE_INVOICE_ID, status: "paid" }),
      voidInvoice: vi.fn().mockResolvedValue({ id: STRIPE_INVOICE_ID }),
    },
    invoiceItems: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  vi.mocked(getStripe).mockReturnValue(
    stripeMock as unknown as ReturnType<typeof getStripe>
  );
});

describe("chargeCardOnFile — auth gate", () => {
  it("returns auth error when caller is not a manager", async () => {
    vi.mocked(requireManager).mockResolvedValueOnce({ ok: false, error: "Forbidden" });
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Forbidden" });
    // No Stripe or DB calls should have happened
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
    expect(stripeMock.invoices.pay).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("chargeCardOnFile — preflight guards", () => {
  it("returns 'Job not found' when DB lookup returns null", async () => {
    mockSupabase([{ data: null, error: null }]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Job not found" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when job is not complete", async () => {
    mockSupabase([{ data: buildJobRow({ status: "in_progress" }), error: null }]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Job must be complete before charging" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when job is already paid", async () => {
    mockSupabase([{ data: buildJobRow({ payment_status: "paid" }), error: null }]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Job is already paid" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when job payment is waived", async () => {
    mockSupabase([{ data: buildJobRow({ payment_status: "waived" }), error: null }]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Job payment is waived" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when customer has no stripe_customer_id", async () => {
    const job = buildJobRow();
    job.customers.stripe_customer_id = null as unknown as string;
    mockSupabase([{ data: job, error: null }]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Customer has no card on file" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when job has no line items", async () => {
    mockSupabase([{ data: buildJobRow({ job_line_items: [] }), error: null }]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Job has no line items" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when the customers join is null (broken FK or deleted customer)", async () => {
    mockSupabase([{ data: buildJobRow({ customers: null }), error: null }]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Job has no customer" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when grand total computes to zero (e.g., all-zero line items)", async () => {
    const zeroJob = buildJobRow({
      job_line_items: [
        { type: "labor", description: "Free", quantity: 1, unit_cost: 0, category: "Misc" },
      ],
    });
    mockSupabase([
      { data: zeroJob, error: null },
      { data: null, error: null },
    ]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Job total must be greater than zero" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("returns clearer message when prior invoice is already paid (race retry)", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: { id: "inv1", status: "paid" }, error: null },
    ]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({
      ok: false,
      error: "This job is already paid — refresh to see the receipt.",
    });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when an existing non-paid invoice is found", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: { id: "inv1", status: "sent" }, error: null },
    ]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "An invoice already exists for this job" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when Stripe customer has no default payment method", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: null, error: null },
    ]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: null },
    });
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "No card on file for this customer" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when Stripe customer is deleted", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: null, error: null },
    ]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      deleted: true,
    });
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({ ok: false, error: "Stripe customer is missing — re-add the card" });
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });

  it("blocks when shop settings load fails", async () => {
    vi.mocked(getShopSettings).mockResolvedValueOnce(null);
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: null, error: null },
    ]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Couldn't load shop settings");
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
  });
});

describe("chargeCardOnFile — DB insert failure rollback", () => {
  it("voids the Stripe invoice and surfaces the DB error when local insert fails", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },                       // fetch job
      { data: null, error: null },                                 // no existing invoice
      { data: null, error: { message: "duplicate key" } },         // INSERT FAILS
    ]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "Invoice created in Stripe but failed to save locally"
    );
    expect(stripeMock.invoices.voidInvoice).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
    // Critical: pay() must NOT run if the local row didn't persist — otherwise
    // we'd charge a card with no DB record for the webhook to reconcile.
    expect(stripeMock.invoices.pay).not.toHaveBeenCalled();
  });
});

describe("chargeCardOnFile — pay() error mapping", () => {
  function setupHappyPathThroughFinalize() {
    mockSupabase([
      { data: buildJobRow(), error: null }, // fetch job
      { data: null, error: null },           // no existing invoice
      { data: null, error: null },           // insert invoices row succeeds
    ]);
  }

  function makeStripeCardError(code: string, declineCode?: string, message = "Card declined") {
    const err = Object.create(Stripe.errors.StripeCardError.prototype);
    err.message = message;
    err.code = code;
    if (declineCode) err.decline_code = declineCode;
    err.type = "StripeCardError";
    err.rawType = "card_error";
    return err;
  }

  it("returns SCA-specific message on `authentication_required` code", async () => {
    setupHappyPathThroughFinalize();
    stripeMock.invoices.pay.mockRejectedValueOnce(makeStripeCardError("authentication_required"));
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({
      ok: false,
      error: "This card requires customer authentication — collect via Terminal instead",
    });
    expect(stripeMock.invoices.voidInvoice).toHaveBeenCalledWith(STRIPE_INVOICE_ID);
  });

  it("returns SCA-specific message on `invoice_payment_intent_requires_action` code", async () => {
    setupHappyPathThroughFinalize();
    stripeMock.invoices.pay.mockRejectedValueOnce(
      makeStripeCardError("invoice_payment_intent_requires_action")
    );
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({
      ok: false,
      error: "This card requires customer authentication — collect via Terminal instead",
    });
    expect(stripeMock.invoices.voidInvoice).toHaveBeenCalled();
  });

  it("returns generic decline message with decline_code", async () => {
    setupHappyPathThroughFinalize();
    stripeMock.invoices.pay.mockRejectedValueOnce(
      makeStripeCardError("card_declined", "insufficient_funds")
    );
    const result = await chargeCardOnFile(JOB_ID);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Card declined (insufficient_funds)");
    expect((result as { ok: false; error: string }).error).toContain("try Terminal or another method");
    expect(stripeMock.invoices.voidInvoice).toHaveBeenCalled();
  });

  it("falls back to err.message when decline_code is missing", async () => {
    setupHappyPathThroughFinalize();
    stripeMock.invoices.pay.mockRejectedValueOnce(
      makeStripeCardError("card_declined", undefined, "Your card was declined")
    );
    const result = await chargeCardOnFile(JOB_ID);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Your card was declined");
  });

  it("does NOT roll back on non-StripeCardError (ambiguous failure leaves state intact)", async () => {
    setupHappyPathThroughFinalize();
    const networkErr = new Error("Network blip");
    stripeMock.invoices.pay.mockRejectedValueOnce(networkErr);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Couldn't confirm the charge");
    // Critical: no void or delete on ambiguous failures — let the webhook reconcile
    expect(stripeMock.invoices.voidInvoice).not.toHaveBeenCalled();
  });
});

describe("chargeCardOnFile — happy path", () => {
  it("creates invoice, finalizes, inserts row, pays, returns ok", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: null, error: null },
      { data: null, error: null }, // insert succeeds
    ]);
    const result = await chargeCardOnFile(JOB_ID);
    expect(result).toEqual({
      ok: true,
      data: { invoiceId: STRIPE_INVOICE_ID, amountDollars: 74.38 },
    });
    expect(stripeMock.invoices.create).toHaveBeenCalledTimes(1);
    expect(stripeMock.invoices.finalizeInvoice).toHaveBeenCalledTimes(1);
    expect(stripeMock.invoices.pay).toHaveBeenCalledTimes(1);
    expect(stripeMock.invoices.voidInvoice).not.toHaveBeenCalled();
  });

  it("uses an idempotency key on invoice.create that includes the jobId", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    await chargeCardOnFile(JOB_ID);
    const createCall = stripeMock.invoices.create.mock.calls[0];
    // Second arg is the request options; expect idempotencyKey to include jobId
    expect(createCall[1]).toMatchObject({
      idempotencyKey: expect.stringContaining(JOB_ID),
    });
  });

  it("uses a different idempotency key on invoice.pay", async () => {
    mockSupabase([
      { data: buildJobRow(), error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    await chargeCardOnFile(JOB_ID);
    const payCall = stripeMock.invoices.pay.mock.calls[0];
    // Third arg is options; should have its own idempotencyKey distinct from create's
    expect(payCall[2]).toMatchObject({
      idempotencyKey: expect.stringContaining("-pay"),
    });
  });
});
