import Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getStripe } from "@/lib/stripe";

type Client = SupabaseClient<Database>;

export type VoidOpenInvoiceResult =
  | { ok: true; voided: boolean; stripeInvoiceId: string | null }
  | {
      ok: false;
      reason: "stripe-paid" | "transient" | "stripe-refused" | "db";
      error: string;
      stripeInvoiceId: string | null;
    };

const TRANSIENT_STRIPE_ERRORS = [
  Stripe.errors.StripeConnectionError,
  Stripe.errors.StripeAPIError,
  Stripe.errors.StripeRateLimitError,
];

export function isTransientStripeError(err: unknown): boolean {
  return TRANSIENT_STRIPE_ERRORS.some((cls) => err instanceof cls);
}

// Closes the payment link on a job that is being settled some other way (cash,
// check, ACH, waived, card reader), so the customer can't pay the same bill a
// second time from an old text.
//
// Stripe is settled before the local row goes, same ordering as
// voidInvoiceForJob: handleInvoicePaid finds the row by stripe_invoice_id, so a
// row deleted ahead of a still-payable invoice strands any later payment.
export async function voidOpenInvoiceForJob(
  supabase: Client,
  jobId: string,
  source: string
): Promise<VoidOpenInvoiceResult> {
  const { data: allRows, error } = await supabase
    .from("invoices")
    .select("id, status, stripe_invoice_id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    Sentry.captureException(error, {
      tags: { source, path: "void-open-invoice-lookup" },
      extra: { jobId },
    });
    return {
      ok: false,
      reason: "db",
      error: "Couldn't check this job's invoice. Try again in a moment.",
      stripeInvoiceId: null,
    };
  }

  // A paid row means the customer already paid online; settling the job a
  // second way at the counter would be a double collection.
  const paidRow = allRows?.find((r) => r.status === "paid");
  if (paidRow) {
    return {
      ok: false,
      reason: "stripe-paid",
      error:
        "This job's invoice was paid online. Refresh the job; the payment will be recorded from Stripe.",
      stripeInvoiceId: paidRow.stripe_invoice_id,
    };
  }

  const rows = (allRows ?? []).filter((r) => r.status !== "paid");
  const invoice = rows[0];
  if (!invoice) return { ok: true, voided: false, stripeInvoiceId: null };

  // Unreachable once invoices_one_per_job is applied; kept so a duplicate can't
  // leave the second link live behind a success message.
  if (rows.length > 1) {
    Sentry.captureMessage("void_open_invoice_duplicate_rows", {
      level: "error",
      tags: { source, path: "void-open-invoice-duplicates" },
      extra: { jobId, invoiceIds: rows.map((r) => r.id) },
    });
    return {
      ok: false,
      reason: "stripe-refused",
      error:
        "This job has more than one open invoice on file. Void them in the Stripe dashboard, then try again.",
      stripeInvoiceId: invoice.stripe_invoice_id,
    };
  }

  if (!invoice.stripe_invoice_id) {
    Sentry.captureMessage("void_open_invoice_missing_stripe_id", {
      level: "warning",
      tags: { source, path: "void-open-invoice-no-stripe-id" },
      extra: { jobId, invoiceId: invoice.id },
    });
    return {
      ok: false,
      reason: "stripe-refused",
      error:
        "This job's invoice isn't linked to Stripe, so it can't be closed safely. Void it in the Stripe dashboard first.",
      stripeInvoiceId: null,
    };
  }

  const stripe = getStripe();
  const stripeInvoiceId = invoice.stripe_invoice_id;

  let stripeInvoice: Stripe.Invoice | null = null;
  try {
    stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
  } catch (err) {
    const missing =
      err instanceof Stripe.errors.StripeInvalidRequestError &&
      err.code === "resource_missing";
    // A test-mode key reports a live invoice as missing. Dev runs with the
    // test key against the shared production database, so "gone" can't be
    // trusted there: deleting the row would leave the live link payable with
    // nothing for the webhook to land on.
    if (missing && (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_")) {
      Sentry.captureMessage("void_open_invoice_missing_under_test_key", {
        level: "warning",
        tags: { source, path: "void-open-invoice-test-key" },
        extra: { jobId, stripeInvoiceId },
      });
      return {
        ok: false,
        reason: "stripe-refused",
        error:
          "Stripe can't see this invoice with the test-mode key in use. Record the payment from the production app, or void the invoice in the Stripe dashboard first.",
        stripeInvoiceId,
      };
    }
    if (!missing) {
      const transient = isTransientStripeError(err);
      Sentry.captureException(err, {
        tags: { source, path: "void-open-invoice-retrieve", transient: String(transient) },
        extra: { jobId, stripeInvoiceId },
      });
      return {
        ok: false,
        reason: transient ? "transient" : "stripe-refused",
        error: transient
          ? "Couldn't reach Stripe to close this job's open invoice. Nothing was recorded. Try again."
          : "Stripe rejected the lookup of this job's open invoice. Nothing was recorded. Void it in the Stripe dashboard, then try again.",
        stripeInvoiceId,
      };
    }
    Sentry.captureMessage("void_open_invoice_stripe_absent", {
      level: "warning",
      tags: { source, path: "void-open-invoice-absent" },
      extra: { jobId, invoiceId: invoice.id, stripeInvoiceId },
    });
  }

  if (stripeInvoice?.status === "paid") {
    return {
      ok: false,
      reason: "stripe-paid",
      error:
        "Stripe shows this job's invoice as already paid. Refresh the job; the payment will be recorded from Stripe.",
      stripeInvoiceId,
    };
  }

  let voided = false;
  if (stripeInvoice && stripeInvoice.status !== "void") {
    try {
      await stripe.invoices.voidInvoice(stripeInvoiceId);
      voided = true;
    } catch (err) {
      const transient = isTransientStripeError(err);
      Sentry.captureException(err, {
        tags: { source, path: "void-open-invoice-void", transient: String(transient) },
        extra: { jobId, stripeInvoiceId, stripeStatus: stripeInvoice.status },
      });
      return {
        ok: false,
        reason: transient ? "transient" : "stripe-refused",
        error:
          "Stripe wouldn't close this job's open invoice. Nothing was recorded. Void it in Stripe, then try again.",
        stripeInvoiceId,
      };
    }
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoice.id)
    .neq("status", "paid")
    .select("id");

  if (deleteError) {
    Sentry.captureException(deleteError, {
      tags: { source, path: "void-open-invoice-delete" },
      extra: { jobId, invoiceId: invoice.id, stripeInvoiceId, voided },
    });
    return {
      ok: false,
      reason: "db",
      error: voided
        ? "The Stripe invoice was voided but ShopPilot still shows it. Refresh and try again."
        : "Couldn't clear this job's invoice. Try again in a moment.",
      stripeInvoiceId,
    };
  }

  if (!deleted || deleted.length === 0) {
    // Either the invoice.voided webhook for the void above beat this delete
    // (row gone: fine), or the row turned paid between the read and the delete
    // (the customer paid the link while staff were recording another method).
    const { data: again, error: againError } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", invoice.id)
      .maybeSingle();
    if (againError) {
      Sentry.captureException(againError, {
        tags: { source, path: "void-open-invoice-reread" },
        extra: { jobId, invoiceId: invoice.id, stripeInvoiceId },
      });
      return {
        ok: false,
        reason: "db",
        error: "Couldn't confirm this job's invoice was cleared. Refresh and try again.",
        stripeInvoiceId,
      };
    }
    if (!again) return { ok: true, voided, stripeInvoiceId };
    return {
      ok: false,
      reason: "stripe-paid",
      error:
        "This job's invoice was just paid online. Refresh the job before recording anything else.",
      stripeInvoiceId,
    };
  }

  return { ok: true, voided, stripeInvoiceId };
}
