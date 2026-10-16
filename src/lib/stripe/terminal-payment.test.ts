/**
 * Tests for recordTerminalPayment — flips a job to paid after a card-reader
 * charge succeeded, from either the status poll or the webhook.
 *
 * The shape to protect: the flip happens once, with the collected amount and
 * the tax figures frozen onto the job, and a job already paid some other way is
 * never overwritten. Most refusal tests assert the outcome AND that no UPDATE
 * was issued.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/invoices/void-open-invoice", () => ({ voidOpenInvoiceForJob: vi.fn() }));
vi.mock("@/lib/messaging/notify-owners", () => ({ notifyOwners: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { voidOpenInvoiceForJob } from "@/lib/invoices/void-open-invoice";
import { notifyOwners } from "@/lib/messaging/notify-owners";
import { recordTerminalPayment } from "./terminal-payment";
import {
  createSupabaseMock,
  type SupabaseMockResult,
} from "@/lib/actions/__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const PI_ID = "pi_reader123";
const OTHER_PI_ID = "pi_other456";
const SOURCE = "terminal-status" as const;
const NOW = new Date("2026-10-15T18:00:00.000Z");
// One $100 part at 6.25% = $106.25.
const AMOUNT_CENTS = 10625;

const JOB_SELECT =
  "id, ro_number, payment_status, payment_method, stripe_payment_intent_id, charge_sales_tax, job_line_items(type, quantity, unit_cost, total, category)";

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    ro_number: 42,
    payment_status: "unpaid",
    payment_method: null,
    stripe_payment_intent_id: PI_ID,
    charge_sales_tax: true,
    job_line_items: [{ type: "part", quantity: 1, unit_cost: 100, total: 100, category: "Brakes" }],
    ...overrides,
  };
}

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
};

/** Query order: job, shop_settings, job update (returning). */
function queue(
  job: Record<string, unknown> | null = buildJob(),
  settings: SupabaseMockResult = { data: SETTINGS, error: null },
  update: SupabaseMockResult = { data: { id: JOB_ID }, error: null },
): SupabaseMockResult[] {
  return [{ data: job, error: null }, settings, update];
}

function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createAdminClient).mockReturnValue(
    mock.client as unknown as ReturnType<typeof createAdminClient>,
  );
  return mock;
}

type Mock = ReturnType<typeof mockSupabase>;
const updated = (mock: Mock) => mock.calls.find((c) => c.method === "update");
const tables = (mock: Mock) =>
  mock.calls.filter((c) => c.method === "from").map((c) => c.args[0]);
const callsAfter = (mock: Mock, method: string, arg?: unknown) => {
  const idx = mock.calls.findIndex(
    (c) => c.method === method && (arg === undefined || c.args[0] === arg),
  );
  return idx === -1 ? [] : mock.calls.slice(idx + 1);
};

const record = (
  amountCents = AMOUNT_CENTS,
  source: "terminal-status" | "stripe-webhook" = SOURCE,
) => recordTerminalPayment({ paymentIntentId: PI_ID, amountCents, jobId: JOB_ID, source });

const WEBHOOK = "stripe-webhook" as const;

const REREAD = [
  { method: "from", args: ["jobs"] },
  { method: "select", args: ["ro_number, payment_method, stripe_payment_intent_id"] },
  { method: "eq", args: ["id", JOB_ID] },
  { method: "maybeSingle", args: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(voidOpenInvoiceForJob).mockResolvedValue({
    ok: true,
    voided: false,
    stripeInvoiceId: null,
  });
  vi.mocked(notifyOwners).mockResolvedValue(1);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordTerminalPayment — recording", () => {
  it("flips the job to paid with the collected amount and tax snapshot", async () => {
    const mock = mockSupabase(queue());

    expect(await record()).toEqual({ ok: true, outcome: "recorded" });
    expect(updated(mock)?.args[0]).toEqual({
      payment_status: "paid",
      payment_method: "terminal",
      stripe_payment_intent_id: PI_ID,
      paid_at: NOW.toISOString(),
      amount_collected: 106.25,
      taxable_collected: 100,
      tax_collected: 6.25,
      tax_rate_applied: 0.0625,
    });
  });

  it("pins the update to this job, and only while it is not paid", async () => {
    const mock = mockSupabase(queue());

    await record();

    expect(callsAfter(mock, "update").slice(0, 4)).toEqual([
      { method: "eq", args: ["id", JOB_ID] },
      { method: "neq", args: ["payment_status", "paid"] },
      { method: "select", args: ["id"] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("reads this job with every column a branch depends on", async () => {
    const mock = mockSupabase(queue());

    await record();

    expect(mock.calls.slice(0, 4)).toEqual([
      { method: "from", args: ["jobs"] },
      { method: "select", args: [JOB_SELECT] },
      { method: "eq", args: ["id", JOB_ID] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("reads the shop's tax settings", async () => {
    const mock = mockSupabase(queue());

    await record();

    expect(callsAfter(mock, "from", "shop_settings").slice(0, 3)).toEqual([
      { method: "select", args: ["*"] },
      { method: "limit", args: [1] },
      { method: "single", args: [] },
    ]);
    expect(tables(mock)).toEqual(["jobs", "shop_settings", "jobs"]);
  });

  it("keeps Stripe's amount, and leaves the tax figures null, when it differs from the current lines", async () => {
    const mock = mockSupabase(queue());

    expect(await record(9999)).toEqual({ ok: true, outcome: "recorded" });

    expect(updated(mock)?.args[0]).toEqual({
      payment_status: "paid",
      payment_method: "terminal",
      stripe_payment_intent_id: PI_ID,
      paid_at: NOW.toISOString(),
      amount_collected: 99.99,
      taxable_collected: null,
      tax_collected: null,
      tax_rate_applied: null,
    });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "terminal_payment_amount_mismatch",
      expect.objectContaining({
        level: "error",
        extra: expect.objectContaining({ amountCents: 9999, computedCents: 10625 }),
      }),
    );
  });

  it("records no tax on a job that doesn't charge sales tax", async () => {
    const mock = mockSupabase(queue(buildJob({ charge_sales_tax: false })));

    await record(10000);

    expect(updated(mock)?.args[0]).toMatchObject({
      amount_collected: 100,
      taxable_collected: 0,
      tax_collected: 0,
    });
  });

  it("closes this job's open invoice after the flip, with the same client", async () => {
    const mock = mockSupabase(queue());

    await record();

    expect(voidOpenInvoiceForJob).toHaveBeenCalledTimes(1);
    expect(voidOpenInvoiceForJob).toHaveBeenCalledWith(mock.client, JOB_ID, SOURCE);
    const updateSpy = mock.builder.update as ReturnType<typeof vi.fn>;
    expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(voidOpenInvoiceForJob).mock.invocationCallOrder[0],
    );
    expect(notifyOwners).not.toHaveBeenCalled();
  });

  it("still records, and alerts the owners, when the open invoice can't be closed", async () => {
    mockSupabase(queue());
    vi.mocked(voidOpenInvoiceForJob).mockResolvedValue({
      ok: false,
      reason: "transient",
      error: "Couldn't reach Stripe",
      stripeInvoiceId: "in_open1",
    });

    expect(await record()).toEqual({ ok: true, outcome: "recorded" });
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(notifyOwners).toHaveBeenCalledWith(expect.stringContaining("RO-0042"), SOURCE);
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("could not be voided");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "terminal_payment_open_invoice_not_closed",
      expect.objectContaining({
        extra: expect.objectContaining({ reason: "transient", stripeInvoiceId: "in_open1" }),
      }),
    );
  });

  it("texts the 'could not be voided' alert when Stripe refused the void", async () => {
    mockSupabase(queue());
    vi.mocked(voidOpenInvoiceForJob).mockResolvedValue({
      ok: false,
      reason: "stripe-refused",
      error: "Stripe wouldn't close it",
      stripeInvoiceId: "in_open1",
    });

    expect(await record()).toEqual({ ok: true, outcome: "recorded" });
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("could not be voided");
    expect(vi.mocked(notifyOwners).mock.calls[0][0]).not.toContain("DOUBLE PAYMENT");
  });

  it("texts a double-payment alert when the open invoice turned out to be paid online", async () => {
    mockSupabase(queue());
    vi.mocked(voidOpenInvoiceForJob).mockResolvedValue({
      ok: false,
      reason: "stripe-paid",
      error: "paid online",
      stripeInvoiceId: "in_paid1",
    });

    expect(await record()).toEqual({ ok: true, outcome: "recorded" });
    expect(notifyOwners).toHaveBeenCalledTimes(1);
    expect(notifyOwners).toHaveBeenCalledWith(expect.stringContaining("DOUBLE PAYMENT"), SOURCE);
    const text = vi.mocked(notifyOwners).mock.calls[0][0];
    expect(text).toContain("RO-0042");
    expect(text).toContain("$106.25");
    expect(text).toContain("stripe invoice");
    expect(text).not.toContain("could not be voided");
  });

  it("sends no text when the invoice void failed on the database", async () => {
    mockSupabase(queue());
    vi.mocked(voidOpenInvoiceForJob).mockResolvedValue({
      ok: false,
      reason: "db",
      error: "Couldn't check this job's invoice",
      stripeInvoiceId: null,
    });

    expect(await record()).toEqual({ ok: true, outcome: "recorded" });
    expect(notifyOwners).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "terminal_payment_open_invoice_not_closed",
      expect.objectContaining({ extra: expect.objectContaining({ reason: "db" }) }),
    );
  });
});

describe("recordTerminalPayment — a settings failure", () => {
  it("still records the amount and leaves the tax figures null", async () => {
    const mock = mockSupabase(queue(buildJob(), { data: null, error: { message: "settings down" } }));

    expect(await record()).toEqual({ ok: true, outcome: "recorded" });
    expect(updated(mock)?.args[0]).toMatchObject({
      payment_status: "paid",
      amount_collected: 106.25,
      taxable_collected: null,
      tax_collected: null,
      tax_rate_applied: null,
    });
    expect(callsAfter(mock, "update")[0]).toEqual({ method: "eq", args: ["id", JOB_ID] });
    expect(voidOpenInvoiceForJob).toHaveBeenCalledWith(mock.client, JOB_ID, SOURCE);
  });

  it("treats a missing settings row the same way", async () => {
    const mock = mockSupabase(queue(buildJob(), { data: null, error: null }));

    await record();

    expect(updated(mock)?.args[0]).toMatchObject({
      amount_collected: 106.25,
      tax_collected: null,
    });
  });
});

describe("recordTerminalPayment — a job that is already paid", () => {
  it("reports already-recorded for the same PaymentIntent, and issues no update", async () => {
    const mock = mockSupabase(
      queue(buildJob({ payment_status: "paid", payment_method: "terminal", stripe_payment_intent_id: PI_ID })),
    );

    expect(await record()).toEqual({ ok: true, outcome: "already-recorded" });
    expect(updated(mock)).toBeUndefined();
    expect(tables(mock)).toEqual(["jobs"]);
    expect(notifyOwners).not.toHaveBeenCalled();
    expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
  });

  const priorPayments: [string, Record<string, unknown>][] = [
    ["cash, with no PaymentIntent", { payment_method: "cash", stripe_payment_intent_id: null }],
    // /api/terminal/pay stores the PI before money moves, so a cash record taken
    // while the reader was armed carries this charge's id too.
    ["cash, carrying this same PaymentIntent", { payment_method: "cash", stripe_payment_intent_id: PI_ID }],
    ["the reader, on another PaymentIntent", { payment_method: "terminal", stripe_payment_intent_id: OTHER_PI_ID }],
  ];

  it.each(priorPayments)(
    "reports a double collection, and texts the owners from the webhook, when it was paid by %s",
    async (_label, prior) => {
      const mock = mockSupabase(queue(buildJob({ payment_status: "paid", ...prior })));

      expect(await record(AMOUNT_CENTS, WEBHOOK)).toEqual({ ok: true, outcome: "double-collection" });
      expect(updated(mock)).toBeUndefined();
      expect(tables(mock)).toEqual(["jobs"]);
      expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
      expect(notifyOwners).toHaveBeenCalledTimes(1);
      expect(notifyOwners).toHaveBeenCalledWith(expect.stringContaining("DOUBLE PAYMENT"), WEBHOOK);
      expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("$106.25");
      expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("RO-0042");
      expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain(String(prior.payment_method));
    },
  );

  it.each(priorPayments)(
    "reports a double collection from the status poll without texting, when it was paid by %s",
    async (_label, prior) => {
      const mock = mockSupabase(queue(buildJob({ payment_status: "paid", ...prior })));

      expect(await record(AMOUNT_CENTS, "terminal-status")).toEqual({
        ok: true,
        outcome: "double-collection",
      });
      expect(updated(mock)).toBeUndefined();
      expect(notifyOwners).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "terminal_payment_double_collection",
        expect.objectContaining({ level: "error" }),
      );
    },
  );
});

describe("recordTerminalPayment — failures", () => {
  it("reports a missing job without writing", async () => {
    const mock = mockSupabase(queue(null));

    expect(await record()).toEqual({ ok: true, outcome: "missing-job" });
    expect(updated(mock)).toBeUndefined();
    expect(tables(mock)).toEqual(["jobs"]);
  });

  it("surfaces a failed job read without writing", async () => {
    const mock = mockSupabase([{ data: null, error: { message: "jobs down" } }]);

    expect(await record()).toEqual({ ok: false, error: "jobs down" });
    expect(updated(mock)).toBeUndefined();
  });

  it("surfaces a failed update and does not close the invoice", async () => {
    mockSupabase(queue(buildJob(), undefined, { data: null, error: { message: "write failed" } }));

    expect(await record()).toEqual({ ok: false, error: "write failed" });
    expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
  });

  it("reports already-recorded when the other caller flipped it first", async () => {
    const mock = mockSupabase([
      ...queue(buildJob(), undefined, { data: null, error: null }),
      {
        data: { ro_number: 42, payment_method: "terminal", stripe_payment_intent_id: PI_ID },
        error: null,
      },
    ]);

    expect(await record(AMOUNT_CENTS, WEBHOOK)).toEqual({ ok: true, outcome: "already-recorded" });
    expect(callsAfter(mock, "update").slice(4, 8)).toEqual(REREAD);
    expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
    expect(notifyOwners).not.toHaveBeenCalled();
  });

  it.each([
    ["cash, carrying this same PaymentIntent", { payment_method: "cash", stripe_payment_intent_id: PI_ID }],
    ["the reader, on another PaymentIntent", { payment_method: "terminal", stripe_payment_intent_id: OTHER_PI_ID }],
  ])(
    "reports a double collection when the race was won by %s, texting from the webhook",
    async (_label, winner) => {
      const mock = mockSupabase([
        ...queue(buildJob(), undefined, { data: null, error: null }),
        { data: { ro_number: 42, ...winner }, error: null },
      ]);

      expect(await record(AMOUNT_CENTS, WEBHOOK)).toEqual({ ok: true, outcome: "double-collection" });
      expect(callsAfter(mock, "update").slice(4, 8)).toEqual(REREAD);
      expect(voidOpenInvoiceForJob).not.toHaveBeenCalled();
      expect(notifyOwners).toHaveBeenCalledTimes(1);
      expect(notifyOwners).toHaveBeenCalledWith(expect.stringContaining("DOUBLE PAYMENT"), WEBHOOK);
      expect(vi.mocked(notifyOwners).mock.calls[0][0]).toContain("RO-0042");
    },
  );

  it("reports a double collection when a cash record won the race, without texting from the status poll", async () => {
    mockSupabase([
      ...queue(buildJob(), undefined, { data: null, error: null }),
      { data: { ro_number: 42, payment_method: "cash", stripe_payment_intent_id: PI_ID }, error: null },
    ]);

    expect(await record(AMOUNT_CENTS, "terminal-status")).toEqual({
      ok: true,
      outcome: "double-collection",
    });
    expect(notifyOwners).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "terminal_payment_double_collection",
      expect.objectContaining({ tags: expect.objectContaining({ path: "terminal-payment-double-collection-race" }) }),
    );
  });
});
