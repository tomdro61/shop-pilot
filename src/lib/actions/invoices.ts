"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { createStripeInvoice } from "@/lib/stripe/create-invoice";
import { getShopSettings } from "@/lib/actions/settings";
import { revalidatePath } from "next/cache";

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

export async function createInvoiceFromJob(jobId: string) {
  const supabase = await createClient();

  // Get job with relations
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, first_name, last_name, email, phone, stripe_customer_id), job_line_items(*)"
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

  if (!customer.email) {
    return { error: "Customer must have an email address for invoicing" };
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

  // Get or create Stripe customer
  const stripeResult = await getOrCreateStripeCustomer(customer.id);
  if (stripeResult.error || !stripeResult.data) {
    return { error: stripeResult.error || "Failed to get Stripe customer" };
  }

  // Create Stripe invoice with current shop settings
  const shopSettings = await getShopSettings();
  try {
    const { stripeInvoiceId, hostedInvoiceUrl, amountDue } =
      await createStripeInvoice({
        stripeCustomerId: stripeResult.data,
        lineItems,
        jobCategory: derivedCategory !== "Uncategorized" ? derivedCategory : null,
        settings: shopSettings,
      });

    // Insert invoice record
    const { data: invoice, error: insertError } = await supabase
      .from("invoices")
      .insert({
        job_id: jobId,
        stripe_invoice_id: stripeInvoiceId,
        stripe_hosted_invoice_url: hostedInvoiceUrl,
        status: "sent",
        amount: amountDue / 100, // Convert cents to dollars
      })
      .select()
      .single();

    if (insertError) {
      return { error: "Invoice created in Stripe but failed to save locally" };
    }

    // Fire-and-forget SMS with payment link
    if (customer.phone && hostedInvoiceUrl) {
      import("@/lib/actions/messages")
        .then(({ sendCustomerSMS }) =>
          sendCustomerSMS({
            customerId: customer.id,
            body: `Hi ${customer.first_name}, your invoice from Broadway Motors is ready. Pay here: ${hostedInvoiceUrl}`,
            jobId,
          })
        )
        .catch((err) => console.error("Failed to send invoice SMS:", err));
    }

    revalidatePath(`/jobs/${jobId}`);
    return { data: invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Stripe invoice";
    return { error: message };
  }
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
