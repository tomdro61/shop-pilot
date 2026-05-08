/**
 * Tests for payment-methods.ts — saved-card lifecycle (read, save, remove).
 * Covers auth gates, getPaymentMethod degradation, and removePaymentMethod
 * partial-failure observability.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/actions/invoices", () => ({
  getOrCreateStripeCustomer: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/actions/invoices";
import * as Sentry from "@sentry/nextjs";
import {
  getPaymentMethod,
  createSetupIntent,
  setDefaultPaymentMethod,
  removePaymentMethod,
} from "./payment-methods";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const STRIPE_CUSTOMER_ID = "cus_test123";
const STRIPE_PM_ID = "pm_test123";

interface MockStripe {
  customers: {
    retrieve: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  setupIntents: {
    create: ReturnType<typeof vi.fn>;
  };
  paymentMethods: {
    retrieve: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
  };
}

let stripeMock: MockStripe;

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
  vi.mocked(getOrCreateStripeCustomer).mockResolvedValue({ data: STRIPE_CUSTOMER_ID });

  stripeMock = {
    customers: {
      retrieve: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    setupIntents: {
      create: vi.fn().mockResolvedValue({ client_secret: "seti_secret_abc" }),
    },
    paymentMethods: {
      retrieve: vi.fn(),
      attach: vi.fn().mockResolvedValue({}),
      detach: vi.fn().mockResolvedValue({}),
    },
  };
  vi.mocked(getStripe).mockReturnValue(stripeMock as unknown as ReturnType<typeof getStripe>);
});

// ─── getPaymentMethod ─────────────────────────────────────────────

describe("getPaymentMethod — graceful degradation", () => {
  it("returns ok+null when customer row not found in DB (no error from .single())", async () => {
    mockSupabase([{ data: null, error: null }]);
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: null });
    expect(stripeMock.customers.retrieve).not.toHaveBeenCalled();
  });

  it("returns ok+null when customer has no stripe_customer_id", async () => {
    mockSupabase([{ data: { stripe_customer_id: null }, error: null }]);
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: null });
    expect(stripeMock.customers.retrieve).not.toHaveBeenCalled();
  });

  it("returns ok=false on DB error (distinguishes 'no card' from 'query failed')", async () => {
    mockSupabase([{ data: null, error: { message: "connection refused" } }]);
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Could not load customer");
  });

  it("returns ok+null when Stripe customer is deleted", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      deleted: true,
    });
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: null });
  });

  it("returns ok+null when no default payment method is set", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: null },
    });
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: null });
  });

  it("returns ok+null when default_payment_method is an unexpanded string id", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: STRIPE_PM_ID },
    });
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: null });
  });

  it("returns ok+null when PM has no card data (e.g., us_bank_account)", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: { id: STRIPE_PM_ID, card: null } },
    });
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: null });
  });

  it("returns the saved card on the happy path", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: {
        default_payment_method: {
          id: STRIPE_PM_ID,
          card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
        },
      },
    });
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({
      ok: true,
      data: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
    });
  });

  it("returns ok+null on Stripe `resource_missing` error (treat as 'no card', not 'failure')", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    const stripeErr = Object.assign(new Error("No such customer"), { code: "resource_missing" });
    stripeMock.customers.retrieve.mockRejectedValueOnce(stripeErr);
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: null });
  });

  it("returns ok=false on other Stripe errors (so UI can surface 'Stripe down')", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockRejectedValueOnce(new Error("Network timeout"));
    const result = await getPaymentMethod(CUSTOMER_ID);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Network timeout");
  });
});

// ─── createSetupIntent ─────────────────────────────────────────────

describe("createSetupIntent — auth + flow", () => {
  it("returns auth error when caller is not a manager", async () => {
    vi.mocked(requireManager).mockResolvedValueOnce({ ok: false, error: "Forbidden" });
    const result = await createSetupIntent(CUSTOMER_ID);
    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(stripeMock.setupIntents.create).not.toHaveBeenCalled();
  });

  it("creates a SetupIntent with off_session usage and returns the client_secret", async () => {
    const result = await createSetupIntent(CUSTOMER_ID);
    expect(result).toEqual({ ok: true, data: { clientSecret: "seti_secret_abc" } });
    expect(stripeMock.setupIntents.create).toHaveBeenCalledWith({
      customer: STRIPE_CUSTOMER_ID,
      usage: "off_session",
      payment_method_types: ["card"],
    });
  });

  it("returns error when Stripe omits client_secret", async () => {
    stripeMock.setupIntents.create.mockResolvedValueOnce({ client_secret: null });
    const result = await createSetupIntent(CUSTOMER_ID);
    expect(result).toEqual({ ok: false, error: "Stripe did not return a client secret" });
  });
});

// ─── setDefaultPaymentMethod ───────────────────────────────────────

describe("setDefaultPaymentMethod — auth + structural PM check", () => {
  it("returns auth error when caller is not a manager", async () => {
    vi.mocked(requireManager).mockResolvedValueOnce({ ok: false, error: "Forbidden" });
    const result = await setDefaultPaymentMethod(CUSTOMER_ID, STRIPE_PM_ID);
    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(stripeMock.paymentMethods.retrieve).not.toHaveBeenCalled();
  });

  it("rejects PM that belongs to a different customer", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.paymentMethods.retrieve.mockResolvedValueOnce({
      id: STRIPE_PM_ID,
      customer: "cus_someone_else",
    });
    const result = await setDefaultPaymentMethod(CUSTOMER_ID, STRIPE_PM_ID);
    expect(result).toEqual({ ok: false, error: "Payment method belongs to another customer" });
    expect(stripeMock.customers.update).not.toHaveBeenCalled();
  });

  it("attaches the PM if it is unattached, then sets as default", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.paymentMethods.retrieve.mockResolvedValueOnce({
      id: STRIPE_PM_ID,
      customer: null,
    });
    const result = await setDefaultPaymentMethod(CUSTOMER_ID, STRIPE_PM_ID);
    expect(result).toEqual({ ok: true });
    expect(stripeMock.paymentMethods.attach).toHaveBeenCalledWith(STRIPE_PM_ID, {
      customer: STRIPE_CUSTOMER_ID,
    });
    expect(stripeMock.customers.update).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID, {
      invoice_settings: { default_payment_method: STRIPE_PM_ID },
    });
  });

  it("skips attach when PM is already on this customer (happy path)", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.paymentMethods.retrieve.mockResolvedValueOnce({
      id: STRIPE_PM_ID,
      customer: STRIPE_CUSTOMER_ID,
    });
    const result = await setDefaultPaymentMethod(CUSTOMER_ID, STRIPE_PM_ID);
    expect(result).toEqual({ ok: true });
    expect(stripeMock.paymentMethods.attach).not.toHaveBeenCalled();
    expect(stripeMock.customers.update).toHaveBeenCalled();
  });
});

// ─── removePaymentMethod ───────────────────────────────────────────

describe("removePaymentMethod — auth + partial-failure observability", () => {
  it("returns auth error when caller is not a manager", async () => {
    vi.mocked(requireManager).mockResolvedValueOnce({ ok: false, error: "Forbidden" });
    const result = await removePaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(stripeMock.customers.update).not.toHaveBeenCalled();
    expect(stripeMock.paymentMethods.detach).not.toHaveBeenCalled();
  });

  it("returns ok when no default PM is set (idempotent no-op)", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: null },
    });
    const result = await removePaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true });
    expect(stripeMock.paymentMethods.detach).not.toHaveBeenCalled();
  });

  it("clears default first, then detaches (correct order)", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: STRIPE_PM_ID },
    });

    const callOrder: string[] = [];
    stripeMock.customers.update.mockImplementationOnce(async () => {
      callOrder.push("update");
      return {};
    });
    stripeMock.paymentMethods.detach.mockImplementationOnce(async () => {
      callOrder.push("detach");
      return {};
    });

    const result = await removePaymentMethod(CUSTOMER_ID);
    expect(result).toEqual({ ok: true });
    expect(callOrder).toEqual(["update", "detach"]);
    // Empty string is the documented Stripe API value for clearing the default
    expect(stripeMock.customers.update).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID, {
      invoice_settings: { default_payment_method: "" },
    });
  });

  it("captures Sentry with defaultClearedBeforeFailure=false when update throws", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: STRIPE_PM_ID },
    });
    stripeMock.customers.update.mockRejectedValueOnce(new Error("Update failed"));

    const result = await removePaymentMethod(CUSTOMER_ID);
    expect(result.ok).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ defaultClearedBeforeFailure: false }),
      })
    );
    // Detach should never have run because update threw first
    expect(stripeMock.paymentMethods.detach).not.toHaveBeenCalled();
  });

  it("captures Sentry with defaultClearedBeforeFailure=true when detach throws after update succeeds", async () => {
    mockSupabase([{ data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null }]);
    stripeMock.customers.retrieve.mockResolvedValueOnce({
      id: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: STRIPE_PM_ID },
    });
    stripeMock.paymentMethods.detach.mockRejectedValueOnce(new Error("Detach failed"));

    const result = await removePaymentMethod(CUSTOMER_ID);
    expect(result.ok).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ defaultClearedBeforeFailure: true }),
      })
    );
  });
});
