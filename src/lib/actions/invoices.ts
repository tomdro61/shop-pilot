"use server";

import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createStripeInvoice, createParkingStripeInvoice } from "@/lib/stripe/create-invoice";
import { getShopSettings } from "@/lib/actions/settings";
import { revalidatePath } from "next/cache";
import { getParkingLine } from "@/lib/quo/routing";
import { sendCustomerSMS } from "@/lib/actions/messages";
import { sendCustomerEmail } from "@/lib/actions/email";
import { invoiceReminderSMS, invoiceSentSMS } from "@/lib/messaging/templates";
import { invoiceReadyEmail } from "@/lib/resend/templates";
import { isFirstDelivery } from "@/lib/invoices/delivery";

export async function getOrCreateStripeCustomer(customerId: string) {
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, email, phone, stripe_customer_id")
    .eq("id", customerId)
    .single();

  if (error || !customer) {
    return { error: "Customer not found" };
  }

  // Return existing Stripe customer if we have one
  if (customer.stripe_customer_id) {
    return { data: customer.stripe_customer_id };
  }

  // Create new Stripe customer
  const stripe = getStripe();
  const stripeCustomer = await stripe.customers.create({
    name: `${customer.first_name} ${customer.last_name}`,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    metadata: { supabase_customer_id: customer.id },
  });

  // Store the Stripe customer ID
  const { error: updateError } = await supabase
    .from("customers")
    .update({ stripe_customer_id: stripeCustomer.id })
    .eq("id", customerId);

  if (updateError) {
    return { error: "Failed to save Stripe customer ID" };
  }

  return { data: stripeCustomer.id };
}

export async function createInvoiceFromJob(
  jobId: string,
  options?: { sendText?: boolean; sendEmail?: boolean }
) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const sendText = options?.sendText ?? false;
  const sendEmail = options?.sendEmail ?? false;

  const supabase = await createClient();

  // Get job with relations
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, first_name, last_name, email, phone, stripe_customer_id, customer_type), vehicles(year, make, model), job_line_items(*)"
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { error: "Job not found" };
  }

  if (job.status !== "complete") {
    return { error: "Job must be complete before creating an invoice" };
  }

  // Same guard, and for the same reason, as resendInvoiceForJob: recordPayment
  // and both terminal paths update `jobs` only, so a job settled in cash keeps
  // an unpaid invoice row and Stripe never learns about it. Without this,
  // "Create & Send" bills and texts a live payment link to a customer who
  // already paid at the counter. 'invoiced' is allowed — it means billed and
  // still owed.
  if (job.payment_status === "paid") {
    return { error: "This job is already marked paid — no invoice created." };
  }
  if (job.payment_status === "waived") {
    return { error: "Payment on this job was waived — no invoice created." };
  }

  // Check for existing invoice. The error MUST be checked — if this query
  // fails, existingInvoice is null and the guard passes, leading to a
  // duplicate Stripe invoice for the same job (customer billed twice).
  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    return { error: `Could not check for existing invoice: ${existingError.message}` };
  }
  if (existingInvoice) {
    return { error: "An invoice already exists for this job" };
  }

  const customer = job.customers as {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    stripe_customer_id: string | null;
    customer_type: string | null;
  } | null;

  if (!customer) {
    return { error: "Job has no customer" };
  }

  // Fleet accounts are billed off-platform. This was a UI-only convention until
  // now — InvoiceSection hid the Create card, but nothing stopped the action, so
  // the AI tool `create_invoice_from_job` could still bill a fleet account.
  if (customer.customer_type === "fleet") {
    return { error: "Fleet accounts are billed off-platform — no invoice created." };
  }

  const lineItems = (job.job_line_items || []) as {
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
    category: string | null;
  }[];

  if (lineItems.length === 0) {
    return { error: "Job has no line items" };
  }

  // Derive category from line items for invoice description
  const catTotals: Record<string, number> = {};
  lineItems.forEach((li) => {
    const cat = li.category || "Uncategorized";
    catTotals[cat] = (catTotals[cat] || 0) + (li.quantity * li.unit_cost);
  });
  const derivedCategory = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Get or create Stripe customer (with stale ID verification)
  const stripe = getStripe();
  let stripeCustomerId = customer.stripe_customer_id;

  if (stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(stripeCustomerId);
      if ((existing as { deleted?: boolean }).deleted) {
        stripeCustomerId = null;
      }
    } catch (err) {
      // Stripe sets code "resource_missing" specifically for 404. Other errors
      // (rate limit, network, auth) must surface — silently treating them as
      // missing creates duplicate Stripe customers.
      if ((err as { code?: string } | null)?.code === "resource_missing") {
        stripeCustomerId = null;
      } else {
        const message = err instanceof Error ? err.message : "Failed to verify Stripe customer";
        return { error: message };
      }
    }
  }

  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      name: `${customer.first_name} ${customer.last_name}`,
      email: customer.email || undefined,
      phone: customer.phone || undefined,
      metadata: { supabase_customer_id: customer.id },
    });
    stripeCustomerId = stripeCustomer.id;

    const { error: customerUpdateError } = await supabase
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", customer.id);
    if (customerUpdateError) {
      // Non-fatal: the Stripe customer exists; we just failed to record its
      // ID locally. Future invoice creation will create a duplicate Stripe
      // customer until this is reconciled. Log loudly for manual fix.
      console.error(
        "[createInvoiceFromJob] failed to save stripe_customer_id locally:",
        customerUpdateError,
        { customerId: customer.id, stripeCustomerId }
      );
    }
  }

  // Create Stripe invoice with current shop settings
  const shopSettings = await getShopSettings();
  try {
    const { stripeInvoiceId, hostedInvoiceUrl, amountDue } =
      await createStripeInvoice({
        stripeCustomerId,
        lineItems,
        jobCategory: derivedCategory !== "Uncategorized" ? derivedCategory : null,
        settings: shopSettings,
        hasEmail: !!customer.email,
        chargeSalesTax: job.charge_sales_tax,
      });

    const invoiceStatus = (sendText || sendEmail) ? "sent" : "draft";

    // Insert invoice record
    const { data: invoice, error: insertError } = await supabase
      .from("invoices")
      .insert({
        job_id: jobId,
        stripe_invoice_id: stripeInvoiceId,
        stripe_hosted_invoice_url: hostedInvoiceUrl,
        status: invoiceStatus,
        amount: amountDue / 100, // Convert cents to dollars
      })
      .select()
      .single();

    if (insertError) {
      return { error: "Invoice created in Stripe but failed to save locally" };
    }

    const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;

    // Send SMS with payment link if requested
    if (sendText && customer.phone && hostedInvoiceUrl) {
      import("@/lib/messaging/templates")
        .then(({ invoiceSentSMS }) =>
          import("@/lib/actions/messages").then(({ sendCustomerSMS }) =>
            sendCustomerSMS({
              customerId: customer.id,
              body: invoiceSentSMS({
                firstName: customer.first_name,
                year: vehicle?.year,
                make: vehicle?.make,
                model: vehicle?.model,
                link: hostedInvoiceUrl,
              }),
              jobId,
              line: "shop",
            })
          )
        )
        .catch((err) => console.error("Failed to send invoice SMS:", err));
    }

    // Send email with payment link if requested
    if (sendEmail && customer.email && hostedInvoiceUrl) {
      const vehicleDesc = vehicle
        ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
        : "Vehicle";

      import("@/lib/resend/templates")
        .then(({ invoiceReadyEmail }) => {
          const { subject, html } = invoiceReadyEmail({
            customerName: customer.first_name,
            vehicleDesc,
            jobTitle: job.title,
            paymentUrl: hostedInvoiceUrl,
            amount: amountDue / 100,
          });
          return import("@/lib/actions/email").then(({ sendCustomerEmail }) =>
            sendCustomerEmail({
              customerId: customer.id,
              subject,
              html,
              jobId,
            })
          );
        })
        .catch((err) => console.error("Failed to send invoice email:", err));
    }

    revalidatePath(`/jobs/${jobId}`);
    return { data: invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Stripe invoice";
    return { error: message };
  }
}

type ChannelResult = { sent: true; testMode?: boolean } | { sent: false; error: string };

export type ResendInvoiceResult =
  | { ok: false; error: string }
  | { ok: true; email?: ChannelResult; sms?: ChannelResult; stampWarning?: string };

interface ResendInvoiceParams {
  jobId: string;
  email: boolean;
  sms: boolean;
}

// Re-delivers an existing Stripe invoice's payment link to a customer who hasn't
// paid. Almost all of this function is refusals, and that is the point: the cost
// of a reminder that doesn't send is a second click, while the cost of one that
// shouldn't have sent is texting a live payment link to someone who already paid.
//
// Two invariants this must never break:
//   1. It never writes invoices.status = 'paid'. handleInvoicePaid owns that
//      transition and carries side effects (jobs.payment_status, receipt email,
//      customer SMS, owner notify) that a server action cannot replicate. Writing
//      it here trips the webhook's idempotency guard and those never run.
//   2. jobs.payment_status is checked BEFORE Stripe. Cash, check, Terminal, and
//      waived settlements update `jobs` only — they leave the local invoice row
//      at 'sent' and the Stripe invoice 'open' forever, so no amount of asking
//      Stripe will reveal them.
export async function resendInvoiceForJob({
  jobId,
  email,
  sms,
}: ResendInvoiceParams): Promise<ResendInvoiceResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!email && !sms) {
    return { ok: false, error: "Select at least one way to send the reminder" };
  }

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, title, payment_status, customers(id, first_name, email, phone, stripe_customer_id, customer_type), vehicles(year, make, model)"
    )
    .eq("id", jobId)
    .single();

  // A connection drop, statement timeout, or RLS denial is not "not found" —
  // reporting it as such is unactionable on a job the operator is looking at,
  // and would be the one path in this function with no telemetry.
  if (jobError) {
    Sentry.captureException(jobError, {
      tags: { source: "resend-invoice", path: "job-lookup" },
      extra: { jobId },
    });
    return { ok: false, error: "Couldn't load this job. Try again in a moment." };
  }
  if (!job) return { ok: false, error: "Job not found" };

  // See invariant 2 above. Deliberately NOT `!== "unpaid"` — 'invoiced' means
  // "billed, still owes", which is exactly who this feature exists to chase.
  if (job.payment_status === "paid") {
    return { ok: false, error: "This job is already marked paid — no reminder sent." };
  }
  if (job.payment_status === "waived") {
    return { ok: false, error: "Payment on this job was waived — no reminder sent." };
  }

  const customer = job.customers as {
    id: string;
    first_name: string;
    email: string | null;
    phone: string | null;
    stripe_customer_id: string | null;
    customer_type: string | null;
  } | null;

  if (!customer) return { ok: false, error: "This job has no customer on file." };

  // Fleet accounts are billed off-platform, but chargeCardOnFile still writes
  // them an invoices row — so reaching this point with a fleet customer is
  // possible and must not produce a consumer-style "pay here" text.
  if (customer.customer_type === "fleet") {
    return { ok: false, error: "Fleet accounts are billed off-platform — no reminder sent." };
  }

  // job_id has no unique constraint, so a race or a manual fix can leave two
  // rows — every creation path refuses when one already exists, so duplicates
  // are an artifact rather than a normal state. Ordered and limited rather than
  // .maybeSingle(), which returns an error (PGRST116) on multiple rows. Newest wins.
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, stripe_invoice_id, stripe_hosted_invoice_url, last_sent_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (invoiceError) {
    Sentry.captureException(invoiceError, {
      tags: { source: "resend-invoice", path: "invoice-lookup" },
      extra: { jobId },
    });
    return { ok: false, error: "Couldn't load this job's invoice. Try again in a moment." };
  }

  const invoice = invoiceRows?.[0];
  if (!invoice) return { ok: false, error: "This job has no invoice to resend." };

  if (invoiceRows.length > 1) {
    Sentry.captureMessage("resend_invoice_duplicate_rows", {
      level: "warning",
      tags: { source: "resend-invoice" },
      extra: { jobId, usingInvoiceId: invoice.id },
    });
  }

  // Both columns can be the empty string, not just null: createStripeInvoice
  // returns `|| ""` while chargeCardOnFile writes `|| null`. Truthiness, never
  // a null check.
  if (!invoice.stripe_invoice_id) {
    return {
      ok: false,
      error: "This invoice isn't linked to Stripe — create a new invoice for this job.",
    };
  }

  const stripe = getStripe();
  let stripeInvoice: Stripe.Invoice;
  try {
    stripeInvoice = await stripe.invoices.retrieve(invoice.stripe_invoice_id);
  } catch (err) {
    // Fail closed. Without confirming the balance we might nag someone who has
    // already paid, which is worse than a reminder that didn't go out. The two
    // branches are split because "this invoice is gone" needs a human while
    // "Stripe blipped" just needs another click.
    const missing =
      err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";
    Sentry.captureException(err, {
      level: missing ? "warning" : "error",
      tags: { source: "resend-invoice", path: "stripe-retrieve" },
      extra: { jobId, stripeInvoiceId: invoice.stripe_invoice_id },
    });
    return {
      ok: false,
      error: missing
        ? "This invoice no longer exists in Stripe — create a new invoice for this job."
        : "Couldn't reach Stripe to confirm the balance. Nothing was sent — try again in a moment.",
    };
  }

  if (stripeInvoice.status === "paid") {
    // Writes nothing — see invariant 1. Only flag it when the payment is old
    // enough that normal webhook delivery lag can't explain the local row still
    // being unpaid; a fresh payment here is just latency, not an incident.
    const paidAtSeconds = stripeInvoice.status_transitions?.paid_at;
    if (paidAtSeconds && Date.now() / 1000 - paidAtSeconds > 600) {
      Sentry.captureMessage("resend_invoice_webhook_lag", {
        level: "warning",
        tags: { source: "resend-invoice" },
        extra: { jobId, stripeInvoiceId: invoice.stripe_invoice_id, paidAtSeconds },
      });
    }
    return {
      ok: false,
      error:
        "Stripe shows this invoice as already paid — refresh in a moment. If it still shows unpaid, record the payment on the job.",
    };
  }

  if (stripeInvoice.status === "void" || stripeInvoice.status === "uncollectible") {
    return {
      ok: false,
      error: `This invoice was marked ${stripeInvoice.status} in Stripe — create a new invoice for this job.`,
    };
  }

  // status is nullable in the SDK type; anything that isn't a payable state
  // falls through to here rather than being assumed sendable.
  if (stripeInvoice.status !== "open" && stripeInvoice.status !== "draft") {
    return { ok: false, error: "This invoice isn't in a payable state in Stripe." };
  }

  // Bind recipient to invoice. A job's customer_id is editable after invoicing
  // (EDITABLE_KEYS, with no invoice lock) and the hosted URL is an unauthenticated
  // bearer link showing the billed customer's name, address, and line items — so
  // sending it to whoever the job points at *now* can disclose someone else's data.
  const invoiceCustomerId =
    typeof stripeInvoice.customer === "string"
      ? stripeInvoice.customer
      : stripeInvoice.customer?.id ?? null;

  if (!invoiceCustomerId || !customer.stripe_customer_id) {
    // Not necessarily a mismatch: createInvoiceFromJob treats a failed write of
    // stripe_customer_id as non-fatal, so a valid invoice can sit against a
    // customer row with a null id. Don't tell the shop to void a good invoice.
    Sentry.captureMessage("resend_invoice_customer_unverifiable", {
      level: "warning",
      tags: { source: "resend-invoice" },
      extra: { jobId, invoiceCustomerId, localStripeCustomerId: customer.stripe_customer_id },
    });
    return {
      ok: false,
      error:
        "Couldn't confirm this invoice belongs to the customer on file. Open it in Stripe and send from there.",
    };
  }

  if (invoiceCustomerId !== customer.stripe_customer_id) {
    Sentry.captureMessage("resend_invoice_customer_mismatch", {
      level: "error",
      tags: { source: "resend-invoice" },
      extra: { jobId, invoiceCustomerId, localStripeCustomerId: customer.stripe_customer_id },
    });
    return {
      ok: false,
      error:
        "This invoice was issued to a different customer — void it in Stripe and create a new invoice for this job.",
    };
  }

  // An invoice set to auto-charge a saved card isn't something to send a payment
  // link for. Deliberately not gated on collection_method, which is
  // charge_automatically for every emailless customer — the core audience here.
  if (stripeInvoice.default_payment_method) {
    return {
      ok: false,
      error:
        "This invoice auto-charges a card on file — retry the charge or collect on the Terminal instead of sending a payment link.",
    };
  }

  // Prefer the live URL: it also recovers the case where the stored column was
  // written as an empty string.
  const hostedUrl = stripeInvoice.hosted_invoice_url || invoice.stripe_hosted_invoice_url;
  if (!hostedUrl) {
    return { ok: false, error: "This invoice has no payment link — open it in Stripe." };
  }

  // amount_remaining, not amount_due: amount_due is fixed at finalization and
  // does not shrink after a partial payment or an account credit.
  const balance =
    stripeInvoice.amount_remaining != null ? stripeInvoice.amount_remaining / 100 : null;

  // An invoice created with no channels selected was never delivered, so its
  // first "resend" is genuinely the customer's first contact about this bill and
  // gets first-send copy. See isFirstDelivery for what this can and can't detect.
  const neverSent = isFirstDelivery(invoice);

  const vehicle = job.vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;

  const result: { email?: ChannelResult; sms?: ChannelResult } = {};

  // Each channel is isolated so a Resend outage can't stop the text going out,
  // and awaited so the caller learns what actually happened — unlike the
  // fire-and-forget sends in createInvoiceFromJob, which can't report anything.
  if (sms) {
    try {
      const body = neverSent
        ? invoiceSentSMS({
            firstName: customer.first_name,
            year: vehicle?.year,
            make: vehicle?.make,
            model: vehicle?.model,
            link: hostedUrl,
          })
        : invoiceReminderSMS({
            firstName: customer.first_name,
            year: vehicle?.year,
            make: vehicle?.make,
            model: vehicle?.model,
            amount: balance,
            link: hostedUrl,
          });
      const r = await sendCustomerSMS({ customerId: customer.id, body, jobId, line: "shop" });
      result.sms =
        "data" in r ? { sent: true, testMode: r.data?.testMode } : { sent: false, error: r.error };
    } catch (e) {
      result.sms = {
        sent: false,
        error: e instanceof Error ? e.message : "Couldn't send the text",
      };
    }
  }

  if (email) {
    try {
      const vehicleDesc =
        [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Vehicle";
      const { subject, html } = invoiceReadyEmail({
        customerName: customer.first_name,
        vehicleDesc,
        jobTitle: job.title,
        paymentUrl: hostedUrl,
        amount: balance ?? 0,
        reminder: !neverSent,
      });
      const r = await sendCustomerEmail({ customerId: customer.id, subject, html, jobId });
      result.email = r.sent
        ? { sent: true, testMode: r.testMode }
        : { sent: false, error: r.error ?? "Couldn't send the email" };
    } catch (e) {
      result.email = {
        sent: false,
        error: e instanceof Error ? e.message : "Couldn't send the email",
      };
    }
  }

  // `ok` must mean "the customer received something". Returning ok:true for a
  // send where every channel failed pushes the real check onto each caller, and
  // `if (result.ok) toast.success("Sent")` compiles and lies.
  const anySent = result.sms?.sent === true || result.email?.sent === true;
  if (!anySent) {
    const reasons = [result.sms, result.email]
      .filter((r): r is { sent: false; error: string } => r?.sent === false)
      .map((r) => r.error);
    return {
      ok: false,
      error: reasons.length ? `Couldn't send: ${reasons.join("; ")}` : "Nothing was sent.",
    };
  }

  // Bookkeeping runs as two independent statements, and neither can fail the
  // call. The message is already gone; reporting failure here would invite a
  // retry that texts the customer twice — the exact outcome this feature exists
  // to prevent. Surfaced as a warning alongside sent: true instead.
  // Accumulated, not a single slot: both writes usually fail for the same reason,
  // and the last_sent_at half is the one that governs the duplicate-send throttle
  // — it must not be overwritten by the status half.
  const warnings: string[] = [];

  const { error: stampError } = await supabase
    .from("invoices")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .neq("status", "paid"); // never fight handleInvoicePaid

  if (stampError) {
    Sentry.captureException(stampError, {
      tags: { source: "resend-invoice", path: "last-sent-stamp" },
      extra: { jobId, invoiceId: invoice.id },
    });
    warnings.push("couldn't record the send time");
  }

  if (invoice.status === "draft") {
    const { error: statusError } = await supabase
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", invoice.id)
      .eq("status", "draft");

    if (statusError) {
      Sentry.captureException(statusError, {
        tags: { source: "resend-invoice", path: "draft-to-sent" },
        extra: { jobId, invoiceId: invoice.id },
      });
      warnings.push("couldn't update the invoice status");
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/invoices");

  return {
    ok: true,
    ...result,
    stampWarning: warnings.length ? `Sent, but ${warnings.join(" and ")}.` : undefined,
  };
}

export async function getInvoices(status?: string, search?: string, source?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(
      "id, job_id, parking_reservation_id, stripe_invoice_id, stripe_hosted_invoice_url, status, amount, paid_at, created_at, jobs(id, title, customers(id, first_name, last_name), vehicles(year, make, model)), parking_reservations(id, customer_id, first_name, last_name, lot)"
    )
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status as "draft" | "sent" | "paid");
  }

  const normalizedSource = source === "parking" || source === "jobs" ? source : null;
  if (normalizedSource === "parking") {
    query = query.not("parking_reservation_id", "is", null);
  } else if (normalizedSource === "jobs") {
    query = query.not("job_id", "is", null);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  let invoices = data ?? [];

  if (search) {
    const term = search.toLowerCase();
    invoices = invoices.filter((inv) => {
      const job = inv.jobs as { customers: { first_name: string; last_name: string } | null } | null;
      const jobCustomer = job?.customers;
      if (jobCustomer) {
        const fullName = `${jobCustomer.first_name} ${jobCustomer.last_name}`.toLowerCase();
        if (fullName.includes(term)) return true;
      }
      const reservation = inv.parking_reservations as { first_name: string; last_name: string; lot: string } | null;
      if (reservation) {
        const fullName = `${reservation.first_name} ${reservation.last_name}`.toLowerCase();
        if (fullName.includes(term)) return true;
        if (reservation.lot?.toLowerCase().includes(term)) return true;
      }
      return false;
    });
  }

  return invoices;
}

// `job_id` has no unique constraint, so a race or a manual fix can leave two
// rows. `.maybeSingle()` returns an error in that case, and swallowing it here
// used to hide the invoice card entirely — which showed "Ready to invoice →
// Create" for a job that already had one, inviting a duplicate Stripe invoice.
// Ordered + limited instead, matching resendInvoiceForJob: newest wins.
export async function getInvoiceForJob(jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    Sentry.captureException(error, {
      tags: { source: "invoices", path: "get-invoice-for-job" },
      extra: { jobId },
    });
    throw new Error(`Failed to load the invoice for this job: ${error.message}`);
  }
  return data?.[0] ?? null;
}

export async function getInvoicesForParkingReservation(reservationId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("parking_reservation_id", reservationId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data ?? [];
}

export async function createParkingInvoice(
  reservationId: string,
  lineItems: { description: string; amount: number }[],
  options?: { sendText?: boolean; sendEmail?: boolean }
) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const sendText = options?.sendText ?? false;
  const sendEmail = options?.sendEmail ?? false;

  const supabase = await createClient();

  // Fetch reservation + linked customer
  const { data: reservation, error: resError } = await supabase
    .from("parking_reservations")
    .select("id, first_name, last_name, lot, customer_id, phone, email")
    .eq("id", reservationId)
    .single();

  if (resError || !reservation) {
    return { error: "Reservation not found" };
  }

  if (!reservation.customer_id) {
    return { error: "Reservation has no linked customer" };
  }

  if (lineItems.length === 0) {
    return { error: "At least one line item is required" };
  }

  // Get or create Stripe customer
  const stripeResult = await getOrCreateStripeCustomer(reservation.customer_id);
  if (stripeResult.error || !stripeResult.data) {
    return { error: stripeResult.error || "Failed to get Stripe customer" };
  }
  const stripeCustomerId = stripeResult.data;

  try {
    const { stripeInvoiceId, hostedInvoiceUrl, amountDue } =
      await createParkingStripeInvoice({
        stripeCustomerId,
        lineItems,
        description: `Parking — ${reservation.lot}`,
        hasEmail: !!reservation.email,
      });

    const invoiceStatus = (sendText || sendEmail) ? "sent" : "draft";

    const { data: invoice, error: insertError } = await supabase
      .from("invoices")
      .insert({
        job_id: null,
        parking_reservation_id: reservationId,
        stripe_invoice_id: stripeInvoiceId,
        stripe_hosted_invoice_url: hostedInvoiceUrl,
        status: invoiceStatus,
        amount: amountDue / 100,
      })
      .select()
      .single();

    if (insertError) {
      return { error: "Invoice created in Stripe but failed to save locally" };
    }

    const parkingLine = getParkingLine(reservation.lot);

    // Send SMS (fire-and-forget)
    if (sendText && reservation.phone && hostedInvoiceUrl) {
      import("@/lib/messaging/templates")
        .then(({ invoiceSentSMS }) =>
          import("@/lib/actions/messages").then(({ sendCustomerSMS }) =>
            sendCustomerSMS({
              customerId: reservation.customer_id!,
              body: invoiceSentSMS({
                firstName: reservation.first_name,
                link: hostedInvoiceUrl,
              }),
              line: parkingLine,
            })
          )
        )
        .catch((err) => console.error("Failed to send parking invoice SMS:", err));
    }

    // Send email (fire-and-forget)
    if (sendEmail && reservation.email && hostedInvoiceUrl) {
      import("@/lib/resend/templates")
        .then(({ invoiceReadyEmail }) => {
          const { subject, html } = invoiceReadyEmail({
            customerName: reservation.first_name,
            vehicleDesc: reservation.lot,
            jobTitle: null,
            paymentUrl: hostedInvoiceUrl,
            amount: amountDue / 100,
            contextLabel: "Location",
          });
          return import("@/lib/actions/email").then(({ sendCustomerEmail }) =>
            sendCustomerEmail({
              customerId: reservation.customer_id!,
              subject,
              html,
            })
          );
        })
        .catch((err) => console.error("Failed to send parking invoice email:", err));
    }

    revalidatePath(`/parking/${reservationId}`);
    revalidatePath("/invoices");
    return { data: invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Stripe invoice";
    return { error: message };
  }
}
