import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { isDeletedCustomer } from "./guards";

export interface LocalCustomerContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export type SyncStripeCustomerResult =
  | { ok: true; stripeCustomerId: string | null }
  | { ok: false; error: string };

type ContactPatch = Pick<Stripe.CustomerUpdateParams, "name" | "email" | "phone">;

function localContactPatch(
  local: LocalCustomerContact,
  remote: Stripe.Customer
): ContactPatch {
  const patch: ContactPatch = {};
  const name = `${local.first_name} ${local.last_name}`.trim();
  if ((remote.name ?? "") !== name) patch.name = name;
  if ((remote.email ?? "") !== (local.email ?? "")) patch.email = local.email ?? "";
  if ((remote.phone ?? "") !== (local.phone ?? "")) patch.phone = local.phone ?? "";
  return patch;
}

// Stripe customers are created as a one-time snapshot of the local record, and
// the customer edit actions write to Supabase only. Before anything that depends
// on Stripe's copy (send_invoice refuses a customer with no email), push the
// local contact fields onto it. A null stripeCustomerId means the Stripe
// customer is gone and the caller should create a fresh one.
export async function syncStripeCustomer(
  stripe: Stripe,
  stripeCustomerId: string,
  local: LocalCustomerContact
): Promise<SyncStripeCustomerResult> {
  let remote: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    remote = await stripe.customers.retrieve(stripeCustomerId);
  } catch (err) {
    // Stripe sets code "resource_missing" specifically for 404. Other errors
    // (rate limit, network, auth) must surface — silently treating them as
    // missing creates duplicate Stripe customers.
    if ((err as { code?: string } | null)?.code === "resource_missing") {
      return { ok: true, stripeCustomerId: null };
    }
    const message = err instanceof Error ? err.message : "Failed to verify Stripe customer";
    return { ok: false, error: message };
  }

  if (isDeletedCustomer(remote)) {
    return { ok: true, stripeCustomerId: null };
  }

  const patch = localContactPatch(local, remote);
  if (Object.keys(patch).length === 0) {
    return { ok: true, stripeCustomerId };
  }

  try {
    await stripe.customers.update(stripeCustomerId, patch);
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      tags: { source: "stripe-customer-sync" },
      extra: { customerId: local.id, stripeCustomerId, fields: Object.keys(patch) },
    });
    const message = err instanceof Error ? err.message : "Failed to update Stripe customer";
    return { ok: false, error: `Couldn't update the customer's contact info in Stripe: ${message}` };
  }

  return { ok: true, stripeCustomerId };
}
