"use server";

import { cache } from "react";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { jobSchema, prepareJobData } from "@/lib/validators/job";
import { todayET, shiftScheduledAtToNewDate } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import type { JobFormData } from "@/lib/validators/job";
import type { JobStatus, PaymentMethod, PaymentStatus } from "@/types";

export async function getJobs(filters?: {
  search?: string;
  status?: JobStatus;
  category?: string;
  paymentStatus?: PaymentStatus;
  dateFrom?: string;
  dateTo?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("jobs")
    .select("*, customers(id, first_name, last_name, phone), vehicles(id, year, make, model, license_plate), users(id, name), job_line_items(total), dvi_inspections(status)")
    .order("date_received", { ascending: false });

  if (filters?.dateFrom) {
    query = query.gte("date_received", filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte("date_received", filters.dateTo);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  } else {
    // Cancelled jobs are off-board history. Hide them from default list,
    // kanban, and calendar views — manager can still find them by selecting
    // the Cancelled filter explicitly, or via the customer detail page.
    query = query.neq("status", "cancelled");
  }

  if (filters?.paymentStatus) {
    query = query.eq("payment_status", filters.paymentStatus);
  }

  if (filters?.category) {
    // Filter jobs that have line items in this category
    const supabaseForCategory = await createClient();
    const { data: matchingJobs, error: categoryError } = await supabaseForCategory
      .from("job_line_items")
      .select("job_id")
      .eq("category", filters.category);
    if (categoryError) {
      throw new Error(`Failed to filter jobs by category: ${categoryError.message}`);
    }
    const jobIds = [...new Set(matchingJobs?.map((li) => li.job_id) || [])];
    if (jobIds.length === 0) return [];
    query = query.in("id", jobIds);
  }

  if (filters?.search && filters.search.trim().length >= 2) {
    const searchLower = filters.search.trim().toLowerCase();
    const supabaseForSearch = await createClient();

    // Cap matched-ID lists so the resulting `customer_id.in.(...)` /
    // `vehicle_id.in.(...)` clauses don't blow past PostgREST's URL length
    // limit on broad searches (e.g. a 2-char substring matching hundreds of
    // customer rows in a 3,000-row table). Beyond this cap we'd 400. Order
    // by name so the truncated set is deterministic if it saturates.
    const SEARCH_ID_CAP = 100;
    const [customerResult, vehicleResult] = await Promise.all([
      supabaseForSearch
        .from("customers")
        .select("id")
        .or(`first_name.ilike.%${searchLower}%,last_name.ilike.%${searchLower}%`)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .limit(SEARCH_ID_CAP),
      supabaseForSearch
        .from("vehicles")
        .select("id")
        .or(`make.ilike.%${searchLower}%,model.ilike.%${searchLower}%`)
        .order("make", { ascending: true })
        .order("model", { ascending: true })
        .limit(SEARCH_ID_CAP),
    ]);

    if (customerResult.error) {
      throw new Error(`Failed to search customers: ${customerResult.error.message}`);
    }
    if (vehicleResult.error) {
      throw new Error(`Failed to search vehicles: ${vehicleResult.error.message}`);
    }

    const customerIds = customerResult.data?.map(c => c.id) || [];
    const vehicleIds = vehicleResult.data?.map(v => v.id) || [];

    // Saturation = silent truncation; surface to Sentry so we can see if the
    // RPC follow-up needs to be prioritized.
    if (customerIds.length === SEARCH_ID_CAP || vehicleIds.length === SEARCH_ID_CAP) {
      Sentry.captureMessage("jobs_search_truncated", {
        level: "warning",
        extra: {
          query: searchLower,
          customer_matches: customerIds.length,
          vehicle_matches: vehicleIds.length,
          cap: SEARCH_ID_CAP,
        },
      });
    }

    // Build OR filter for job's own fields + matched customer/vehicle IDs
    const orParts: string[] = [
      `title.ilike.%${searchLower}%`,
      `notes.ilike.%${searchLower}%`,
    ];
    if (customerIds.length > 0) {
      orParts.push(`customer_id.in.(${customerIds.join(",")})`);
    }
    if (vehicleIds.length > 0) {
      orParts.push(`vehicle_id.in.(${vehicleIds.join(",")})`);
    }

    query = query.or(orParts.join(","));

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export const getJob = cache(async (id: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, first_name, last_name, phone, email), vehicles(id, year, make, model, vin, mileage), users(id, name), job_line_items(*)"
    )
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = no row matched — render 404. Anything else (RLS, network,
    // schema drift) is infrastructure failure and must throw, otherwise
    // the AI handler and job detail page treat real outages as "job not
    // found" and the manager has no signal that something is broken.
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to load job: ${error.message}`);
  }
  return data;
});

export async function createJob(formData: JobFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = jobSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert(prepareJobData(parsed.data))
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return { data };
}

export async function updateJob(id: string, formData: JobFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = jobSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update(prepareJobData(parsed.data))
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/dashboard");
  return { data };
}

// `cancelled` is intentionally excluded — every cancel transition must go
// through `cancelJob`, which enforces the "no cancelling completed/paid"
// guards. A bare status update from a Kanban drag would otherwise bypass them.
export type ActiveJobStatus = Exclude<JobStatus, "cancelled">;

export async function updateJobStatus(id: string, status: ActiveJobStatus) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const updateData: Record<string, unknown> = { status };

  // Auto-set date_finished when completing, clear it when moving back
  if (status === "complete") {
    updateData.date_finished = todayET();
  } else {
    updateData.date_finished = null;
  }

  const { error } = await supabase
    .from("jobs")
    .update(updateData)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export type JobFieldPatch = Partial<{
  title: string | null;
  notes: string | null;
  mileage_in: number | null;
  date_received: string | null;
  date_finished: string | null;
  scheduled_at: string | null;
  assigned_tech: string | null;
  customer_id: string;
  vehicle_id: string | null;
}>;

const EDITABLE_KEYS = [
  "title",
  "notes",
  "mileage_in",
  "date_received",
  "date_finished",
  "scheduled_at",
  "assigned_tech",
  "customer_id",
  "vehicle_id",
] as const satisfies readonly (keyof JobFieldPatch)[];

export async function updateJobFields(id: string, patch: JobFieldPatch) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    update[key] = typeof raw === "string" && raw.trim() === "" ? null : raw;
  }

  if (Object.keys(update).length === 0) {
    return { error: "Nothing to update" };
  }

  // Treat date_received + scheduled_at as a unit. If the caller is moving
  // the drop-off date and the job has a time set, shift scheduled_at to
  // the new date keeping the same ET wall-clock time. If the caller
  // explicitly patches scheduled_at in the same call, respect that
  // (don't overwrite the explicit value with the cascaded one).
  if ("date_received" in update && !("scheduled_at" in update)) {
    const { data: existing, error: readError } = await supabase
      .from("jobs")
      .select("scheduled_at, date_received")
      .eq("id", id)
      .single();
    if (readError) {
      // Surface the read failure rather than silently letting the update
      // proceed with no cascade — that path leaves scheduled_at anchored
      // to the wrong date and the manager has no signal anything is off.
      return { error: `Failed to load job for date cascade: ${readError.message}` };
    }
    if (!existing) return { error: "Job not found" };
    if (existing.scheduled_at) {
      const newDate = update.date_received;
      if (typeof newDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        if (existing.date_received !== newDate) {
          try {
            update.scheduled_at = shiftScheduledAtToNewDate(
              existing.scheduled_at,
              newDate
            );
          } catch (e) {
            // shiftScheduledAtToNewDate throws on garbage input. Translate
            // into the action's { error } contract instead of letting an
            // unhandled exception bubble out as a generic 500.
            return {
              error: `Couldn't re-anchor scheduled time to ${newDate}: ${
                e instanceof Error ? e.message : "invalid existing time"
              }. Edit the time directly to fix.`,
            };
          }
        }
      } else if (newDate === null) {
        // Drop-off date cleared → drop the time too. They're a unit.
        update.scheduled_at = null;
      }
    }
  }

  const { error } = await supabase.from("jobs").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateJobDateFinished(id: string, dateFinished: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("jobs")
    .update({ date_finished: dateFinished })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function cancelJob(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select("id, status, payment_status, customer_id")
    .eq("id", id)
    .single();

  if (fetchError) return { error: fetchError.message };
  if (!job) return { error: "Job not found" };
  if (job.status === "complete") {
    return { error: "Completed jobs can't be cancelled — delete instead" };
  }
  if (job.status === "cancelled") return { error: "Job is already cancelled" };
  // Paid / invoiced jobs have a Stripe payment intent or invoice attached.
  // Cancelling without voiding those creates a financial reconciliation gap.
  if (job.payment_status === "paid") {
    return { error: "Paid jobs can't be cancelled — refund the payment in Stripe first" };
  }
  if (job.payment_status === "invoiced") {
    return { error: "This job has an open invoice — void it in Stripe before cancelling" };
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "cancelled", date_finished: null })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  if (job.customer_id) revalidatePath(`/customers/${job.customer_id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteJob(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  // Same payment guards as cancelJob — deleting a job with live Stripe
  // state (open invoice or collected payment) leaves the Stripe side
  // orphaned and creates an unreconcilable financial record.
  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select("id, payment_status, customer_id")
    .eq("id", id)
    .single();

  if (fetchError) return { error: fetchError.message };
  if (!job) return { error: "Job not found" };
  if (job.payment_status === "paid") {
    return { error: "Paid jobs can't be deleted — refund the payment in Stripe first" };
  }
  if (job.payment_status === "invoiced") {
    return { error: "This job has an open invoice — void it in Stripe before deleting" };
  }

  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  if (job.customer_id) revalidatePath(`/customers/${job.customer_id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getLineItemCategories() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_line_items")
    .select("category")
    .not("category", "is", null)
    .order("category");

  // RLS denial / infra failure → empty dropdown silently → manager
  // assumes no categories exist and creates duplicates. Surface it.
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  const categories = [...new Set(data?.map((li) => li.category).filter(Boolean) as string[])];
  return categories;
}

export async function recordPayment(
  jobId: string,
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus = "paid"
) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("jobs")
    .update({
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", jobId);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
