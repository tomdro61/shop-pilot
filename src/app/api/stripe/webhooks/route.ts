import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
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
    await handleInvoicePaid(stripeInvoice);
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.job_id) {
      await handleTerminalPayment(pi);
    }
  }

  return NextResponse.json({ received: true });
}

async function handleInvoicePaid(stripeInvoice: Stripe.Invoice) {
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
    return;
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
    return;
  }

  // Idempotency guard — Stripe retries webhooks until it gets a 2xx, and
  // duplicate delivery happens on reconnects. Without this, a second delivery
  // would re-fire the receipt email, customer SMS, and internal-notify SMS.
  if (invoice.status === "paid") return;

  // Atomic flip — `.eq("status", invoice.status)` makes the update conditional
  // on the row still being in the pre-paid state we read. Two concurrent
  // deliveries that both pass the guard above will both reach this point;
  // only the first transitions the row, and the second updates zero rows
  // (we bail out below).
  const { data: updated, error: updateErr } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: "stripe",
    })
    .eq("id", invoice.id)
    .eq("status", invoice.status)
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
    return;
  }
  if (!updated) {
    // Zero rows updated — another concurrent delivery already flipped this row
    // (atomic-flip race; expected behavior, not an error).
    return;
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
      return;
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

    return;
  }

  // ── Job invoice branch (existing flow) ──────────────────────────
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
    return;
  }

  // Update job payment tracking (don't change job status — payment is separate from workflow)
  const { error: jobUpdateErr } = await supabase
    .from("jobs")
    .update({
      payment_status: "paid",
      payment_method: "stripe",
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoice.job_id);

  if (jobUpdateErr) {
    console.error("[stripe webhook] handleInvoicePaid: failed to flip job payment_status", {
      stripeInvoiceId: stripeInvoice.id,
      jobId: invoice.job_id,
      error: jobUpdateErr,
    });
    Sentry.captureException(jobUpdateErr, {
      tags: { source: "stripe-webhook", path: "job-payment-status-flip" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId: invoice.job_id },
    });
    // Continue — still want to fire the receipt email/SMS so the customer
    // isn't left wondering. The local row will need manual reconciliation.
  }

  // Fetch job + customer + vehicle for SMS and email (admin client — no auth cookies in webhooks)
  const { data: jobData, error: jobFetchErr } = await supabase
    .from("jobs")
    .select(
      "id, title, payment_method, customers(id, first_name, last_name, email, phone), vehicles(year, make, model), job_line_items(type, description, quantity, unit_cost)"
    )
    .eq("id", invoice.job_id)
    .single();

  if (jobFetchErr || !jobData) {
    console.error("[stripe webhook] handleInvoicePaid: failed to fetch job for receipt", {
      stripeInvoiceId: stripeInvoice.id,
      jobId: invoice.job_id,
      error: jobFetchErr,
    });
    Sentry.captureException(jobFetchErr ?? new Error("Job missing for paid invoice"), {
      tags: { source: "stripe-webhook", path: "job-fetch-for-receipt" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId: invoice.job_id },
    });
    return;
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
  } | null;

  if (!customer) {
    console.warn("[stripe webhook] handleInvoicePaid: paid job has no customer — receipt not sent", {
      stripeInvoiceId: stripeInvoice.id,
      jobId: invoice.job_id,
    });
    Sentry.captureMessage("stripe_webhook_paid_job_no_customer", {
      level: "warning",
      tags: { source: "stripe-webhook" },
      extra: { stripeInvoiceId: stripeInvoice.id, jobId: invoice.job_id },
    });
    return;
  }

  // Receipt email (fire-and-forget)
  if (customer.email) {
    try {
      const { data: settingsRow } = await supabase
        .from("shop_settings")
        .select("*")
        .limit(1)
        .single();

      const lineItems = (jobData.job_line_items || []) as {
        type: "labor" | "part";
        description: string;
        quantity: number;
        unit_cost: number;
      }[];

      const totals = calculateTotals(lineItems, settingsRow);
      const vehicleDesc = vehicle
        ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
        : "Vehicle";

      const { subject, html } = paymentReceiptEmail({
        customerName: customer.first_name,
        jobTitle: jobData.title,
        vehicleDesc,
        amount: totals.grandTotal,
        paymentMethod: jobData.payment_method || "stripe",
        lineItems,
        totals,
      });

      const result = await sendEmail({ to: customer.email, subject, html });

      await supabase.from("messages").insert({
        customer_id: customer.id,
        job_id: invoice.job_id,
        channel: "email" as const,
        direction: "out" as const,
        body: subject,
        status: result.success ? "sent" : "failed",
      });
    } catch (err) {
      console.error("Failed to send receipt email:", err);
      Sentry.captureException(err, {
        level: "warning",
        tags: { source: "stripe-webhook", path: "receipt-email" },
        extra: { stripeInvoiceId: stripeInvoice.id, customerId: customer.id, jobId: invoice.job_id },
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
          job_id: invoice.job_id,
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
        extra: { stripeInvoiceId: stripeInvoice.id, customerId: customer.id, jobId: invoice.job_id },
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
          extra: { stripeInvoiceId: stripeInvoice.id, jobId: invoice.job_id },
        });
      }
    }
  }
}

async function handleTerminalPayment(pi: Stripe.PaymentIntent) {
  const supabase = createAdminClient();
  const jobId = pi.metadata.job_id;

  const { error } = await supabase
    .from("jobs")
    .update({
      payment_status: "paid",
      payment_method: "terminal",
      stripe_payment_intent_id: pi.id,
      paid_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", jobId);

  if (error) {
    console.error("[Webhook] Failed to update job payment status:", error, "jobId:", jobId);
    Sentry.captureException(error, {
      tags: { source: "stripe-webhook", path: "terminal-payment-job-flip" },
      extra: { jobId, paymentIntentId: pi.id },
    });
  } else {
    console.log("[Webhook] Terminal payment recorded for job:", jobId);
  }
}
