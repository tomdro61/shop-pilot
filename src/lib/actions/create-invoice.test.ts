/**
 * Tests for createInvoiceFromJob — the "Create & Send" path.
 *
 * This function had no test file at all, which mattered more than it looks: it
 * is exposed to the AI assistant as `create_invoice_from_job`, so its guards are
 * the only thing standing between a mis-parsed chat request and a real Stripe
 * invoice. Mutation testing found eight surviving mutants here, including both
 * guards added to stop it billing a customer who had already paid in cash.
 *
 * Every refusal case queues a HEALTHY path behind the guard under test, so
 * deleting that guard reaches Stripe rather than refusing downstream for an
 * unrelated reason — and asserts the SPECIFIC message. Asserting only "an error
 * came back" is what let the same class of bug survive in the resend tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stripe/create-invoice", () => ({
  createStripeInvoice: vi.fn(),
  createParkingStripeInvoice: vi.fn(),
}));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/actions/messages", () => ({ sendCustomerSMS: vi.fn() }));
vi.mock("@/lib/actions/email", () => ({ sendCustomerEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createStripeInvoice } from "@/lib/stripe/create-invoice";
import { getShopSettings } from "@/lib/actions/settings";
import * as Sentry from "@sentry/nextjs";
import { createInvoiceFromJob } from "./invoices";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const STRIPE_CUSTOMER_ID = "cus_test123";

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    title: "Front brakes",
    status: "complete",
    payment_status: "unpaid",
    charge_sales_tax: true,
    customers: {
      id: CUSTOMER_ID,
      first_name: "Mike",
      last_name: "Rivera",
      email: "mike@example.com",
      phone: "+15551234567",
      stripe_customer_id: STRIPE_CUSTOMER_ID,
      customer_type: "retail",
    },
    vehicles: { year: 2019, make: "Honda", model: "Civic" },
    job_line_items: [
      { type: "labor", description: "Brake labor", quantity: 1, unit_cost: 200, category: "Brakes" },
    ],
    ...overrides,
  };
}

/** job → no existing invoice → insert. Queued behind every guard under test. */
function healthyQueue(job = buildJob()): SupabaseMockResult[] {
  return [
    { data: job, error: null },
    { data: null, error: null },
    { data: { id: "inv-1" }, error: null },
  ];
}

function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true } as Awaited<
    ReturnType<typeof requireManager>
  >);
  vi.mocked(getShopSettings).mockResolvedValue({} as Awaited<ReturnType<typeof getShopSettings>>);
  vi.mocked(getStripe).mockReturnValue({
    customers: {
      retrieve: vi.fn().mockResolvedValue({ id: STRIPE_CUSTOMER_ID }),
      create: vi.fn().mockResolvedValue({ id: STRIPE_CUSTOMER_ID }),
    },
  } as unknown as ReturnType<typeof getStripe>);
  vi.mocked(createStripeInvoice).mockResolvedValue({
    stripeInvoiceId: "in_test",
    hostedInvoiceUrl: "https://invoice.stripe.com/i/test",
    amountDue: 20000,
  });
});

describe("createInvoiceFromJob — auth", () => {
  it("requires a manager", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Not authorized" } as Awaited<
      ReturnType<typeof requireManager>
    >);

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toBe("Not authorized");
    expect(createStripeInvoice).not.toHaveBeenCalled();
  });
});

describe("createInvoiceFromJob — refuses to bill a settled job", () => {
  // The incident this exists to prevent: recordPayment updates `jobs` only, so a
  // cash-paid job still looks billable to this function. Without these guards,
  // "Create & Send" mints an invoice and texts a live payment link to someone
  // who already paid at the counter.
  it.each([
    ["paid", /already marked paid/],
    ["waived", /waived/],
  ])("refuses a %s job without touching Stripe", async (status, expected) => {
    mockSupabase(healthyQueue(buildJob({ payment_status: status })));

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toMatch(expected);
    expect(createStripeInvoice).not.toHaveBeenCalled();
  });

  it("still bills an 'invoiced' job — billed, but still owed", async () => {
    mockSupabase(healthyQueue(buildJob({ payment_status: "invoiced" })));

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toBeUndefined();
    expect(createStripeInvoice).toHaveBeenCalled();
  });
});

describe("createInvoiceFromJob — fleet", () => {
  it("refuses a fleet customer, which the UI-only convention never enforced", async () => {
    // Reachable via the AI tool `create_invoice_from_job`, which bypasses the
    // hidden Create card entirely.
    const job = buildJob();
    (job.customers as Record<string, unknown>).customer_type = "fleet";
    mockSupabase(healthyQueue(job));

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toMatch(/[Ff]leet/);
    expect(createStripeInvoice).not.toHaveBeenCalled();
  });

  it("bills a retail customer normally", async () => {
    mockSupabase(healthyQueue());

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toBeUndefined();
    expect(createStripeInvoice).toHaveBeenCalled();
  });
});

describe("createInvoiceFromJob — duplicate protection", () => {
  it("refuses when an invoice already exists", async () => {
    mockSupabase([
      { data: buildJob(), error: null },
      { data: { id: "inv-existing" }, error: null },
    ]);

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toMatch(/already exists/);
    expect(createStripeInvoice).not.toHaveBeenCalled();
  });

  it("refuses when the existing-invoice check itself fails, rather than double-billing", async () => {
    // A failed check leaves existingInvoice null, so without this the guard
    // passes and the customer is billed twice.
    mockSupabase([
      { data: buildJob(), error: null },
      { data: null, error: { message: "statement timeout" } },
    ]);

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toMatch(/Could not check/);
    expect(createStripeInvoice).not.toHaveBeenCalled();
  });
});

describe("createInvoiceFromJob — job state", () => {
  it("refuses a job that isn't complete", async () => {
    mockSupabase(healthyQueue(buildJob({ status: "in_progress" })));

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toMatch(/must be complete/);
    expect(createStripeInvoice).not.toHaveBeenCalled();
  });

  it("refuses a job with no line items", async () => {
    mockSupabase(healthyQueue(buildJob({ job_line_items: [] })));

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toMatch(/no line items/);
    expect(createStripeInvoice).not.toHaveBeenCalled();
  });

  it("reports a lookup outage as an outage, not as 'Job not found'", async () => {
    // The AI tool surfaces this string to the manager. "Job not found" for a
    // statement timeout tells them their job was deleted.
    mockSupabase([{ data: null, error: { message: "statement timeout" } }]);

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toMatch(/Couldn't load/);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("still reports a genuinely missing job as not found, with no alert", async () => {
    mockSupabase([{ data: null, error: { code: "PGRST116", message: "no rows" } }]);

    const r = await createInvoiceFromJob(JOB_ID);

    expect(r.error).toBe("Job not found");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
