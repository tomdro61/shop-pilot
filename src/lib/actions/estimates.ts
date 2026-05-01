"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/auth";
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
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("estimates")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (existing) return { error: "An estimate already exists for this job" };

  const [{ data: lineItems, error: lineItemsError }, settings] = await Promise.all([
    supabase.from("job_line_items").select("*").eq("job_id", jobId),
    getShopSettings(),
  ]);

  if (lineItemsError) return { error: lineItemsError.message };

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

  if (lineItems && lineItems.length > 0) {
    const estimateLineItems = lineItems.map((li) => ({
      estimate_id: estimate.id,
      type: li.type,
      description: li.description,
      quantity: li.quantity,
      unit_cost: li.unit_cost,
      part_number: li.part_number,
      category: li.category,
    }));

    const { error: copyError } = await supabase
      .from("estimate_line_items")
      .insert(estimateLineItems);

    if (copyError) {
      const { error: rollbackError } = await supabase
        .from("estimates")
        .delete()
        .eq("id", estimate.id);

      return {
        error: rollbackError
          ? `Failed to copy line items and rollback failed (estimate ${estimate.id} may need manual cleanup): ${copyError.message}`
          : `Failed to copy line items: ${copyError.message}`,
      };
    }
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
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  // Verify it's a draft and get job/customer info for SMS
  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "id, status, job_id, jobs(id, customer_id, vehicle_id, customers(id, first_name, phone, email), vehicles(year, make, model))"
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
    vehicles?: { year: number | null; make: string | null; model: string | null } | null;
  } | null;
  const customer = job?.customers;
  if (customer?.phone) {
    import("@/lib/messaging/templates")
      .then(({ estimateSentSMS }) => {
        const vehicle = (job as { vehicles?: { year: number | null; make: string | null; model: string | null } | null })?.vehicles;
        return import("@/lib/actions/messages").then(({ sendCustomerSMS }) =>
          sendCustomerSMS({
            customerId: customer.id,
            body: estimateSentSMS({
              firstName: customer.first_name,
              year: vehicle?.year,
              make: vehicle?.make,
              model: vehicle?.model,
              link: approvalUrl,
            }),
            jobId: job!.id,
            line: "shop",
          })
        );
      })
      .catch((err) => console.error("Failed to send estimate SMS:", err));
  }

  // Fire-and-forget email notification
  if (customer?.email) {
    import("@/lib/actions/email")
      .then(({ sendEstimateEmail }) => sendEstimateEmail({ estimateId: id }))
      .catch((err) => console.error("Failed to send estimate email:", err));
  }

  revalidatePath(`/estimates/${id}`);
  revalidatePath(`/jobs/${estimate.job_id}`);
  return { data: { approvalUrl } };
}

export async function resendEstimate(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "id, status, approval_token, job_id, jobs(id, customer_id, vehicle_id, customers(id, first_name, phone), vehicles(year, make, model))"
    )
    .eq("id", id)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };
  if (estimate.status !== "sent") return { error: "Only sent estimates can be resent" };
  if (!estimate.approval_token) return { error: "No approval token found" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const approvalUrl = `${appUrl}/estimates/approve/${estimate.approval_token}`;

  const job = estimate.jobs as {
    id: string;
    customer_id: string;
    customers: { id: string; first_name: string; phone: string | null } | null;
    vehicles?: { year: number | null; make: string | null; model: string | null } | null;
  } | null;
  const customer = job?.customers;

  if (!customer?.phone) return { error: "Customer has no phone number" };

  const { estimateSentSMS } = await import("@/lib/messaging/templates");
  const { sendCustomerSMS } = await import("@/lib/actions/messages");
  const vehicle = (job as { vehicles?: { year: number | null; make: string | null; model: string | null } | null })?.vehicles;

  await sendCustomerSMS({
    customerId: customer.id,
    body: estimateSentSMS({
      firstName: customer.first_name,
      year: vehicle?.year,
      make: vehicle?.make,
      model: vehicle?.model,
      link: approvalUrl,
    }),
    jobId: job!.id,
    line: "shop",
  });

  return { data: { success: true } };
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

  const lineItems = (estimate.estimate_line_items || []) as {
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
  }[];

  if (lineItems.length === 0) return { error: "Estimate has no line items" };

  // Get or create Stripe customer (handles stale IDs)
  const stripe = (await import("@/lib/stripe")).getStripe();
  let stripeCustomerId = job.customers.stripe_customer_id;

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
      name: `${job.customers.first_name} ${job.customers.last_name}`,
      email: job.customers.email || undefined,
      phone: job.customers.phone || undefined,
      metadata: { supabase_customer_id: job.customers.id },
    });
    stripeCustomerId = stripeCustomer.id;

    const { error: customerUpdateError } = await supabase
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", job.customers.id);
    if (customerUpdateError) {
      // Non-fatal: the Stripe customer exists; we just failed to record its
      // ID locally. Future invoice creation will create a duplicate Stripe
      // customer until this is reconciled. Surface to logs for manual fix.
      console.error(
        "[approveEstimate] failed to save stripe_customer_id locally:",
        customerUpdateError,
        { customerId: job.customers.id, stripeCustomerId }
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
        jobCategory: null,
        settings: shopSettings,
        hasEmail: !!job.customers.email,
      });

    // Insert invoice record (draft — staff sends manually when ready).
    // Critical: Stripe invoice was just created. If this insert fails, the
    // customer is billed in Stripe but we have no local record of it.
    // Surface the error so the manager can manually reconcile (Stripe
    // dashboard → void invoice, or run the insert by hand).
    const { error: invoiceInsertError } = await supabase
      .from("invoices")
      .insert({
        job_id: job.id,
        stripe_invoice_id: stripeInvoiceId,
        stripe_hosted_invoice_url: hostedInvoiceUrl,
        status: "draft",
        amount: amountDue / 100,
      });
    if (invoiceInsertError) {
      console.error(
        "[approveEstimate] orphan Stripe invoice — local insert failed:",
        invoiceInsertError,
        { stripeInvoiceId, jobId: job.id }
      );
      return {
        error: `Stripe invoice was created (${stripeInvoiceId}) but could not be saved locally. Please contact support to reconcile.`,
      };
    }

    // Mark estimate as approved. If this fails, Stripe customer + invoice
    // exist and the local invoice row exists, but the estimate stays "sent".
    // Surface so the manager can manually update the estimate status.
    const { error: estimateUpdateError } = await supabase
      .from("estimates")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", estimate.id);
    if (estimateUpdateError) {
      console.error(
        "[approveEstimate] estimate status update failed:",
        estimateUpdateError,
        { estimateId: estimate.id }
      );
      return {
        error: `Invoice was saved but the estimate status could not be updated. Please mark the estimate approved manually.`,
      };
    }

    revalidatePath(`/estimates/${estimate.id}`);
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath("/dashboard");
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
    .select("id, status, job_id")
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

  revalidatePath(`/estimates/${estimate.id}`);
  revalidatePath(`/jobs/${estimate.job_id}`);
  return { data: { success: true } };
}

export async function deleteEstimate(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

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
  const { error: lineItemsError } = await supabase
    .from("estimate_line_items")
    .delete()
    .eq("estimate_id", id);
  if (lineItemsError) return { error: lineItemsError.message };

  const { error } = await supabase.from("estimates").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${estimate.job_id}`);
  revalidatePath(`/estimates/${id}`);
  return { success: true };
}

// Estimate Line Item CRUD (only allowed when estimate is draft)

export async function createEstimateLineItem(formData: EstimateLineItemFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = estimateLineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Verify estimate is draft
  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status, job_id")
    .eq("id", parsed.data.estimate_id)
    .single();

  if (fetchError) return { error: fetchError.message };
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
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = estimateLineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Verify estimate is draft
  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", parsed.data.estimate_id)
    .single();

  if (fetchError) return { error: fetchError.message };
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
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  // Verify estimate is draft
  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", estimateId)
    .single();

  if (fetchError) return { error: fetchError.message };
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
