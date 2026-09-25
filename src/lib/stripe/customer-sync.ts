import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import type { Customer } from "@/types";
import { isDeletedCustomer } from "./guards";

export type LocalCustomerContact = Pick<
  Customer,
  "id" | "first_name" | "last_name" | "email" | "phone"
>;

export type SyncStripeCustomerResult =
  | { ok: true; status: "synced"; stripeCustomerId: string }
  | { ok: true; status: "missing" }
  | { ok: false; error: string };

type ContactPatch = Pick<Stripe.CustomerUpdateParams, "name" | "email" | "phone">;

// Pushes local values Stripe lacks or has wrong. A field the local record has
// no value for is left alone rather than cleared: an email typed into the
// Stripe Dashboard as a workaround would otherwise be wiped by the next invoice.
function localContactPatch(local: LocalCustomerContact, remote: Stripe.Customer): ContactPatch {
  const patch: ContactPatch = {};
  const name = `${local.first_name} ${local.last_name}`.trim();
  if (name && (remote.name ?? "") !== name) patch.name = name;
  if (local.email && (remote.email ?? "") !== local.email) patch.email = local.email;
  if (local.phone && (remote.phone ?? "") !== local.phone) patch.phone = local.phone;
  return patch;
}

// Stripe customers are created as a one-time snapshot of the local record, and
// the customer edit actions write to Supabase only. Callers that need Stripe's
// copy to be current (send_invoice refuses a customer with no email) run this
// first. "missing" means the Stripe customer is gone and the caller should
// create a fresh one.
export async function syncStripeCustomer(
  stripe: Stripe,
  stripeCustomerId: string,
  local: LocalCustomerContact
): Promise<SyncStripeCustomerResult> {
  const sentryContext = {
    tags: { source: "stripe-customer-sync" },
    extra: { customerId: local.id, stripeCustomerId },
  };

  let remote: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    remote = await stripe.customers.retrieve(stripeCustomerId);
  } catch (err) {
    // Only "resource_missing" (Stripe's 404) means the customer is gone. Other
    // errors (rate limit, network, auth) must surface, because treating them as
    // missing creates a duplicate Stripe customer. A key/mode mismatch also
    // reports resource_missing, so the missing path is logged: a burst of them
    // means the wrong key, not a wave of deletions.
    if ((err as { code?: string } | null)?.code === "resource_missing") {
      Sentry.captureMessage("Stripe customer missing", {
        level: "warning",
        ...sentryContext,
        extra: { ...sentryContext.extra, reason: "resource_missing" },
      });
      return { ok: true, status: "missing" };
    }
    Sentry.captureException(err, {
      level: "warning",
      ...sentryContext,
      extra: { ...sentryContext.extra, step: "retrieve" },
    });
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Couldn't verify the customer in Stripe: ${message}` };
  }

  if (isDeletedCustomer(remote)) {
    Sentry.captureMessage("Stripe customer missing", {
      level: "warning",
      ...sentryContext,
      extra: { ...sentryContext.extra, reason: "deleted" },
    });
    return { ok: true, status: "missing" };
  }

  const patch = localContactPatch(local, remote);
  if (Object.keys(patch).length === 0) {
    return { ok: true, status: "synced", stripeCustomerId };
  }

  try {
    await stripe.customers.update(stripeCustomerId, patch);
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      ...sentryContext,
      extra: { ...sentryContext.extra, step: "update", fields: Object.keys(patch) },
    });
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Couldn't update the customer's contact info in Stripe: ${message}` };
  }

  return { ok: true, status: "synced", stripeCustomerId };
}

export type CreateStripeCustomerResult =
  | { ok: true; stripeCustomerId: string }
  | { ok: false; error: string };

export async function createStripeCustomer(
  stripe: Stripe,
  local: LocalCustomerContact
): Promise<CreateStripeCustomerResult> {
  try {
    const created = await stripe.customers.create({
      name: `${local.first_name} ${local.last_name}`,
      email: local.email || undefined,
      phone: local.phone || undefined,
      metadata: { supabase_customer_id: local.id },
    });
    return { ok: true, stripeCustomerId: created.id };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { source: "stripe-customer-create" },
      extra: { customerId: local.id },
    });
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Couldn't create the customer in Stripe: ${message}` };
  }
}
