import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordQuickPayJob } from "@/lib/stripe/quick-pay";
import { sendSMS } from "@/lib/quo/client";
import { toE164 } from "@/lib/quo/format";
import { getPhoneNumber, getParkingLine } from "@/lib/quo/routing";
import { sendEmail } from "@/lib/resend/client";
import {
  paymentReceivedSMS,
  paymentReceivedInternalSMS,
} from "@/lib/messaging/templates";
import { paymentReceiptEmail, parkingPaymentReceiptEmail } from "@/lib/resend/templates";
import { calculateTotals } from "@/lib/utils/totals";
import { WALK_IN_CUSTOMER_ID } from "@/lib/constants";
import {
  amountOnlySnapshot,
  buildPaymentSnapshot,
  type AmountOnlySnapshot,
  type PaymentSnapshot,
} from "@/lib/payments/snapshot";
import { isTransientStripeError } from "@/lib/invoices/void-open-invoice";
import { recordTerminalPayment } from "@/lib/stripe/terminal-payment";
import { notifyOwners } from "@/lib/messaging/notify-owners";
import {
  disputeOpenedSMS,
  possibleDoublePaymentSMS,
  refundRecordedSMS,
} from "@/lib/messaging/templates";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const stripeInvoice = event.data.object as Stripe.Invoice;
    const settled = await handleInvoicePaid(stripeInvoice);
    if (!settled) {
      // Non-2xx so Stripe redelivers. A redelivery whose invoice row already
      // reads paid only re-attempts the job flip, so a retry is free.
      return NextResponse.json({ error: "invoice.paid reconcile failed" }, { status: 500 });
    }
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const recorded = await handleChargeRefunded(charge);
    if (!recorded) {
      return NextResponse.json({ error: "refund record failed" }, { status: 500 });
    }
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    await handleDisputeCreated(dispute);
  }

  if (event.type === "invoice.voided") {
    const stripeInvoice = event.data.object as Stripe.Invoice;
    const reconciled = await handleInvoiceVoided(stripeInvoice);
    if (!reconciled) {
      // Non-2xx so Stripe redelivers. Idempotent, so a retry is free.
      return NextResponse.json({ error: "void reconcile failed" }, { status: 500 });
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.quick_pay === "true") {
      // Durable backstop for Quick Pay when the client poll never sees success
      // (tab closed, session expired). Idempotent with the status route; see
      // record_quick_pay_job.
      const jobId = await recordQuickPayJob({
        paymentIntentId: pi.id,
        amountCents: pi.amount,
        note: pi.metadata.note ?? null,
        category: pi.metadata.category ?? null,
        source: "stripe-webhook",
      });
      if (!jobId) {
        // The record failed and this is the last automatic retry path (the client
        // poll stops after one success). Return non-2xx so Stripe redelivers —
        // safe because record_quick_pay_job is idempotent (ON CONFLICT) and sends
        // no customer-facing side effects. Without this, a charged card could go
        // permanently unrecorded with only a Sentry event as the trace.
        return NextResponse.json({ error: "quick_pay record failed" }, { status: 500 });
      }
    } else if (pi.metadata?.job_id) {
      const result = await recordTerminalPayment({
        paymentIntentId: pi.id,
        amountCents: pi.amount,
        jobId: pi.metadata.job_id,
        source: "stripe-webhook",
      });
      if (!result.ok) {
        // The reader charged the card. If the client poll also failed to
        // record it, this redelivery is the last path that can.
        return NextResponse.json({ error: "terminal payment record failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}

// Both the delivered and the suppressed path record the attempt, so a customer
// timeline can distinguish "no receipt was owed" from "one was owed and did not
// go". The insert's own error used to be discarded outright.
async function logReceiptEmail(
  supabase: ReturnType<typeof createAdminClient>,
  {
    customerId,
    jobId,
    body,
    sent,
    stripeInvoiceId,
  }: {
    customerId: string;
    jobId: string | null;
    body: string;
    sent: boolean;
    stripeInvoiceId: string | undefined;
  }
) {
  const { error } = await supabase.from("messages").insert({
    customer_id: customerId,
    job_id: jobId,
    channel: "email" as const,
    direction: "out" as const,
    body,
    status: sent ? "sent" : "failed",
  });

  if (error) {
    console.error("Failed to log receipt email:", error.message);
    Sentry.captureException(error, {
      tags: { source: "stripe-webhook", path: "receipt-email-log" },
      extra: { stripeInvoiceId, customerId, jobId },
    });
  }
}

// A void done in the Stripe dashboard used to be invisible here: the local row
// stayed, and createInvoiceFromJob then refused to bill the job again because
// "an invoice already exists". Deleting the row on this event is what makes the
// dashboard and the app agree, and it's the backstop for voidInvoiceForJob
// failing between the Stripe void and its own delete.
//
// Returns false when the caller should hand Stripe a non-2xx so it redelivers.
// The failure being backstopped is a Supabase write failing, and when the DB is
// unhealthy the action's delete and this one fail for the same reason — one
// attempt each is not a recovery path. Re-running is free: a missing row is a
// no-op below.
async function handleInvoiceVoided(stripeInvoice: Stripe.Invoice): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, job_id, parking_reservation_id, status")
    .eq("stripe_invoice_id", stripeInvoice.id)
    .maybeSingle();

  if (error) {
    console.error("[stripe webhook] handleInvoiceVoided: failed to look up invoice", {
      stripeInvoiceId: stripeInvoice.id,
      error,
    });
    Sentry.captureException(error, {
      tags: { source: "stripe-webhook", path: "void-invoice-lookup" },
      extra: { stripeInvoiceId: stripeInvoice.id },
    });
    return false;
  }

  // No row is a normal outcome. It happens when voidInvoiceForJob won the race
  // to delete it, when chargeCardOnFile voided an invoice it never managed to
  // record locally, or on a redelivery. Returning here is what makes all three
  // converge.
  if (!invoice) return true;

  // Stripe won't void a paid invoice, so a local row reading paid against a
  // voided Stripe invoice means the two have diverged. Deleting would orphan
  // the payment from the job — refuse and let a human look. A retry can't fix
  // this, so report success to Stripe.
  if (invoice.status === "paid") {
    Sentry.captureMessage("stripe_webhook_void_on_paid_invoice", {
      level: "error",
      tags: { source: "stripe-webhook", path: "void-on-paid" },
      extra: {
        stripeInvoiceId: stripeInvoice.id,
        invoiceId: invoice.id,
        jobId: invoice.job_id,
        parkingReservationId: invoice.parking_reservation_id,
      },
    });
    return true;
  }

  // Parking invoices are kept. Deleting exists to unblock re-billing a job, and
  // that block is job-scoped — a reservation can carry several invoices with no
  // constraint between them, so removing one would erase billing history to no
  // purpose.
  if (!invoice.job_id) {
    Sentry.captureMessage("stripe_webhook_void_parking_invoice", {
      level: "info",
      tags: { source: "stripe-webhook", path: "void-parking" },
      extra: {
        stripeInvoiceId: stripeInvoice.id,
        invoiceId: invoice.id,
        parkingReservationId: invoice.parking_reservation_id,
      },
    });
    return true;
  }

  // .neq guards the gap between the read above and this write: handleInvoicePaid
  // can flip the row to paid in between. .select() so that no-op is visible —
  // silently matching nothing is how the divergence alarm above gets skipped.
  const { data: deleted, error: deleteError } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoice.id)
    .neq("status", "paid")
    .select("id");

  if (deleteError) {
    console.error("[stripe webhook] handleInvoiceVoided: failed to delete invoice", {
      stripeInvoiceId: stripeInvoice.id,
      error: deleteError,
    });
    Sentry.captureException(deleteError, {
      tags: { source: "stripe-webhook", path: "void-invoice-delete" },
      extra: { stripeInvoiceId: stripeInvoice.id, invoiceId: invoice.id },
    });
    return false;
  }

  if (!deleted || deleted.length === 0) {
    // The row turned paid between the read and the delete — the same divergence
    // the guard above shouts about, reached through the race instead.
    Sentry.captureMessage("stripe_webhook_void_delete_matched_nothing", {
      level: "error",
      tags: { source: "stripe-webhook", path: "void-delete-noop" },
      extra: { stripeInvoiceId: stripeInvoice.id, invoiceId: invoice.id, jobId: invoice.job_id },
    });
    return true;
  }

  // cancelJob and deleteJob refuse while payment_status reads 'invoiced',
  // telling the manager to void the invoice first. voidInvoiceForJob does the
  // same reset on its own path; this covers a void done in the dashboard.
  const { error: statusError } = await supabase
    .from("jobs")
    .update({ payment_status: "unpaid" })
    .eq("id", invoice.job_id)
    .eq("payment_status", "invoiced");

  if (statusError) {
    Sentry.captureException(statusError, {
      level: "warning",
      tags: { source: "stripe-webhook", path: "void-reset-payment-status" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId: invoice.job_id },
    });
  }

  return true;
}

async function handleInvoicePaid(stripeInvoice: Stripe.Invoice): Promise<boolean> {
  const supabase = createAdminClient();

  // Find our invoice by Stripe invoice ID
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, job_id, parking_reservation_id, status")
    .eq("stripe_invoice_id", stripeInvoice.id)
    .maybeSingle();

  if (error) {
    console.error("[stripe webhook] handleInvoicePaid: failed to look up invoice", {
      stripeInvoiceId: stripeInvoice.id,
      error,
    });
    Sentry.captureException(error, {
      tags: { source: "stripe-webhook", path: "invoice-lookup" },
      extra: { stripeInvoiceId: stripeInvoice.id },
    });
    return false;
  }
  if (!invoice) {
    // No local row — could be an invoice created outside ShopPilot, or one we
    // failed to record. Worth knowing about either way.
    console.warn("[stripe webhook] handleInvoicePaid: no local row for invoice", {
      stripeInvoiceId: stripeInvoice.id,
    });
    Sentry.captureMessage("stripe_webhook_no_local_invoice", {
      level: "warning",
      tags: { source: "stripe-webhook" },
      extra: { stripeInvoiceId: stripeInvoice.id },
    });
    return true;
  }

  // Idempotency guard — Stripe retries webhooks until it gets a 2xx, and
  // duplicate delivery happens on reconnects. Without this, a second delivery
  // would re-fire the receipt email, customer SMS, and internal-notify SMS.
  if (invoice.status === "paid") {
    // A redelivery, or a retry after the job flip below failed. The row is
    // settled; the job may not be. Re-attempt only the job side, which is
    // guarded by its own `.neq("payment_status","paid")`.
    if (!invoice.job_id) return true;
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("payment_status")
      .eq("id", invoice.job_id)
      .maybeSingle();
    if (jobError) {
      Sentry.captureException(jobError, {
        tags: { source: "stripe-webhook", path: "redelivery-job-lookup" },
        extra: { stripeInvoiceId: stripeInvoice.id, jobId: invoice.job_id },
      });
      return false;
    }
    if (job) {
      return settleJobForPaidInvoice(supabase, invoice.job_id, stripeInvoice, { redelivery: true });
    }
    return true;
  }

  // Atomic flip — `.neq("status", "paid")` makes the update conditional on the
  // row not having been flipped to paid already. Two concurrent deliveries that
  // both pass the guard above will both reach this point; only the first
  // transitions the row, and the second updates zero rows (we bail out below).
  //
  // Deliberately NOT `.eq("status", invoice.status)`. Pinning the predicate to the
  // exact status we read assumes this handler is the only writer of the row, so any
  // other concurrent write — a draft→sent flip, say — makes this update match zero
  // rows and silently skip everything below: the jobs.payment_status flip, the
  // receipt email, the customer SMS, and the owner notification. Stripe has already
  // received its 2xx by then, so it never retries and the payment is lost from the
  // app's point of view. Matching on "not already paid" gives the same idempotency
  // guarantee without depending on there being no other writer.
  const { data: updated, error: updateErr } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: "stripe",
    })
    .eq("id", invoice.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    console.error("[stripe webhook] handleInvoicePaid: failed to flip invoice status", {
      stripeInvoiceId: stripeInvoice.id,
      invoiceRowId: invoice.id,
      error: updateErr,
    });
    Sentry.captureException(updateErr, {
      tags: { source: "stripe-webhook", path: "invoice-status-flip" },
      extra: { stripeInvoiceId: stripeInvoice.id, invoiceRowId: invoice.id },
    });
    return false;
  }
  if (!updated) {
    // Zero rows updated — another concurrent delivery already flipped this row
    // (atomic-flip race; expected behavior, not an error).
    return true;
  }

  const amount = stripeInvoice.amount_paid
    ? `$${(stripeInvoice.amount_paid / 100).toFixed(2)}`
    : null;

  // ── Parking invoice branch ──────────────────────────────────────
  if (invoice.parking_reservation_id) {
    const { data: reservation, error: reservationErr } = await supabase
      .from("parking_reservations")
      .select("id, first_name, last_name, lot, customer_id, phone, email")
      .eq("id", invoice.parking_reservation_id)
      .single();

    if (reservationErr || !reservation) {
      console.error("[stripe webhook] handleInvoicePaid: parking reservation not found", {
        stripeInvoiceId: stripeInvoice.id,
        parkingReservationId: invoice.parking_reservation_id,
        error: reservationErr,
      });
      Sentry.captureException(reservationErr ?? new Error("Parking reservation missing"), {
        tags: { source: "stripe-webhook", path: "parking-reservation-fetch" },
        extra: {
          stripeInvoiceId: stripeInvoice.id,
          parkingReservationId: invoice.parking_reservation_id,
        },
      });
      // The money is recorded. A retry would exit at the job_id guard above
      // (the row already reads paid), so the parking receipt is not re-sent;
      // the Sentry event is the trace.
      return true;
    }

    // Customer SMS (fire-and-forget)
    if (reservation.phone && amount && reservation.customer_id) {
      try {
        const to = toE164(reservation.phone);
        if (to) {
          const parkingLine = getParkingLine(reservation.lot);
          const parkingPhone = getPhoneNumber(parkingLine);
          const smsBody = paymentReceivedSMS({
            firstName: reservation.first_name,
            amount,
          });
          await sendSMS({ to, body: smsBody, from: parkingPhone });
          await supabase.from("messages").insert({
            customer_id: reservation.customer_id,
            channel: "sms" as const,
            direction: "out" as const,
            body: smsBody,
            phone_line: parkingLine,
          });
        }
      } catch (err) {
        console.error("Failed to send parking payment SMS:", err);
        Sentry.captureException(err, {
          level: "warning",
          tags: { source: "stripe-webhook", path: "parking-payment-sms" },
          extra: { stripeInvoiceId: stripeInvoice.id, customerId: reservation.customer_id },
        });
      }
    }

    // Parking receipt email (fire-and-forget)
    if (reservation.email && reservation.customer_id) {
      try {
        const stripeLineItems = (stripeInvoice.lines?.data || []).map((line) => ({
          description: line.description || "Charge",
          amount: (line.amount || 0) / 100,
        }));

        const { subject, html } = parkingPaymentReceiptEmail({
          customerName: reservation.first_name,
          lot: reservation.lot,
          lineItems: stripeLineItems,
          total: (stripeInvoice.amount_paid || 0) / 100,
        });

        const result = await sendEmail({ to: reservation.email, subject, html });

        await supabase.from("messages").insert({
          customer_id: reservation.customer_id,
          channel: "email" as const,
          direction: "out" as const,
          body: subject,
          status: result.success ? "sent" : "failed",
        });
      } catch (err) {
        console.error("Failed to send parking receipt email:", err);
        Sentry.captureException(err, {
          level: "warning",
          tags: { source: "stripe-webhook", path: "parking-receipt-email" },
          extra: { stripeInvoiceId: stripeInvoice.id, customerId: reservation.customer_id },
        });
      }
    }

    // Internal notification (fire-and-forget)
    if (amount) {
      const notifyPhones = process.env.INTERNAL_NOTIFICATION_PHONES;
      if (notifyPhones) {
        try {
          const parkingLine = getParkingLine(reservation.lot);
          const parkingPhone = getPhoneNumber(parkingLine);
          const internalBody = paymentReceivedInternalSMS({
            firstName: reservation.first_name,
            lastName: reservation.last_name,
            amount,
          });
          const phones = notifyPhones
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
          await Promise.all(
            phones.map((phone) =>
              sendSMS({ to: phone, body: internalBody, from: parkingPhone }).catch(
                (err) => {
                  console.error(
                    `[Stripe] Internal parking payment SMS to ${phone} failed:`,
                    err
                  );
                  Sentry.captureException(err, {
                    level: "warning",
                    tags: { source: "stripe-webhook", path: "parking-internal-notify-fanout" },
                    extra: { stripeInvoiceId: stripeInvoice.id, phone },
                  });
                }
              )
            )
          );
        } catch (err) {
          console.error("Failed to send internal parking payment SMS:", err);
          Sentry.captureException(err, {
            level: "warning",
            tags: { source: "stripe-webhook", path: "parking-internal-notify-sms" },
            extra: { stripeInvoiceId: stripeInvoice.id },
          });
        }
      }
    }

    return true;
  }

  // ── Job invoice branch ──────────────────────────────────────────
  if (!invoice.job_id) {
    console.warn("[stripe webhook] handleInvoicePaid: invoice has neither job_id nor parking_reservation_id", {
      stripeInvoiceId: stripeInvoice.id,
      invoiceRowId: invoice.id,
    });
    Sentry.captureMessage("stripe_webhook_orphan_invoice", {
      level: "warning",
      tags: { source: "stripe-webhook" },
      extra: { stripeInvoiceId: stripeInvoice.id, invoiceRowId: invoice.id },
    });
    return true;
  }

  return settleJobForPaidInvoice(supabase, invoice.job_id, stripeInvoice, { redelivery: false });
}

// Flips the job behind a paid Stripe invoice and sends the receipt, customer
// SMS and owner notification. Reached from the first delivery after the
// invoice row flips, and from a redelivery when that first attempt failed
// before the job was marked.
async function settleJobForPaidInvoice(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  stripeInvoice: Stripe.Invoice,
  { redelivery }: { redelivery: boolean }
): Promise<boolean> {
  const amount = stripeInvoice.amount_paid
    ? `$${(stripeInvoice.amount_paid / 100).toFixed(2)}`
    : null;

  // Read once: the snapshot and the receipt both need settings, and the
  // receipt refuses on a failed read.
  const { data: settingsRow, error: settingsErr } = await supabase
    .from("shop_settings")
    .select("*")
    .limit(1)
    .single();

  const { data: jobData, error: jobFetchErr } = await supabase
    .from("jobs")
    .select(
      "id, ro_number, title, payment_status, payment_method, paid_at, charge_sales_tax, customers(id, first_name, last_name, email, phone), vehicles(year, make, model, license_plate, vin), job_line_items(type, description, quantity, unit_cost, total, category)"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobFetchErr) {
    console.error("[stripe webhook] handleInvoicePaid: failed to fetch job", {
      stripeInvoiceId: stripeInvoice.id,
      jobId,
      error: jobFetchErr,
    });
    Sentry.captureException(jobFetchErr, {
      tags: { source: "stripe-webhook", path: "job-fetch" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId },
    });
    return false;
  }
  if (!jobData) {
    Sentry.captureMessage("stripe_webhook_paid_invoice_job_missing", {
      level: "error",
      tags: { source: "stripe-webhook", path: "job-missing" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId },
    });
    return true;
  }

  // On the first delivery this handler has just won the one-time invoice flip,
  // so a job that already reads paid was settled some other way (cash, check,
  // card reader, or a hand-recorded card payment, which also stores "stripe")
  // and the old payment link was tapped anyway. On a redelivery a job paid by
  // "stripe" is the earlier attempt's own flip. The original record is kept;
  // the shop is told to refund the second charge.
  const alreadySettledElsewhere =
    jobData.payment_status === "paid" && (!redelivery || jobData.payment_method !== "stripe");
  if (alreadySettledElsewhere) {
    Sentry.captureMessage("stripe_webhook_double_payment", {
      level: "error",
      tags: { source: "stripe-webhook", path: "double-payment" },
      extra: {
        stripeInvoiceId: stripeInvoice.id,
        jobId,
        roNumber: jobData.ro_number,
        priorMethod: jobData.payment_method,
        priorPaidAt: jobData.paid_at,
        amountPaidCents: stripeInvoice.amount_paid,
      },
    });
    await notifyOwners(
      possibleDoublePaymentSMS({
        roNumber: jobData.ro_number,
        priorMethod: jobData.payment_method,
        amount: amount ?? "an unknown amount",
      }),
      "stripe-webhook"
    );
    return true;
  }
  if (jobData.payment_status === "paid") {
    return true;
  }

  const paidCents = typeof stripeInvoice.amount_paid === "number" ? stripeInvoice.amount_paid : 0;
  let snapshot: PaymentSnapshot | AmountOnlySnapshot;
  if (settingsErr || !settingsRow) {
    // The payment can't be refused, but a guessed rate must not be frozen.
    Sentry.captureException(settingsErr ?? new Error("shop_settings missing"), {
      level: "error",
      tags: { source: "stripe-webhook", path: "snapshot-settings" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId },
    });
    snapshot = amountOnlySnapshot(paidCents);
  } else {
    const computed = buildPaymentSnapshot(
      jobData.job_line_items ?? [],
      settingsRow,
      jobData.charge_sales_tax
    );
    if (Math.round(computed.amount_collected * 100) === paidCents) {
      snapshot = computed;
    } else {
      // Lines were edited after the invoice was sent. The tax those lines
      // imply is not the tax that was collected, so it is not frozen as filed.
      Sentry.captureMessage("stripe_webhook_snapshot_mismatch", {
        level: "error",
        tags: { source: "stripe-webhook", path: "snapshot-mismatch" },
        extra: {
          stripeInvoiceId: stripeInvoice.id,
          jobId,
          paidCents,
          computedCents: Math.round(computed.amount_collected * 100),
        },
      });
      snapshot = amountOnlySnapshot(paidCents);
    }
  }

  const { data: jobFlipped, error: jobUpdateErr } = await supabase
    .from("jobs")
    .update({
      payment_status: "paid",
      payment_method: "stripe",
      paid_at: new Date().toISOString(),
      ...snapshot,
    })
    .eq("id", jobId)
    .neq("payment_status", "paid")
    .select("id")
    .maybeSingle();

  if (jobUpdateErr) {
    console.error("[stripe webhook] handleInvoicePaid: failed to flip job payment_status", {
      stripeInvoiceId: stripeInvoice.id,
      jobId,
      error: jobUpdateErr,
    });
    Sentry.captureException(jobUpdateErr, {
      tags: { source: "stripe-webhook", path: "job-payment-status-flip" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId },
    });
    return false;
  }
  if (!jobFlipped) {
    // Something flipped the job between the read above and this write. A
    // counter record (cash, card reader) means the customer has now paid
    // twice. A "stripe" flip is read as a concurrent delivery of this same
    // event, which the first-delivery check above can't rule out here; a
    // hand-recorded card payment landing in this same window would look the
    // same, so the race is logged either way.
    const { data: again, error: againError } = await supabase
      .from("jobs")
      .select("ro_number, payment_method, paid_at")
      .eq("id", jobId)
      .maybeSingle();
    if (againError) {
      Sentry.captureException(againError, {
        tags: { source: "stripe-webhook", path: "job-flip-race-reread" },
        extra: { stripeInvoiceId: stripeInvoice.id, jobId },
      });
      return false;
    }
    if (!again) {
      Sentry.captureMessage("stripe_webhook_paid_invoice_job_missing", {
        level: "error",
        tags: { source: "stripe-webhook", path: "job-flip-race-job-missing" },
        extra: { stripeInvoiceId: stripeInvoice.id, jobId },
      });
      return true;
    }
    if (again.payment_method === "stripe") {
      Sentry.captureMessage("stripe_webhook_job_flip_race", {
        level: "warning",
        tags: { source: "stripe-webhook", path: "job-flip-race" },
        extra: { stripeInvoiceId: stripeInvoice.id, jobId, redelivery, priorPaidAt: again.paid_at },
      });
    } else {
      Sentry.captureMessage("stripe_webhook_double_payment", {
        level: "error",
        tags: { source: "stripe-webhook", path: "double-payment-race" },
        extra: { stripeInvoiceId: stripeInvoice.id, jobId, priorMethod: again.payment_method, priorPaidAt: again.paid_at },
      });
      await notifyOwners(
        possibleDoublePaymentSMS({
          roNumber: again.ro_number,
          priorMethod: again.payment_method,
          amount: amount ?? "an unknown amount",
        }),
        "stripe-webhook"
      );
    }
    return true;
  }

  const customer = jobData.customers as {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;

  const vehicle = jobData.vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
    license_plate: string | null;
    vin: string | null;
  } | null;

  if (!customer) {
    console.warn("[stripe webhook] handleInvoicePaid: paid job has no customer — receipt not sent", {
      stripeInvoiceId: stripeInvoice.id,
      jobId,
    });
    Sentry.captureMessage("stripe_webhook_paid_job_no_customer", {
      level: "warning",
      tags: { source: "stripe-webhook" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId },
    });
    return true;
  }

  // Receipt email (fire-and-forget)
  if (customer.email) {
    try {
      // No receipt beats a receipt with the wrong total. calculateTotals falls
      // back to DEFAULT_SETTINGS when settingsRow is null — no shop supplies, no
      // hazmat, statutory tax rate — so a failed read would email a figure that
      // is not what the customer was charged, with no human in the loop to catch
      // it. Throwing hands off to the catch below, which skips the email; the
      // two SMS blocks further down are separate try blocks and still run.
      if (settingsErr) {
        throw new Error(`shop_settings read failed: ${settingsErr.message}`);
      }

      const lineItems = (jobData.job_line_items || []) as {
        type: "labor" | "part";
        description: string;
        quantity: number;
        unit_cost: number;
      }[];

      const totals = calculateTotals(lineItems, settingsRow, jobData.charge_sales_tax);

      // The headline figure is what Stripe collected; the itemisation below is
      // recomputed here from current job_line_items and settings. Those two can
      // drift — nothing locks line items once a job is invoiced, and an invoice
      // can sit unpaid for 30 days — and a receipt whose parts contradict its
      // own total is worse than no receipt. Refuse rather than render, same rule
      // as the settings read. A genuinely comped $0 invoice passes: both sides
      // compute to 0 and agree.
      const paidCents = stripeInvoice.amount_paid;
      const computedCents = Math.round(totals.grandTotal * 100);
      if (typeof paidCents !== "number" || computedCents !== paidCents) {
        throw new Error(
          `receipt total mismatch — computed ${computedCents}c, Stripe collected ${paidCents}c`
        );
      }

      // null means "no vehicle on this job", never "have one, couldn't name it".
      const vehicleDesc = vehicle
        ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
          vehicle.license_plate ||
          vehicle.vin ||
          "Vehicle on file"
        : null;

      const { subject, html } = paymentReceiptEmail({
        customerName: customer.id === WALK_IN_CUSTOMER_ID ? null : customer.first_name,
        jobTitle: jobData.title,
        vehicleDesc,
        // What Stripe actually collected, not a recomputation of it — matching
        // the parking branch above. The guard makes this equal to
        // totals.grandTotal, so headline and itemisation cannot disagree.
        amount: paidCents / 100,
        paymentMethod: "stripe",
        lineItems,
        totals,
      });

      const result = await sendEmail({ to: customer.email, subject, html });

      await logReceiptEmail(supabase, {
        customerId: customer.id,
        jobId,
        body: subject,
        sent: result.success,
        stripeInvoiceId: stripeInvoice.id,
      });

      // sendEmail RETURNS { success: false } on a Resend error rather than
      // throwing, so the catch below never sees the most likely way a receipt
      // fails — a bounce, a rate limit, a 5xx. Without this the only trace is a
      // messages row nobody queries.
      if (!result.success) {
        Sentry.captureException(new Error(`receipt email not delivered: ${result.error}`), {
          level: "error",
          tags: { source: "stripe-webhook", path: "receipt-email-delivery" },
          extra: { stripeInvoiceId: stripeInvoice.id, customerId: customer.id, jobId },
        });
      }
    } catch (err) {
      // A receipt suppressed on a payment that cleared is not a warning — the
      // money moved and the customer has nothing. Error level so it clears
      // alerting thresholds.
      console.error("Failed to send receipt email:", err);
      Sentry.captureException(err, {
        level: "error",
        tags: { source: "stripe-webhook", path: "receipt-email" },
        extra: { stripeInvoiceId: stripeInvoice.id, customerId: customer.id, jobId },
      });
      // Record the attempt. Without a row the customer timeline is
      // indistinguishable from "this customer has no email on file", so nobody
      // can tell a receipt was owed and never went.
      await logReceiptEmail(supabase, {
        customerId: customer.id,
        jobId,
        body: "Payment receipt — not sent",
        sent: false,
        stripeInvoiceId: stripeInvoice.id,
      });
    }
  }

  // Customer payment confirmation SMS (fire-and-forget)
  if (customer.phone && amount) {
    try {
      const to = toE164(customer.phone);
      if (to) {
        const shopPhone = getPhoneNumber("shop");
        const smsBody = paymentReceivedSMS({
          firstName: customer.first_name,
          amount,
          year: vehicle?.year,
          make: vehicle?.make,
          model: vehicle?.model,
        });
        await sendSMS({ to, body: smsBody, from: shopPhone });
        await supabase.from("messages").insert({
          customer_id: customer.id,
          job_id: jobId,
          channel: "sms" as const,
          direction: "out" as const,
          body: smsBody,
          phone_line: "shop",
        });
      }
    } catch (err) {
      console.error("Failed to send payment SMS:", err);
      Sentry.captureException(err, {
        level: "warning",
        tags: { source: "stripe-webhook", path: "payment-sms" },
        extra: { stripeInvoiceId: stripeInvoice.id, customerId: customer.id, jobId },
      });
    }
  }

  // Internal notification to shop owners (fire-and-forget)
  if (amount) {
    const notifyPhones = process.env.INTERNAL_NOTIFICATION_PHONES;
    if (notifyPhones) {
      try {
        const shopPhone = getPhoneNumber("shop");
        const internalBody = paymentReceivedInternalSMS({
          firstName: customer.first_name,
          lastName: customer.last_name,
          amount,
          year: vehicle?.year,
          make: vehicle?.make,
          model: vehicle?.model,
        });
        const phones = notifyPhones
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        await Promise.all(
          phones.map((phone) =>
            sendSMS({ to: phone, body: internalBody, from: shopPhone }).catch(
              (err) => {
                console.error(
                  `[Stripe] Internal payment SMS to ${phone} failed:`,
                  err
                );
                Sentry.captureException(err, {
                  level: "warning",
                  tags: { source: "stripe-webhook", path: "internal-notify-fanout" },
                  extra: { stripeInvoiceId: stripeInvoice.id, phone },
                });
              }
            )
          )
        );
      } catch (err) {
        console.error("Failed to send internal payment SMS:", err);
        Sentry.captureException(err, {
          level: "warning",
          tags: { source: "stripe-webhook", path: "internal-notify-sms" },
          extra: { stripeInvoiceId: stripeInvoice.id, jobId },
        });
      }
    }
  }

  return true;
}

// Stripe's amount_refunded is absolute. The write only moves the figure up, so
// a redelivery or an out-of-order partial-refund event can't lower it.
async function handleChargeRefunded(charge: Stripe.Charge): Promise<boolean> {
  const supabase = createAdminClient();
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  const refunded = `$${(charge.amount_refunded / 100).toFixed(2)}`;

  const found = await findJobForPaymentIntent(supabase, paymentIntentId);
  if (!found.ok) return false;

  if (!found.job) {
    Sentry.captureMessage("stripe_webhook_refund_unmatched", {
      level: "warning",
      tags: { source: "stripe-webhook", path: "refund-unmatched" },
      extra: { chargeId: charge.id, paymentIntentId, amountRefunded: charge.amount_refunded },
    });
    await notifyOwners(
      `ShopPilot: Stripe refund of ${refunded} could not be matched to a job. Record it by hand.`,
      "stripe-webhook"
    );
    return true;
  }

  const refundedDollars = charge.amount_refunded / 100;
  const { data: updated, error } = await supabase
    .from("jobs")
    .update({
      refunded_amount: refundedDollars,
      refunded_at: new Date().toISOString(),
    })
    .eq("id", found.job.id)
    .or(`refunded_amount.is.null,refunded_amount.lt.${refundedDollars}`)
    .select("id")
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { source: "stripe-webhook", path: "refund-record" },
      extra: { chargeId: charge.id, jobId: found.job.id },
    });
    return false;
  }

  // Zero rows: the figure on the job already covers this event (redelivery,
  // or a later partial refund that arrived first). Nothing new to report.
  if (!updated) return true;

  await notifyOwners(
    refundRecordedSMS({ roNumber: found.job.ro_number, amount: refunded }),
    "stripe-webhook"
  );
  return true;
}

async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const supabase = createAdminClient();
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id ?? null;
  const found = await findJobForPaymentIntent(supabase, paymentIntentId);
  const roNumber = found.ok ? (found.job?.ro_number ?? null) : null;

  Sentry.captureMessage("stripe_webhook_dispute_opened", {
    level: "error",
    tags: { source: "stripe-webhook", path: "dispute-created" },
    extra: {
      disputeId: dispute.id,
      paymentIntentId,
      amount: dispute.amount,
      reason: dispute.reason,
      roNumber,
    },
  });
  await notifyOwners(
    disputeOpenedSMS({
      roNumber,
      amount: `$${(dispute.amount / 100).toFixed(2)}`,
      reason: dispute.reason,
    }),
    "stripe-webhook"
  );
}

// A card-reader charge carries the PaymentIntent on the job itself. An invoice
// payment's PaymentIntent is only known to Stripe, so it is resolved through
// the invoice it paid and then our invoices row.
async function findJobForPaymentIntent(
  supabase: ReturnType<typeof createAdminClient>,
  paymentIntentId: string | null
): Promise<
  { ok: true; job: { id: string; ro_number: number | null } | null } | { ok: false }
> {
  if (!paymentIntentId) return { ok: true, job: null };

  const { data: byPi, error: piError } = await supabase
    .from("jobs")
    .select("id, ro_number")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (piError) {
    Sentry.captureException(piError, {
      tags: { source: "stripe-webhook", path: "find-job-by-payment-intent" },
      extra: { paymentIntentId },
    });
    return { ok: false };
  }
  if (byPi) return { ok: true, job: byPi };

  let stripeInvoiceId: string | null = null;
  try {
    const stripe = getStripe();
    const payments = await stripe.invoicePayments.list({
      payment: { type: "payment_intent", payment_intent: paymentIntentId },
      limit: 1,
    });
    const inv = payments.data[0]?.invoice;
    stripeInvoiceId = typeof inv === "string" ? inv : inv?.id ?? null;
  } catch (err) {
    const transient = isTransientStripeError(err);
    Sentry.captureException(err, {
      level: transient ? "warning" : "error",
      tags: { source: "stripe-webhook", path: "find-invoice-for-payment-intent", transient: String(transient) },
      extra: { paymentIntentId },
    });
    // A transient failure must not turn a matchable refund into "unmatched"
    // for good; a non-2xx gets the event redelivered.
    return transient ? { ok: false } : { ok: true, job: null };
  }
  if (!stripeInvoiceId) return { ok: true, job: null };

  const { data: row, error: rowError } = await supabase
    .from("invoices")
    .select("job_id")
    .eq("stripe_invoice_id", stripeInvoiceId)
    .maybeSingle();
  if (rowError) {
    Sentry.captureException(rowError, {
      tags: { source: "stripe-webhook", path: "find-job-by-invoice" },
      extra: { paymentIntentId, stripeInvoiceId },
    });
    return { ok: false };
  }
  if (!row?.job_id) return { ok: true, job: null };

  const { data: byInvoice, error: jobError } = await supabase
    .from("jobs")
    .select("id, ro_number")
    .eq("id", row.job_id)
    .maybeSingle();
  if (jobError) {
    Sentry.captureException(jobError, {
      tags: { source: "stripe-webhook", path: "find-job-by-invoice-job" },
      extra: { paymentIntentId, stripeInvoiceId, jobId: row.job_id },
    });
    return { ok: false };
  }
  return { ok: true, job: byInvoice ?? null };
}
