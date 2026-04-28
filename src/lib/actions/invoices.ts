"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { createStripeInvoice, createParkingStripeInvoice } from "@/lib/stripe/create-invoice";
import { getShopSettings } from "@/lib/actions/settings";
import { revalidatePath } from "next/cache";
import { getParkingLine, getPhoneNumber } from "@/lib/quo/routing";

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
  const sendText = options?.sendText ?? false;
  const sendEmail = options?.sendEmail ?? false;

  const supabase = await createClient();

  // Get job with relations
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, first_name, last_name, email, phone, stripe_customer_id), vehicles(year, make, model), job_line_items(*)"
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { error: "Job not found" };
  }

  if (job.status !== "complete") {
    return { error: "Job must be complete before creating an invoice" };
  }

  // Check for existing invoice
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

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
  } | null;

  if (!customer) {
    return { error: "Job has no customer" };
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

    await supabase
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", customer.id);
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

export async function getInvoices(status?: string, search?: string) {
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

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  let invoices = data ?? [];

  // Client-side search filter (customer name from job or parking reservation)
  if (search) {
    const term = search.toLowerCase();
    invoices = invoices.filter((inv) => {
      // Check job customer name
      const job = inv.jobs as { customers: { first_name: string; last_name: string } | null } | null;
      const jobCustomer = job?.customers;
      if (jobCustomer) {
        const fullName = `${jobCustomer.first_name} ${jobCustomer.last_name}`.toLowerCase();
        if (fullName.includes(term)) return true;
      }
      // Check parking reservation name
      const reservation = inv.parking_reservations as { first_name: string; last_name: string } | null;
      if (reservation) {
        const fullName = `${reservation.first_name} ${reservation.last_name}`.toLowerCase();
        if (fullName.includes(term)) return true;
      }
      return false;
    });
  }

  return invoices;
}

export async function getInvoiceForJob(jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) return null;
  return data;
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
