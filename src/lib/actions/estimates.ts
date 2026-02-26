"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  estimateLineItemSchema,
  prepareEstimateLineItemData,
} from "@/lib/validators/estimate";
import { getOrCreateStripeCustomer } from "./invoices";
import { createStripeInvoice } from "@/lib/stripe/create-invoice";
import { revalidatePath } from "next/cache";
import { getShopSettings } from "@/lib/actions/settings";
import type { EstimateLineItemFormData } from "@/lib/validators/estimate";
import crypto from "crypto";

export async function createEstimateFromJob(jobId: string) {
  const supabase = await createClient();

  // Check for existing estimate
  const { data: existing } = await supabase
    .from("estimates")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing) {
    return { error: "An estimate already exists for this job" };
  }

  // Get job line items to copy and current settings
  const [{ data: lineItems }, settings] = await Promise.all([
    supabase.from("job_line_items").select("*").eq("job_id", jobId),
    getShopSettings(),
  ]);

  // Create estimate with current tax rate from settings
  const { data: estimate, error } = await supabase
    .from("estimates")
    .insert({
      job_id: jobId,
      status: "draft",
      tax_rate: settings?.tax_rate ?? 0.0625,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Copy line items
  if (lineItems && lineItems.length > 0) {
    const estimateLineItems = lineItems.map((li) => ({
      estimate_id: estimate.id,
      type: li.type,
      description: li.description,
      quantity: li.quantity,
      unit_cost: li.unit_cost,
      part_number: li.part_number,
    }));

    await supabase.from("estimate_line_items").insert(estimateLineItems);
  }

  revalidatePath(`/jobs/${jobId}`);
  return { data: estimate };
}

export async function getEstimate(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("estimates")
    .select(
      "*, estimate_line_items(*), jobs(id, title, customer_id, vehicle_id, customers(id, first_name, last_name, email, phone), vehicles(id, year, make, model, vin))"
    )
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function getEstimateForJob(jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function getEstimateByToken(token: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("estimates")
    .select(
      "*, estimate_line_items(*), jobs(id, title, customers(id, first_name, last_name, email, phone, stripe_customer_id), vehicles(id, year, make, model, vin))"
    )
    .eq("approval_token", token)
    .single();

  if (error) return null;
  return data;
}

export async function sendEstimate(id: string) {
  const supabase = await createClient();

  // Verify it's a draft and get job/customer info for SMS
  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "id, status, job_id, jobs(id, customer_id, customers(id, first_name, phone, email))"
    )
    .eq("id", id)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };
  if (estimate.status !== "draft") return { error: "Only draft estimates can be sent" };

  const token = crypto.randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const approvalUrl = `${appUrl}/estimates/approve/${token}`;

  const { error } = await supabase
    .from("estimates")
    .update({
      status: "sent",
      approval_token: token,
      sent_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Fire-and-forget SMS notification to customer
  const job = estimate.jobs as {
    id: string;
    customer_id: string;
    customers: { id: string; first_name: string; phone: string | null; email: string | null } | null;
  } | null;
  const customer = job?.customers;
  if (customer?.phone) {
    import("@/lib/actions/messages")
      .then(({ sendCustomerSMS }) =>
        sendCustomerSMS({
          customerId: customer.id,
          body: `Hi ${customer.first_name}, your estimate from Broadway Motors is ready. View and approve here: ${approvalUrl}`,
          jobId: job!.id,
        })
      )
      .catch((err) => console.error("Failed to send estimate SMS:", err));
  }

  // Fire-and-forget email notification
  if (customer?.email) {
    import("@/lib/actions/email")
      .then(({ sendEstimateEmail }) => sendEstimateEmail({ estimateId: id }))
      .catch((err) => console.error("Failed to send estimate email:", err));
  }

  revalidatePath(`/estimates/${id}`);
  return { data: { approvalUrl } };
}

export async function approveEstimate(token: string) {
  const supabase = createAdminClient();

  // Get estimate with relations
  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "*, estimate_line_items(*), jobs(id, customer_id, customers(id, first_name, last_name, email, phone, stripe_customer_id))"
    )
    .eq("approval_token", token)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };
  if (estimate.status !== "sent") return { error: "This estimate cannot be approved" };

  const job = estimate.jobs as {
    id: string;
    customer_id: string;
    customers: {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      stripe_customer_id: string | null;
    } | null;
  } | null;

  if (!job?.customers) return { error: "Customer not found" };
  if (!job.customers.email) return { error: "Customer email is required for invoicing" };

  const lineItems = (estimate.estimate_line_items || []) as {
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
  }[];

  if (lineItems.length === 0) return { error: "Estimate has no line items" };

  // Get or create Stripe customer
  let stripeCustomerId = job.customers.stripe_customer_id;
  if (!stripeCustomerId) {
    const stripe = (await import("@/lib/stripe")).getStripe();
    const stripeCustomer = await stripe.customers.create({
      name: `${job.customers.first_name} ${job.customers.last_name}`,
      email: job.customers.email || undefined,
      phone: job.customers.phone || undefined,
      metadata: { supabase_customer_id: job.customers.id },
    });
    stripeCustomerId = stripeCustomer.id;

    await supabase
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", job.customers.id);
  }

  // Create Stripe invoice with current shop settings
  const shopSettings = await getShopSettings();
  try {
    const { stripeInvoiceId, hostedInvoiceUrl, amountDue } =
      await createStripeInvoice({
        stripeCustomerId,
        lineItems,
        jobCategory: null,
        settings: shopSettings,
      });

    // Insert invoice record
    await supabase.from("invoices").insert({
      job_id: job.id,
      stripe_invoice_id: stripeInvoiceId,
      stripe_hosted_invoice_url: hostedInvoiceUrl,
      status: "sent",
      amount: amountDue / 100,
    });

    // Mark estimate as approved
    await supabase
      .from("estimates")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", estimate.id);

    return { data: { success: true } };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create invoice";
    return { error: message };
  }
}

export async function declineEstimate(token: string) {
  const supabase = createAdminClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("approval_token", token)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };
  if (estimate.status !== "sent") return { error: "This estimate cannot be declined" };

  const { error } = await supabase
    .from("estimates")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
    })
    .eq("id", estimate.id);

  if (error) return { error: error.message };

  return { data: { success: true } };
}

export async function deleteEstimate(id: string) {
  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status, job_id")
    .eq("id", id)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };

  if (estimate.status === "approved") {
    return { error: "Cannot delete an approved estimate that has an invoice" };
  }

  // Delete estimate line items first, then the estimate
  await supabase.from("estimate_line_items").delete().eq("estimate_id", id);

  const { error } = await supabase.from("estimates").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${estimate.job_id}`);
  revalidatePath(`/estimates/${id}`);
  return { success: true };
}

// Estimate Line Item CRUD (only allowed when estimate is draft)

export async function createEstimateLineItem(formData: EstimateLineItemFormData) {
  const parsed = estimateLineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Verify estimate is draft
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, status, job_id")
    .eq("id", parsed.data.estimate_id)
    .single();

  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "draft") return { error: "Can only add items to draft estimates" };

  const { data, error } = await supabase
    .from("estimate_line_items")
    .insert(prepareEstimateLineItemData(parsed.data))
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/estimates/${parsed.data.estimate_id}`);
  return { data };
}

export async function updateEstimateLineItem(
  id: string,
  formData: EstimateLineItemFormData
) {
  const parsed = estimateLineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Verify estimate is draft
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", parsed.data.estimate_id)
    .single();

  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "draft") return { error: "Can only edit items on draft estimates" };

  const { data, error } = await supabase
    .from("estimate_line_items")
    .update(prepareEstimateLineItemData(parsed.data))
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/estimates/${parsed.data.estimate_id}`);
  return { data };
}

export async function deleteEstimateLineItem(id: string, estimateId: string) {
  const supabase = await createClient();

  // Verify estimate is draft
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", estimateId)
    .single();

  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "draft") return { error: "Can only delete items from draft estimates" };

  const { error } = await supabase
    .from("estimate_line_items")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/estimates/${estimateId}`);
  return { success: true };
}
