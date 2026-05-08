"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/auth";
import {
  estimateLineItemSchema,
  estimateSchema,
  prepareEstimateLineItemData,
} from "@/lib/validators/estimate";
import { revalidatePath } from "next/cache";
import { getShopSettings } from "@/lib/actions/settings";
import type {
  EstimateFormData,
  EstimateLineItemFormData,
} from "@/lib/validators/estimate";
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

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id, vehicle_id")
    .eq("id", jobId)
    .single();

  if (jobError) return { error: jobError.message };
  if (!job) return { error: "Job not found" };

  const [{ data: lineItems, error: lineItemsError }, settings] = await Promise.all([
    supabase.from("job_line_items").select("*").eq("job_id", jobId),
    getShopSettings(),
  ]);

  if (lineItemsError) return { error: lineItemsError.message };

  const { data: estimate, error } = await supabase
    .from("estimates")
    .insert({
      job_id: jobId,
      customer_id: job.customer_id,
      vehicle_id: job.vehicle_id,
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
      cost: li.type === "part" ? (li.cost ?? null) : null,
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

      if (rollbackError) {
        console.error(
          "[createEstimateFromJob] rollback failed — orphan estimate left in DB",
          { rollbackError, copyError, estimateId: estimate.id, jobId }
        );
        return {
          error: `Couldn't copy line items and rollback failed — the estimate may need manual cleanup: ${copyError.message}`,
        };
      }
      return { error: `Failed to copy line items: ${copyError.message}` };
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  return { data: estimate };
}

// Manager creates a standalone estimate (no parent job). Used for quotes
// the customer hasn't committed to yet — prevents "ghost jobs" cluttering
// the Shop Floor while we wait on approval.
export async function createEstimate(formData: EstimateFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = estimateSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Validate customer exists (don't trust client-supplied UUID)
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("id", parsed.data.customer_id)
    .single();
  if (customerError) return { error: customerError.message };
  if (!customer) return { error: "Customer not found" };

  // Validate vehicle belongs to the customer (when provided)
  if (parsed.data.vehicle_id) {
    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, customer_id")
      .eq("id", parsed.data.vehicle_id)
      .single();
    if (vehicleError) return { error: vehicleError.message };
    if (!vehicle || vehicle.customer_id !== parsed.data.customer_id) {
      return { error: "Vehicle does not belong to this customer" };
    }
  }

  const settings = await getShopSettings();

  const { data: estimate, error } = await supabase
    .from("estimates")
    .insert({
      customer_id: parsed.data.customer_id,
      vehicle_id: parsed.data.vehicle_id || null,
      job_id: null,
      status: "draft",
      tax_rate: settings?.tax_rate ?? 0.0625,
      notes: parsed.data.notes || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return { data: estimate };
}

export async function getEstimates(filters?: {
  status?: "draft" | "sent" | "approved" | "declined";
}) {
  const supabase = await createClient();
  let query = supabase
    .from("estimates")
    .select(
      "id, status, estimate_number, created_at, sent_at, approved_at, declined_at, customer_id, vehicle_id, job_id, customers(id, first_name, last_name), vehicles(year, make, model), estimate_line_items(total)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load estimates: ${error.message}`);
  return data ?? [];
}

// Wrapped in React cache() so generateMetadata + the page component
// share one DB round-trip per request (they otherwise fetch twice).
export const getEstimate = cache(async (id: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("estimates")
    .select(
      `*,
       estimate_line_items(*),
       customers(id, first_name, last_name, email, phone),
       vehicles(id, year, make, model, vin, license_plate, color),
       jobs(id, title, ro_number, status)`
    )
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = no row matched — render 404. Anything else (RLS, network,
    // schema drift) is infrastructure failure and must surface as 500 so
    // the manager doesn't see "Estimate not found" for a real bug.
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to load estimate: ${error.message}`);
  }
  return data;
});

export async function getEstimateForJob(jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // maybeSingle() returns data: null with error: null when no row matches,
  // so any error here is a real failure — surface it.
  if (error) throw new Error(`Failed to load estimate for job: ${error.message}`);
  return data;
}

export async function getEstimateByToken(token: string) {
  const supabase = createAdminClient();

  // Join customer + vehicle directly off the estimate. Going through
  // `jobs.customers` / `jobs.vehicles` (the old pattern) returned null for
  // standalone estimates (job_id NULL), which broke the customer-facing
  // approval page on every estimate created via the new first-class flow.
  const { data, error } = await supabase
    .from("estimates")
    .select(
      "*, estimate_line_items(*), customers(id, first_name, last_name, email, phone, stripe_customer_id), vehicles(id, year, make, model, vin), jobs(id, title)"
    )
    .eq("approval_token", token)
    .single();

  if (error) {
    // Public approval link — a bad/expired token should render the friendly
    // 404 page. Any other error is infrastructure and must throw so the
    // customer doesn't see "Estimate not found" for a real outage.
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to load estimate: ${error.message}`);
  }
  return data;
}

export async function sendEstimate(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "id, status, job_id, customer_id, vehicle_id, customers(id, first_name, phone, email), vehicles(year, make, model)"
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

  const customer = estimate.customers as {
    id: string;
    first_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  const vehicle = estimate.vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;

  // Surface delivery failures — "Estimate sent!" must not lie when the
  // customer never actually got the link. Both channels are awaited so the
  // toast can warn the manager to copy the link manually if needed.
  const warnings: string[] = [];
  if (customer?.phone) {
    const { estimateSentSMS } = await import("@/lib/messaging/templates");
    const { sendCustomerSMS } = await import("@/lib/actions/messages");
    const smsResult = await sendCustomerSMS({
      customerId: customer.id,
      body: estimateSentSMS({
        firstName: customer.first_name,
        year: vehicle?.year,
        make: vehicle?.make,
        model: vehicle?.model,
        link: approvalUrl,
      }),
      jobId: estimate.job_id ?? undefined,
      line: "shop",
    });
    if ("error" in smsResult && smsResult.error) {
      warnings.push(`SMS: ${smsResult.error}`);
      console.error("[sendEstimate] SMS delivery failed:", smsResult.error);
    }
  }
  if (customer?.email) {
    const { sendEstimateEmail } = await import("@/lib/actions/email");
    const emailResult = await sendEstimateEmail({ estimateId: id });
    if (!emailResult.sent && emailResult.error) {
      warnings.push(`Email: ${emailResult.error}`);
      console.error("[sendEstimate] email delivery failed:", emailResult.error);
    }
  }

  revalidatePath(`/estimates/${id}`);
  if (estimate.job_id) revalidatePath(`/jobs/${estimate.job_id}`);
  if (estimate.customer_id) revalidatePath(`/customers/${estimate.customer_id}`);
  return {
    data: {
      approvalUrl,
      deliveryWarning: warnings.length > 0 ? warnings.join(" · ") : undefined,
    },
  };
}

export async function resendEstimate(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "id, status, approval_token, job_id, customer_id, customers(id, first_name, phone), vehicles(year, make, model)"
    )
    .eq("id", id)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };
  if (estimate.status !== "sent") return { error: "Only sent estimates can be resent" };
  if (!estimate.approval_token) return { error: "No approval token found" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const approvalUrl = `${appUrl}/estimates/approve/${estimate.approval_token}`;

  const customer = estimate.customers as {
    id: string;
    first_name: string;
    phone: string | null;
  } | null;
  const vehicle = estimate.vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;

  if (!customer?.phone) return { error: "Customer has no phone number" };

  const { estimateSentSMS } = await import("@/lib/messaging/templates");
  const { sendCustomerSMS } = await import("@/lib/actions/messages");

  const smsResult = await sendCustomerSMS({
    customerId: customer.id,
    body: estimateSentSMS({
      firstName: customer.first_name,
      year: vehicle?.year,
      make: vehicle?.make,
      model: vehicle?.model,
      link: approvalUrl,
    }),
    jobId: estimate.job_id ?? undefined,
    line: "shop",
  });
  if ("error" in smsResult && smsResult.error) {
    return { error: `Resend failed: ${smsResult.error}` };
  }

  revalidatePath(`/estimates/${id}`);
  if (estimate.job_id) revalidatePath(`/jobs/${estimate.job_id}`);
  if (estimate.customer_id) revalidatePath(`/customers/${estimate.customer_id}`);
  return { data: { success: true } };
}

// Public customer-facing approval via emailed/SMS link. We deliberately do
// NOT create a Stripe customer or invoice here: pricing can change once
// the work begins (additional parts, etc.), so invoices are generated from
// the completed-job InvoiceSection — see createInvoiceFromJob.
export async function approveEstimate(token: string) {
  const supabase = createAdminClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status, customer_id, job_id")
    .eq("approval_token", token)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };
  if (estimate.status !== "sent") return { error: "This estimate cannot be approved" };

  const { error } = await supabase
    .from("estimates")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approval_method: "link",
    })
    .eq("id", estimate.id);

  if (error) return { error: error.message };

  revalidatePath(`/estimates/${estimate.id}`);
  if (estimate.job_id) revalidatePath(`/jobs/${estimate.job_id}`);
  if (estimate.customer_id) revalidatePath(`/customers/${estimate.customer_id}`);
  revalidatePath("/dashboard");
  return { data: { success: true } };
}

// Manager-side bypass: when the manager confirms approval directly instead
// of waiting on the customer-link click. approval_method stays NULL so the
// audit trail distinguishes "customer clicked the link" (method = "link")
// from "manager marked it approved" (method = NULL) without forcing the
// manager to pick verbal vs in-person every time.
export async function markEstimateApproved(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status, customer_id, job_id")
    .eq("id", id)
    .single();

  if (fetchError) return { error: fetchError.message };
  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "sent" && estimate.status !== "draft") {
    return { error: "Only draft or sent estimates can be marked approved" };
  }

  // Look up the manager's users.id (auth.userId is auth_id, not the FK target).
  // maybeSingle() so the "no users row for this auth user" case is a clean null
  // we can guard, not a Postgres error string surfaced to the manager.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", auth.userId)
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (!profile) {
    console.error("[markEstimateApproved] manager has no users row", { authId: auth.userId });
    return { error: "Your user profile is missing. Contact support." };
  }

  const { error } = await supabase
    .from("estimates")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approval_method: null,
      approved_by_user_id: profile.id,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/estimates/${id}`);
  if (estimate.job_id) revalidatePath(`/jobs/${estimate.job_id}`);
  if (estimate.customer_id) revalidatePath(`/customers/${estimate.customer_id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

// Manager-side bypass for the decline path: the customer ghosted on a sent
// estimate or said no verbally. Flips status to declined, keeps the record
// (line items + history), drops it off the active list. Mirrors the public
// declineEstimate flow but takes an id instead of a token.
export async function markEstimateDeclined(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status, customer_id, job_id")
    .eq("id", id)
    .single();

  if (fetchError) return { error: fetchError.message };
  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "sent") {
    return { error: "Only sent estimates can be marked declined" };
  }

  const { error } = await supabase
    .from("estimates")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/estimates/${id}`);
  if (estimate.job_id) revalidatePath(`/jobs/${estimate.job_id}`);
  if (estimate.customer_id) revalidatePath(`/customers/${estimate.customer_id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

// Promote an approved estimate to a real job. Copies line items so the
// job can evolve independently — additional parts on the job don't need
// to mutate the historical estimate. The estimate keeps a back-link
// (job_id) so the customer detail page can show the conversion chain.
//
// Intentionally does NOT create an invoice: the new job follows the
// normal lifecycle (Not Started → In Progress → Complete) and is
// invoiced from the completed-job InvoiceSection like any other job.
export async function convertEstimateToJob(estimateId: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "id, status, customer_id, vehicle_id, job_id, estimate_number, estimate_line_items(*)"
    )
    .eq("id", estimateId)
    .single();

  if (fetchError) return { error: fetchError.message };
  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "approved") {
    return { error: "Only approved estimates can be converted to a job" };
  }
  if (estimate.job_id) {
    return { error: "Estimate is already linked to a job" };
  }
  if (!estimate.customer_id) return { error: "Estimate has no customer" };

  const lineItemsRaw = (estimate.estimate_line_items ?? []) as Array<{
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
    cost: number | null;
    part_number: string | null;
    category: string | null;
  }>;

  // Derive a title so the converted job isn't a nameless row on the Shop
  // Floor. Preference: most-common category > first line-item description >
  // a generic "From EST-####" reference. Estimate prose isn't stored on the
  // estimate row itself, so this is the best signal we have.
  const derivedTitle = (() => {
    const categoryCounts = new Map<string, number>();
    for (const li of lineItemsRaw) {
      if (li.category) {
        categoryCounts.set(li.category, (categoryCounts.get(li.category) ?? 0) + 1);
      }
    }
    if (categoryCounts.size > 0) {
      const sorted = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
      return sorted[0][0];
    }
    if (lineItemsRaw[0]?.description) {
      const desc = lineItemsRaw[0].description.trim();
      return desc.length > 80 ? `${desc.slice(0, 77)}…` : desc;
    }
    if (estimate.estimate_number) {
      return `From EST-${String(estimate.estimate_number).padStart(4, "0")}`;
    }
    return "Repair Order";
  })();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: estimate.customer_id,
      vehicle_id: estimate.vehicle_id,
      status: "not_started",
      title: derivedTitle,
      date_received: new Date().toISOString().split("T")[0],
      payment_status: "unpaid",
    })
    .select("id, ro_number")
    .single();

  if (jobError) return { error: jobError.message };
  if (!job) return { error: "Failed to create job" };

  if (lineItemsRaw.length > 0) {
    const jobLineItems = lineItemsRaw.map((li) => ({
      job_id: job.id,
      type: li.type,
      description: li.description,
      quantity: li.quantity,
      unit_cost: li.unit_cost,
      cost: li.type === "part" ? (li.cost ?? null) : null,
      part_number: li.part_number,
      category: li.category,
    }));

    const { error: copyError } = await supabase
      .from("job_line_items")
      .insert(jobLineItems);

    if (copyError) {
      // Roll back the job so we don't leave a half-converted artifact.
      // Capture rollback failure too — same pattern as createEstimateFromJob.
      const { error: rollbackError } = await supabase
        .from("jobs")
        .delete()
        .eq("id", job.id);
      if (rollbackError) {
        console.error(
          "[convertEstimateToJob] rollback failed — orphan job left in DB",
          { rollbackError, copyError, jobId: job.id, estimateId }
        );
        return {
          error: `Couldn't copy line items and rollback failed — the job may need manual cleanup: ${copyError.message}`,
        };
      }
      return { error: `Failed to copy line items: ${copyError.message}` };
    }
  }

  // Atomic link-back: scoping by `job_id IS NULL` makes this the race
  // gate. Two concurrent Convert clicks both pass the earlier read-time
  // check, both insert their own job, but only one UPDATE here actually
  // matches the row — the other gets count=0 and we roll back its job.
  // Without this, both clicks would silently produce two jobs.
  const { error: linkError, count: linkCount } = await supabase
    .from("estimates")
    .update({ job_id: job.id }, { count: "exact" })
    .eq("id", estimateId)
    .is("job_id", null);

  if (linkError) {
    console.error(
      "[convertEstimateToJob] orphan job — failed to link back to estimate:",
      { linkError, estimateId, jobId: job.id }
    );
    // Don't revalidate on this error path — every other error branch in
    // this function deliberately skips revalidation, and pre-revalidating
    // here makes the dashboard show the orphan as if it's legitimate before
    // the manager has read the error toast. They'll find it via the RO
    // label in the next page navigation.
    const roLabel = job.ro_number
      ? `RO-${String(job.ro_number).padStart(4, "0")}`
      : "the new job";
    return {
      error: `The new job (${roLabel}) was created but couldn't be linked back to this estimate. Find it on the Shop Floor and link or delete it manually.`,
    };
  }

  // Strict !== 1 check, not === 0: Supabase can return count: null on some
  // RLS edge cases. Treat anything-other-than-exactly-1 as race-loser so we
  // don't fall through and silently leave the estimate unlinked.
  if (linkCount !== 1) {
    const { error: rollbackError } = await supabase.from("jobs").delete().eq("id", job.id);
    if (rollbackError) {
      console.error(
        "[convertEstimateToJob] race-loser rollback failed — orphan duplicate job",
        { rollbackError, jobId: job.id, estimateId }
      );
      const roLabel = job.ro_number
        ? `RO-${String(job.ro_number).padStart(4, "0")}`
        : "a duplicate job";
      return {
        error: `This estimate was already being converted in another tab. We tried to discard the duplicate (${roLabel}) but the cleanup failed — find and delete it manually.`,
      };
    }
    return { error: "This estimate was already converted (likely from another tab). Refresh to see the linked job." };
  }

  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath(`/jobs/${job.id}`);
  revalidatePath(`/customers/${estimate.customer_id}`);
  revalidatePath("/dashboard");
  return { data: { jobId: job.id } };
}

export async function declineEstimate(token: string) {
  const supabase = createAdminClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status, job_id, customer_id")
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
  if (estimate.job_id) revalidatePath(`/jobs/${estimate.job_id}`);
  if (estimate.customer_id) revalidatePath(`/customers/${estimate.customer_id}`);
  return { data: { success: true } };
}

export async function deleteEstimate(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select("id, status, job_id, customer_id")
    .eq("id", id)
    .single();

  if (fetchError || !estimate) return { error: "Estimate not found" };

  if (estimate.status === "approved") {
    return { error: "Approved estimates can't be deleted — convert them to a job or decline first" };
  }

  // Delete estimate line items first, then the estimate
  const { error: lineItemsError } = await supabase
    .from("estimate_line_items")
    .delete()
    .eq("estimate_id", id);
  if (lineItemsError) return { error: lineItemsError.message };

  const { error } = await supabase.from("estimates").delete().eq("id", id);

  if (error) return { error: error.message };

  if (estimate.job_id) revalidatePath(`/jobs/${estimate.job_id}`);
  if (estimate.customer_id) revalidatePath(`/customers/${estimate.customer_id}`);
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

  // Scope by estimate_id too — without it, a caller could pass a draft
  // estimate_id alongside a line-item id from a *different* (sent/approved)
  // estimate. The status guard would pass on the wrong estimate while the
  // update lands on the protected one.
  const { data, error } = await supabase
    .from("estimate_line_items")
    .update(prepareEstimateLineItemData(parsed.data))
    .eq("id", id)
    .eq("estimate_id", parsed.data.estimate_id)
    .select()
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Line item not found on this estimate" };

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

  // Scope by estimate_id too — see updateEstimateLineItem comment for why.
  const { error, count } = await supabase
    .from("estimate_line_items")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("estimate_id", estimateId);

  if (error) return { error: error.message };
  if (count === 0) return { error: "Line item not found on this estimate" };

  revalidatePath(`/estimates/${estimateId}`);
  return { success: true };
}
