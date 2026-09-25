import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { syncStripeCustomer } from "./customer-sync";

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
    expect(result).toEqual({ ok: true, stripeCustomerId: STRIPE_CUSTOMER_ID });
    expect(retrieve).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID);
    expect(update).not.toHaveBeenCalled();
  });

  it("pushes an email that was added locally after the Stripe customer was created", async () => {
    const { stripe, update } = buildStripe({
      name: "Mike Rivera",
      email: null,
      phone: "+15551234567",
    });
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: true, stripeCustomerId: STRIPE_CUSTOMER_ID });
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

  it("clears a Stripe value the local record no longer has", async () => {
    const { stripe, update } = buildStripe({
      name: "Mike Rivera",
      email: "old@example.com",
      phone: "+15551234567",
    });
    await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, { ...LOCAL, email: null });
    expect(update).toHaveBeenCalledWith(STRIPE_CUSTOMER_ID, { email: "" });
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
        extra: expect.objectContaining({ customerId: LOCAL.id, fields: ["email"] }),
      })
    );
  });
});

describe("syncStripeCustomer — missing customer", () => {
  it("reports a deleted Stripe customer as missing without writing to it", async () => {
    const { stripe, update } = buildStripe({ deleted: true });
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: true, stripeCustomerId: null });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a 404 as missing", async () => {
    const err = Object.assign(new Error("No such customer"), { code: "resource_missing" });
    const { stripe } = buildStripe(err);
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: true, stripeCustomerId: null });
  });

  it("surfaces any other retrieve failure instead of treating it as missing", async () => {
    const err = Object.assign(new Error("Stripe is down"), { code: "api_error" });
    const { stripe } = buildStripe(err);
    const result = await syncStripeCustomer(stripe, STRIPE_CUSTOMER_ID, LOCAL);
    expect(result).toEqual({ ok: false, error: "Stripe is down" });
  });
});
