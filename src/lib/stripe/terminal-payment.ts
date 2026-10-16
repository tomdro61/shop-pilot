import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amountOnlySnapshot,
  buildPaymentSnapshot,
  type AmountOnlySnapshot,
  type PaymentSnapshot,
} from "@/lib/payments/snapshot";
import { voidOpenInvoiceForJob } from "@/lib/invoices/void-open-invoice";
import { notifyOwners } from "@/lib/messaging/notify-owners";
import { openInvoiceNotClosedSMS, possibleDoublePaymentSMS } from "@/lib/messaging/templates";

interface RecordTerminalPaymentParams {
  paymentIntentId: string;
  // From the succeeded PaymentIntent, never the client.
  amountCents: number;
  jobId: string;
  source: "terminal-status" | "stripe-webhook";
}

export type TerminalPaymentOutcome =
  | "recorded"
  | "already-recorded"
  | "double-collection"
  | "missing-job";

export type RecordTerminalPaymentResult =
  | { ok: true; outcome: TerminalPaymentOutcome }
  | { ok: false; error: string };

// Flips a job to paid after a card-reader charge succeeded. Both success
// callers (the client status poll and the payment_intent.succeeded webhook)
// land here; the `.neq("payment_status","paid")` flip makes the second one a
// no-op. A job that was already paid some other way is left alone and reported,
// because the reader has just collected the same bill twice.
export async function recordTerminalPayment({
  paymentIntentId,
  amountCents,
  jobId,
  source,
}: RecordTerminalPaymentParams): Promise<RecordTerminalPaymentResult> {
  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, ro_number, payment_status, payment_method, stripe_payment_intent_id, charge_sales_tax, job_line_items(type, quantity, unit_cost, total, category)"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    Sentry.captureException(jobError, {
      tags: { source, path: "terminal-payment-job-lookup" },
      extra: { jobId, paymentIntentId },
    });
    return { ok: false, error: jobError.message };
  }

  if (!job) {
    Sentry.captureMessage("terminal_payment_job_missing", {
      level: "error",
      tags: { source, path: "terminal-payment-job-missing" },
      extra: { jobId, paymentIntentId, amountCents },
    });
    return { ok: true, outcome: "missing-job" };
  }

  if (job.payment_status === "paid") {
    // /api/terminal/pay stores the PaymentIntent id before any money moves, so
    // a matching id alone doesn't prove this charge is the recorded payment:
    // a cash record taken while the reader was still armed carries it too.
    if (job.payment_method === "terminal" && job.stripe_payment_intent_id === paymentIntentId) {
      return { ok: true, outcome: "already-recorded" };
    }
    Sentry.captureMessage("terminal_payment_double_collection", {
      level: "error",
      tags: { source, path: "terminal-payment-double-collection" },
      extra: {
        jobId,
        paymentIntentId,
        amountCents,
        priorMethod: job.payment_method,
        priorPaymentIntentId: job.stripe_payment_intent_id,
      },
    });
    // Both success callers see this state; the webhook is the one that is
    // delivered exactly once per charge, so it owns the text.
    if (source === "stripe-webhook") {
      await notifyOwners(
        possibleDoublePaymentSMS({
          roNumber: job.ro_number,
          priorMethod: job.payment_method,
          amount: `$${(amountCents / 100).toFixed(2)}`,
          via: "reader",
        }),
        source
      );
    }
    return { ok: true, outcome: "double-collection" };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("shop_settings")
    .select("*")
    .limit(1)
    .single();

  // The money is already collected, so a settings failure can't refuse the
  // record. What it can't do is freeze a guessed rate: the amount is kept and
  // the tax figures stay null, which the tax reports treat as un-snapshotted.
  let snapshot: PaymentSnapshot | AmountOnlySnapshot;
  if (settingsError || !settings) {
    Sentry.captureException(settingsError ?? new Error("shop_settings missing"), {
      level: "error",
      tags: { source, path: "terminal-payment-settings" },
      extra: { jobId, paymentIntentId },
    });
    snapshot = amountOnlySnapshot(amountCents);
  } else {
    const computed = buildPaymentSnapshot(job.job_line_items ?? [], settings, job.charge_sales_tax);
    if (Math.round(computed.amount_collected * 100) !== amountCents) {
      // The reader charged what /api/terminal/pay computed at the time; a line
      // edited in between is the usual cause. Stripe's figure is what was
      // collected. The tax the current lines imply is NOT what was collected,
      // so it is left for a human rather than frozen as filed.
      Sentry.captureMessage("terminal_payment_amount_mismatch", {
        level: "error",
        tags: { source, path: "terminal-payment-amount-mismatch" },
        extra: { jobId, paymentIntentId, amountCents, computedCents: Math.round(computed.amount_collected * 100) },
      });
      snapshot = amountOnlySnapshot(amountCents);
    } else {
      snapshot = computed;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("jobs")
    .update({
      payment_status: "paid",
      payment_method: "terminal",
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
      ...snapshot,
    })
    .eq("id", jobId)
    .neq("payment_status", "paid")
    .select("id")
    .maybeSingle();

  if (updateError) {
    Sentry.captureException(updateError, {
      tags: { source, path: "terminal-payment-job-flip" },
      extra: { jobId, paymentIntentId },
    });
    return { ok: false, error: updateError.message };
  }

  if (!updated) {
    // Something flipped the job between the read and this write: usually the
    // other success caller, but a counter record can also win this race and
    // then this charge is a second collection. Re-read and judge again.
    const { data: again, error: againError } = await supabase
      .from("jobs")
      .select("ro_number, payment_method, stripe_payment_intent_id")
      .eq("id", jobId)
      .maybeSingle();
    if (againError) {
      // Can't tell a harmless second caller from a second collection; a
      // non-ok result lets the webhook redeliver and judge from a fresh read.
      Sentry.captureException(againError, {
        tags: { source, path: "terminal-payment-race-reread" },
        extra: { jobId, paymentIntentId, amountCents },
      });
      return { ok: false, error: againError.message };
    }
    if (!again) {
      Sentry.captureMessage("terminal_payment_job_missing", {
        level: "error",
        tags: { source, path: "terminal-payment-race-job-missing" },
        extra: { jobId, paymentIntentId, amountCents },
      });
      return { ok: true, outcome: "missing-job" };
    }
    if (again.payment_method === "terminal" && again.stripe_payment_intent_id === paymentIntentId) {
      return { ok: true, outcome: "already-recorded" };
    }
    Sentry.captureMessage("terminal_payment_double_collection", {
      level: "error",
      tags: { source, path: "terminal-payment-double-collection-race" },
      extra: { jobId, paymentIntentId, amountCents, priorMethod: again.payment_method },
    });
    if (source === "stripe-webhook") {
      await notifyOwners(
        possibleDoublePaymentSMS({
          roNumber: again.ro_number,
          priorMethod: again.payment_method,
          amount: `$${(amountCents / 100).toFixed(2)}`,
          via: "reader",
        }),
        source
      );
    }
    return { ok: true, outcome: "double-collection" };
  }

  const closed = await voidOpenInvoiceForJob(supabase, jobId, source);
  if (!closed.ok) {
    Sentry.captureMessage("terminal_payment_open_invoice_not_closed", {
      level: "error",
      tags: { source, path: "terminal-payment-void-open-invoice" },
      extra: { jobId, paymentIntentId, reason: closed.reason, stripeInvoiceId: closed.stripeInvoiceId },
    });
    if (closed.reason === "stripe-paid") {
      // The invoice was paid online and the reader just took the bill again.
      await notifyOwners(
        possibleDoublePaymentSMS({
          roNumber: job.ro_number,
          priorMethod: "stripe invoice",
          amount: `$${(amountCents / 100).toFixed(2)}`,
          via: "reader",
        }),
        source
      );
    } else if (closed.reason !== "db") {
      await notifyOwners(openInvoiceNotClosedSMS({ roNumber: job.ro_number }), source);
    }
  }

  return { ok: true, outcome: "recorded" };
}
