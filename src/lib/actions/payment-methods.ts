"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { isDeletedCustomer } from "@/lib/stripe/guards";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer } from "@/lib/actions/invoices";
import type { ActionResult } from "@/lib/actions/_types";
import type { CardBrand } from "@/lib/utils/card-brand";

export interface SavedCard {
  brand: CardBrand;
  last4: string;
  exp_month: number;
  exp_year: number;
}

// No requireManager() gate — read-only fetch of brand/last4/exp (no PAN data),
// called from server-rendered manager-only routes whose layout-level auth
// already gates access.
export async function getPaymentMethod(
  customerId: string
): Promise<ActionResult<SavedCard | null>> {
  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", customerId)
    .single();

  if (error) {
    return { ok: false, error: `Could not load customer: ${error.message}` };
  }
  if (!customer?.stripe_customer_id) return { ok: true, data: null };

  const stripe = getStripe();
  try {
    const stripeCustomer = await stripe.customers.retrieve(customer.stripe_customer_id, {
      expand: ["invoice_settings.default_payment_method"],
    });

    if (isDeletedCustomer(stripeCustomer)) return { ok: true, data: null };

    const defaultPm = stripeCustomer.invoice_settings?.default_payment_method;
    if (!defaultPm || typeof defaultPm === "string") return { ok: true, data: null };

    const card = defaultPm.card;
    if (!card) return { ok: true, data: null };

    return {
      ok: true,
      data: {
        brand: card.brand,
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
      },
    };
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "resource_missing") {
      return { ok: true, data: null };
    }
    const message = err instanceof Error ? err.message : "Failed to load saved card";
    return { ok: false, error: message };
  }
}

export async function createSetupIntent(
  customerId: string
): Promise<ActionResult<{ clientSecret: string }>> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const stripeResult = await getOrCreateStripeCustomer(customerId);
  if (stripeResult.error || !stripeResult.data) {
    return { ok: false, error: stripeResult.error || "Failed to get Stripe customer" };
  }

  const stripe = getStripe();
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeResult.data,
      usage: "off_session",
      payment_method_types: ["card"],
    });

    if (!setupIntent.client_secret) {
      return { ok: false, error: "Stripe did not return a client secret" };
    }

    return { ok: true, data: { clientSecret: setupIntent.client_secret } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create setup intent";
    return { ok: false, error: message };
  }
}

export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", customerId)
    .single();

  if (error || !customer?.stripe_customer_id) {
    return { ok: false, error: "Customer has no Stripe account yet" };
  }

  const stripe = getStripe();
  try {
    // Verify the PM belongs to this customer before setting it as default.
    // Structural check (compare pm.customer to our stripe_customer_id) instead
    // of relying on Stripe attach-error code strings, which the SDK doesn't
    // enumerate as types.
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;

    if (pmCustomer && pmCustomer !== customer.stripe_customer_id) {
      return { ok: false, error: "Payment method belongs to another customer" };
    }

    if (!pmCustomer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.stripe_customer_id,
      });
    }

    await stripe.customers.update(customer.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save payment method";
    return { ok: false, error: message };
  }
}

export async function removePaymentMethod(customerId: string): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", customerId)
    .single();

  if (error || !customer?.stripe_customer_id) {
    return { ok: false, error: "Customer has no Stripe account" };
  }

  const stripe = getStripe();
  let defaultCleared = false;
  try {
    const stripeCustomer = await stripe.customers.retrieve(customer.stripe_customer_id);
    if (isDeletedCustomer(stripeCustomer)) {
      return { ok: false, error: "Stripe customer not found" };
    }

    const defaultPm = stripeCustomer.invoice_settings?.default_payment_method;
    const pmId = typeof defaultPm === "string" ? defaultPm : defaultPm?.id;

    if (!pmId) {
      return { ok: true };
    }

    // Clear the default first so an interruption between the two calls leaves
    // the customer with no default — safer than a stale default pointing at a
    // detached PM. Stripe accepts empty string to unset the field.
    await stripe.customers.update(customer.stripe_customer_id, {
      invoice_settings: { default_payment_method: "" },
    });
    defaultCleared = true;
    await stripe.paymentMethods.detach(pmId);

    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { source: "remove-payment-method" },
      extra: {
        customerId,
        stripeCustomerId: customer.stripe_customer_id,
        // True = update succeeded but detach failed; PM is still attached but
        // the customer no longer has a default. UI shows "no card" but the PM
        // lingers on the Stripe customer until manual cleanup.
        defaultClearedBeforeFailure: defaultCleared,
      },
    });
    const message = err instanceof Error ? err.message : "Failed to remove payment method";
    return { ok: false, error: message };
  }
}
