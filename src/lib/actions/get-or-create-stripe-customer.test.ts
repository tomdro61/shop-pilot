/**
 * Tests for getOrCreateStripeCustomer — the Stripe customer path shared by
 * parking invoices and card-on-file setup. payment-methods.test.ts mocks this
 * function away, so nothing else exercises the sync → create → save chain.
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
import * as Sentry from "@sentry/nextjs";
import { getOrCreateStripeCustomer } from "./invoices";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";
const STRIPE_CUSTOMER_ID = "cus_test123";

function buildCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    first_name: "Mike",
    last_name: "Rivera",
    email: "mike@example.com",
    phone: "+15551234567",
    stripe_customer_id: STRIPE_CUSTOMER_ID,
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

type CustomersMock = {
  retrieve: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function mockStripe(customers: Partial<CustomersMock>): CustomersMock {
  const full: CustomersMock = {
    retrieve: vi.fn().mockResolvedValue({
      id: STRIPE_CUSTOMER_ID,
      name: "Mike Rivera",
      email: "mike@example.com",
      phone: "+15551234567",
    }),
    update: vi.fn().mockResolvedValue({ id: STRIPE_CUSTOMER_ID }),
    create: vi.fn().mockResolvedValue({ id: "cus_fresh" }),
    ...customers,
  };
  vi.mocked(getStripe).mockReturnValue({ customers: full } as unknown as ReturnType<typeof getStripe>);
  return full;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true } as Awaited<
    ReturnType<typeof requireManager>
  >);
});

describe("getOrCreateStripeCustomer — gates", () => {
  it("requires a manager before touching Stripe", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Not authorized" } as Awaited<
      ReturnType<typeof requireManager>
    >);
    const customers = mockStripe({});
    mockSupabase([{ data: buildCustomer(), error: null }]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ error: "Not authorized" });
    expect(customers.retrieve).not.toHaveBeenCalled();
    expect(customers.create).not.toHaveBeenCalled();
  });

  it("looks up exactly this customer and refuses when it is not found", async () => {
    const customers = mockStripe({});
    const mock = mockSupabase([{ data: null, error: { code: "PGRST116", message: "no rows" } }]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ error: "Customer not found" });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", CUSTOMER_ID] });
    expect(customers.create).not.toHaveBeenCalled();
  });
});

describe("getOrCreateStripeCustomer — existing Stripe customer", () => {
  it("syncs a locally-added email onto the Stripe customer and returns the same id", async () => {
    const customers = mockStripe({
      retrieve: vi.fn().mockResolvedValue({
        id: STRIPE_CUSTOMER_ID,
        name: "Mike Rivera",
        email: null,
        phone: "+15551234567",
      }),
    });
    const mock = mockSupabase([{ data: buildCustomer(), error: null }]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ data: STRIPE_CUSTOMER_ID });
    expect(customers.retrieve).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID);
    expect(customers.update).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID, { email: "mike@example.com" });
    expect(customers.create).not.toHaveBeenCalled();
    expect(mock.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });

  it("returns the sync error and does not create a duplicate when the sync fails", async () => {
    const customers = mockStripe({
      retrieve: vi.fn().mockResolvedValue({ id: STRIPE_CUSTOMER_ID, name: "Mike Rivera", email: null, phone: null }),
      update: vi.fn().mockRejectedValue(new Error("rate limited")),
    });
    mockSupabase([{ data: buildCustomer(), error: null }]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({
      error: "Couldn't update the customer's contact info in Stripe: rate limited",
    });
    expect(customers.create).not.toHaveBeenCalled();
  });

  it("surfaces a Stripe outage on retrieve rather than creating a duplicate", async () => {
    const customers = mockStripe({
      retrieve: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("Stripe is down"), { code: "api_error" })),
    });
    mockSupabase([{ data: buildCustomer(), error: null }]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ error: "Couldn't verify the customer in Stripe: Stripe is down" });
    expect(customers.create).not.toHaveBeenCalled();
  });
});

describe("getOrCreateStripeCustomer — creating", () => {
  it("creates a Stripe customer for a record that has none and saves the id on that record", async () => {
    const customers = mockStripe({});
    const mock = mockSupabase([
      { data: buildCustomer({ stripe_customer_id: null }), error: null },
      { data: null, error: null },
    ]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ data: "cus_fresh" });
    expect(customers.retrieve).not.toHaveBeenCalled();
    expect(customers.create).toHaveBeenCalledWith({
      name: "Mike Rivera",
      email: "mike@example.com",
      phone: "+15551234567",
      metadata: { supabase_customer_id: CUSTOMER_ID },
    });
    // The select above also calls .eq("id", …), so assert the predicate that
    // follows the update specifically: without it the write hits every row.
    const updateIdx = mock.calls.findIndex((c) => c.method === "update");
    expect(mock.calls[updateIdx]).toEqual({
      method: "update",
      args: [{ stripe_customer_id: "cus_fresh" }],
    });
    expect(mock.calls[updateIdx + 1]).toEqual({ method: "eq", args: ["id", CUSTOMER_ID] });
  });

  it("replaces a deleted Stripe customer with a fresh one", async () => {
    const customers = mockStripe({
      retrieve: vi.fn().mockResolvedValue({ id: STRIPE_CUSTOMER_ID, deleted: true }),
    });
    mockSupabase([
      { data: buildCustomer(), error: null },
      { data: null, error: null },
    ]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ data: "cus_fresh" });
    expect(customers.update).not.toHaveBeenCalled();
    expect(customers.create).toHaveBeenCalledTimes(1);
  });

  it("returns an error, not a throw, when the Stripe create fails", async () => {
    mockStripe({ create: vi.fn().mockRejectedValue(new Error("Invalid API key")) });
    const mock = mockSupabase([{ data: buildCustomer({ stripe_customer_id: null }), error: null }]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ error: "Couldn't create the customer in Stripe: Invalid API key" });
    expect(mock.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });

  it("reports an orphaned Stripe customer to Sentry when the local save fails", async () => {
    mockStripe({});
    mockSupabase([
      { data: buildCustomer({ stripe_customer_id: null }), error: null },
      { data: null, error: { message: "statement timeout" } },
    ]);

    const r = await getOrCreateStripeCustomer(CUSTOMER_ID);

    expect(r).toEqual({ error: "Failed to save Stripe customer ID" });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "statement timeout" }),
      expect.objectContaining({
        tags: expect.objectContaining({ source: "stripe-customer-create" }),
        extra: { customerId: CUSTOMER_ID, stripeCustomerId: "cus_fresh" },
      })
    );
  });
});
