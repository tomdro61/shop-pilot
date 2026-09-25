import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { createStripeCustomer, syncStripeCustomer } from "./customer-sync";

const STRIPE_CUSTOMER_ID = "cus_test123";
const LOCAL = {
  id: "22222222-2222-4222-9222-222222222222",
  first_name: "Mike",
  last_name: "Rivera",
  email: "mike@example.com",
  phone: "+15551234567",
};

function buildStripe(remote: Record<string, unknown> | Error, updateResult?: Error) {
  const retrieve = vi.fn();
  if (remote instanceof Error) retrieve.mockRejectedValue(remote);
  else retrieve.mockResolvedValue({ id: STRIPE_CUSTOMER_ID, ...remote });
  const update = vi.fn();
  if (updateResult) update.mockRejectedValue(updateResult);
  else update.mockResolvedValue({ id: STRIPE_CUSTOMER_ID });
  return { stripe: { customers: { retrieve, update } } as unknown as Stripe, retrieve, update };
}

beforeEach(() => vi.clearAllMocks());

describe("syncStripeCustomer — existing customer", () => {
  it("retrieves this customer and writes nothing when Stripe already matches", async () => {
    const { stripe, retrieve, update } = buildStripe({
      name: "Mike Rivera",
      email: "mike@example.com",
      phone: "+15551234567",
    });
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: true, status: "synced", stripeCustomerId: STRIPE_CUSTOMER_ID });
    expect(retrieve).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID);
    expect(update).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("pushes an email that was added locally after the Stripe customer was created", async () => {
    const { stripe, update } = buildStripe({
      name: "Mike Rivera",
      email: null,
      phone: "+15551234567",
    });
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: true, status: "synced", stripeCustomerId: STRIPE_CUSTOMER_ID });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID, { email: "mike@example.com" });
  });

  it("patches only the fields that differ", async () => {
    const { stripe, update } = buildStripe({
      name: "Michael Rivera",
      email: "mike@example.com",
      phone: null,
    });
    await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(update).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID, {
      name: "Mike Rivera",
      phone: "+15551234567",
    });
  });

  it("replaces a stale Stripe email with the local one", async () => {
    const { stripe, update } = buildStripe({
      name: "Mike Rivera",
      email: "old@example.com",
      phone: "+15551234567",
    });
    await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(update).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID, { email: "mike@example.com" });
  });

  it("leaves a Stripe value alone when the local record has none", async () => {
    // An email typed into the Stripe Dashboard as a workaround must survive
    // the next invoice.
    const { stripe, update } = buildStripe({
      name: "Mike Rivera",
      email: "dashboard@example.com",
      phone: "+15551234567",
    });
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, {
      ...LOCAL,
      email: null,
      phone: null,
    });
    expect(result).toEqual({ ok: true, status: "synced", stripeCustomerId: STRIPE_CUSTOMER_ID });
    expect(update).not.toHaveBeenCalled();
  });

  it("fails closed when the Stripe update rejects, and reports it", async () => {
    const { stripe } = buildStripe(
      { name: "Mike Rivera", email: null, phone: "+15551234567" },
      new Error("rate limited")
    );
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({
      ok: false,
      error: "Couldn't update the customer's contact info in Stripe: rate limited",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { source: "stripe-customer-sync" },
        extra: expect.objectContaining({
          customerId: LOCAL.id,
          stripeCustomerId: STRIPE_CUSTOMER_ID,
          step: "update",
          fields: ["email"],
        }),
      })
    );
  });
});

describe("syncStripeCustomer — missing customer", () => {
  it("reports a deleted Stripe customer as missing, without writing, and logs it", async () => {
    const { stripe, update } = buildStripe({ deleted: true });
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: true, status: "missing" });
    expect(update).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Stripe customer missing",
      expect.objectContaining({
        tags: { source: "stripe-customer-sync" },
        extra: expect.objectContaining({ stripeCustomerId: STRIPE_CUSTOMER_ID, reason: "deleted" }),
      })
    );
  });

  it("reports a 404 as missing and logs it, since a key/mode mismatch looks the same", async () => {
    const err = Object.assign(new Error("No such customer"), { code: "resource_missing" });
    const { stripe } = buildStripe(err);
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: true, status: "missing" });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Stripe customer missing",
      expect.objectContaining({
        extra: expect.objectContaining({ reason: "resource_missing" }),
      })
    );
  });

  it("surfaces any other retrieve failure instead of treating it as missing", async () => {
    const err = Object.assign(new Error("Stripe is down"), { code: "api_error" });
    const { stripe } = buildStripe(err);
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({
      ok: false,
      error: "Couldn't verify the customer in Stripe: Stripe is down",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: { source: "stripe-customer-sync" },
        extra: expect.objectContaining({ step: "retrieve" }),
      })
    );
  });
});

describe("createStripeCustomer", () => {
  it("creates from the local record and links it back by id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cus_fresh" });
    const stripe = { customers: { create } } as unknown as Stripe;
    const result = await createStripeCustomer(stripe, LOCAL);
    expect(result).toEqual({ ok: true, stripeCustomerId: "cus_fresh" });
    expect(create).toHaveBeenCalledWith({
      name: "Mike Rivera",
      email: "mike@example.com",
      phone: "+15551234567",
      metadata: { supabase_customer_id: LOCAL.id },
    });
  });

  it("omits empty contact fields rather than sending empty strings", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cus_fresh" });
    const stripe = { customers: { create } } as unknown as Stripe;
    await createStripeCustomer(stripe, { ...LOCAL, email: null, phone: null });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ email: undefined, phone: undefined })
    );
  });

  it("returns an error instead of throwing when Stripe rejects the create", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Invalid API key"));
    const stripe = { customers: { create } } as unknown as Stripe;
    const result = await createStripeCustomer(stripe, LOCAL);
    expect(result).toEqual({
      ok: false,
      error: "Couldn't create the customer in Stripe: Invalid API key",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { source: "stripe-customer-create" },
        extra: { customerId: LOCAL.id },
      })
    );
  });
});
