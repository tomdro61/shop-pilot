"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { jobSchema, prepareJobData } from "@/lib/validators/job";
import { todayET } from "@/lib/utils";
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
    .select("*, customers(id, first_name, last_name, phone), vehicles(id, year, make, model), users(id, name), job_line_items(total)")
    .order("date_received", { ascending: false });

  if (filters?.dateFrom) {
    query = query.gte("date_received", filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte("date_received", filters.dateTo);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.paymentStatus) {
    query = query.eq("payment_status", filters.paymentStatus);
  }

  if (filters?.category) {
    // Filter jobs that have line items in this category
    const supabaseForCategory = await createClient();
    const { data: matchingJobs } = await supabaseForCategory
      .from("job_line_items")
      .select("job_id")
      .eq("category", filters.category);
    const jobIds = [...new Set(matchingJobs?.map((li) => li.job_id) || [])];
    if (jobIds.length === 0) return [];
    query = query.in("id", jobIds);
  }

  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    const supabaseForSearch = await createClient();

    // Server-side: find matching customers and vehicles first, then filter jobs
    const [customerResult, vehicleResult] = await Promise.all([
      supabaseForSearch
        .from("customers")
        .select("id")
        .or(`first_name.ilike.%${searchLower}%,last_name.ilike.%${searchLower}%`),
      supabaseForSearch
        .from("vehicles")
        .select("id")
        .or(`make.ilike.%${searchLower}%,model.ilike.%${searchLower}%`),
    ]);

    const customerIds = customerResult.data?.map(c => c.id) || [];
    const vehicleIds = vehicleResult.data?.map(v => v.id) || [];

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

  if (error) return null;
  return data;
});

export async function createJob(formData: JobFormData) {
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

export async function updateJobStatus(id: string, status: JobStatus) {
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

export async function deleteJob(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getLineItemCategories() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("job_line_items")
    .select("category")
    .not("category", "is", null)
    .order("category");

  const categories = [...new Set(data?.map((li) => li.category).filter(Boolean) as string[])];
  return categories;
}

// Keep old name as alias for backward compatibility with AI handlers
export const getJobCategories = getLineItemCategories;

export async function recordPayment(
  jobId: string,
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus = "paid"
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("jobs")
    .update({
      payment_method: paymentMethod,
      payment_status: paymentStatus,
    })
    .eq("id", jobId);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
