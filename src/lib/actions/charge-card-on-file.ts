"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { addJobInvoiceItems } from "@/lib/stripe/create-invoice";
import { calculateTotals } from "@/lib/utils/totals";
import { getShopSettings } from "@/lib/actions/settings";
import { isDeletedCustomer } from "@/lib/stripe/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/_types";
import type { JobLineItem } from "@/types";

// Stripe error codes that mean "the customer must complete 3DS authentication
// to charge this card." `authentication_required` is what Stripe returns from
// PaymentIntent.confirm; `invoice_payment_intent_requires_action` is the same
// condition wrapped through invoices.pay. See https://stripe.com/docs/error-codes
const SCA_REQUIRED_CODES = new Set([
  "authentication_required",
  "invoice_payment_intent_requires_action",
]);

interface ChargeResult {
  invoiceId: string;
  amountDollars: number;
}

export async function chargeCardOnFile(jobId: string): Promise<ActionResult<ChargeResult>> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, status, payment_status, charge_sales_tax, customers(id, first_name, last_name, email, phone, stripe_customer_id), job_line_items(type, description, quantity, unit_cost, category)"
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    if (jobError) {
      Sentry.captureException(jobError, {
        tags: { source: "charge-card-on-file", path: "job-fetch" },
        extra: { jobId },
      });
    }
    return { ok: false, error: "Job not found" };
  }
  if (job.status !== "complete") {
    return { ok: false, error: "Job must be complete before charging" };
  }
  if (job.payment_status === "paid") {
    return { ok: false, error: "Job is already paid" };
  }
  if (job.payment_status === "waived") {
    return { ok: false, error: "Job payment is waived" };
  }

  const customer = job.customers as {
    id: string;
    first_name: string;
    last_name: string;
    stripe_customer_id: string | null;
  } | null;

  if (!customer) return { ok: false, error: "Job has no customer" };
  if (!customer.stripe_customer_id) {
    return { ok: false, error: "Customer has no card on file" };
  }

  const lineItems = (job.job_line_items || []) as Pick<
    JobLineItem,
    "type" | "description" | "quantity" | "unit_cost" | "category"
  >[];

  if (lineItems.length === 0) {
    return { ok: false, error: "Job has no line items" };
  }

  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: `Could not check for existing invoice: ${existingError.message}` };
  }
  if (existingInvoice) {
    // If the prior attempt's webhook already flipped it to paid, the user is
    // retrying after a "couldn't confirm" message but the charge actually
    // succeeded server-side. Tell them clearly instead of the generic
    // "already exists" string.
    if (existingInvoice.status === "paid") {
      return {
        ok: false,
        error: "This job is already paid — refresh to see the receipt.",
      };
    }
    return { ok: false, error: "An invoice already exists for this job" };
  }

  const stripe = getStripe();

  let defaultPmId: string | null = null;
  try {
    const stripeCustomer = await stripe.customers.retrieve(customer.stripe_customer_id, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (isDeletedCustomer(stripeCustomer)) {
      return { ok: false, error: "Stripe customer is missing — re-add the card" };
    }
    const pm = stripeCustomer.invoice_settings?.default_payment_method;
    defaultPmId = typeof pm === "string" ? pm : pm?.id ?? null;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "resource_missing") {
      return { ok: false, error: "Stripe customer is missing — re-add the card" };
    }
    const message = err instanceof Error ? err.message : "Failed to verify Stripe customer";
    return { ok: false, error: message };
  }

  if (!defaultPmId) {
    return { ok: false, error: "No card on file for this customer" };
  }

  // Refuse to charge if we can't load shop settings — calculateTotals would
  // fall back to DEFAULT_SETTINGS (no shop supplies, no hazmat) and the
  // customer would be silently undercharged. Better to fail loudly here.
  const shopSettings = await getShopSettings();
  if (!shopSettings) {
    Sentry.captureMessage("chargeCardOnFile_shop_settings_missing", {
      level: "error",
      tags: { source: "charge-card-on-file", path: "shop-settings-load" },
      extra: { jobId },
    });
    return {
      ok: false,
      error: "Couldn't load shop settings — refresh and try again, or check Settings → Rates & Fees.",
    };
  }
  const totals = calculateTotals(lineItems, shopSettings, job.charge_sales_tax);

  if (totals.grandTotal <= 0) {
    return { ok: false, error: "Job total must be greater than zero" };
  }

  const catTotals: Record<string, number> = {};
  lineItems.forEach((li) => {
    const cat = li.category || "Uncategorized";
    catTotals[cat] = (catTotals[cat] || 0) + li.quantity * li.unit_cost;
  });
  const derivedCategory =
    Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const idempotencyKey = `charge-cof-${jobId}`;

  let stripeInvoiceId: string | null = null;
  let amountPaidCents = 0;

  try {
    const invoice = await stripe.invoices.create(
      {
        customer: customer.stripe_customer_id,
        collection_method: "charge_automatically",
        default_payment_method: defaultPmId,
        auto_advance: false,
        description: derivedCategory && derivedCategory !== "Uncategorized"
          ? `Auto Repair - ${derivedCategory}`
          : "Auto Repair Services",
        metadata: { job_id: jobId },
      },
      { idempotencyKey: `${idempotencyKey}-create` }
    );

    if (!invoice.id) {
      return { ok: false, error: "Stripe did not return an invoice id" };
    }

    stripeInvoiceId = invoice.id;

    await addJobInvoiceItems(stripe, invoice.id, customer.stripe_customer_id, lineItems, totals);

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    stripeInvoiceId = finalized.id ?? invoice.id;
    amountPaidCents = finalized.amount_due;

    // Insert before pay() so we can void cleanly if the local insert fails —
    // once paid, voiding requires a refund instead.
    const { error: insertError } = await supabase.from("invoices").insert({
      job_id: jobId,
      stripe_invoice_id: stripeInvoiceId,
      stripe_hosted_invoice_url: finalized.hosted_invoice_url || null,
      status: "sent",
      amount: amountPaidCents / 100,
    });

    if (insertError) {
      try {
        await stripe.invoices.voidInvoice(stripeInvoiceId);
      } catch (voidErr) {
        console.error("[chargeCardOnFile] failed to void after DB insert error:", voidErr);
        Sentry.captureException(voidErr, {
          tags: { source: "charge-card-on-file", path: "void-after-db-insert" },
          extra: { jobId, stripeInvoiceId, insertError: insertError.message },
        });
      }
      return {
        ok: false,
        error: `Invoice created in Stripe but failed to save locally: ${insertError.message}`,
      };
    }
  } catch (err) {
    if (stripeInvoiceId) {
      try {
        await stripe.invoices.voidInvoice(stripeInvoiceId);
      } catch (voidErr) {
        console.error("[chargeCardOnFile] failed to void after pre-pay error:", voidErr);
        Sentry.captureException(voidErr, {
          tags: { source: "charge-card-on-file", path: "void-after-pre-pay-error" },
          extra: { jobId, stripeInvoiceId, originalError: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    const message = err instanceof Error ? err.message : "Failed to create invoice";
    return { ok: false, error: message };
  }

  try {
    await stripe.invoices.pay(
      stripeInvoiceId,
      { off_session: true },
      { idempotencyKey: `${idempotencyKey}-pay` }
    );
  } catch (err) {
    // Only roll back when Stripe definitively rejected the charge. For
    // ambiguous failures (network blip, Stripe-side outage) the charge MAY
    // have actually gone through — voiding a paid invoice fails and deleting
    // our row would orphan a real payment from the webhook. Leave state
    // alone in those cases and let the webhook reconcile.
    const isDefinitiveDecline = err instanceof Stripe.errors.StripeCardError;

    if (isDefinitiveDecline) {
      try {
        await stripe.invoices.voidInvoice(stripeInvoiceId);
      } catch (voidErr) {
        console.error("[chargeCardOnFile] failed to void after decline:", voidErr);
        Sentry.captureException(voidErr, {
          tags: { source: "charge-card-on-file", path: "void-after-decline" },
          extra: { jobId, stripeInvoiceId },
        });
      }
      const { error: deleteErr } = await supabase
        .from("invoices")
        .delete()
        .eq("stripe_invoice_id", stripeInvoiceId);
      if (deleteErr) {
        console.error("[chargeCardOnFile] failed to delete stranded invoice row:", deleteErr);
        Sentry.captureException(deleteErr, {
          tags: { source: "charge-card-on-file", path: "delete-stranded-invoice" },
          extra: { jobId, stripeInvoiceId },
        });
      }

      const cardErr = err as Stripe.errors.StripeCardError;
      if (cardErr.code && SCA_REQUIRED_CODES.has(cardErr.code)) {
        return {
          ok: false,
          error: "This card requires customer authentication — collect via Terminal instead",
        };
      }
      const declineMessage = cardErr.decline_code
        ? `Card declined (${cardErr.decline_code})`
        : cardErr.message || "Card declined";
      return { ok: false, error: `${declineMessage} — try Terminal or another method` };
    }

    console.error("[chargeCardOnFile] pay() failed with non-decline error; leaving state intact:", err);
    Sentry.captureException(err, {
      tags: { source: "charge-card-on-file", path: "pay-ambiguous-failure" },
      extra: { jobId, stripeInvoiceId },
    });
    return {
      ok: false,
      error:
        "Couldn't confirm the charge — check Stripe Dashboard before retrying. The webhook may still mark this paid if Stripe processed it.",
    };
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/customers/${customer.id}`);

  return {
    ok: true,
    data: { invoiceId: stripeInvoiceId, amountDollars: amountPaidCents / 100 },
  };
}
