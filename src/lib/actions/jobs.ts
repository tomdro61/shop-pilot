"use server";

import { createClient } from "@/lib/supabase/server";
import { jobSchema, prepareJobData } from "@/lib/validators/job";
import { revalidatePath } from "next/cache";
import type { JobFormData } from "@/lib/validators/job";
import type { JobStatus, PaymentMethod, PaymentStatus } from "@/types";

export async function getJobs(filters?: {
  search?: string;
  status?: JobStatus;
  category?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("jobs")
    .select("*, customers(id, first_name, last_name, phone), vehicles(id, year, make, model), users(id, name), job_line_items(total)")
    .order("date_received", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  if (filters?.search) {
    // Search by customer name - we need to filter client-side since
    // Supabase doesn't support filtering by related table fields directly
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const searchLower = filters.search.toLowerCase();
    return data.filter((job) => {
      const customer = job.customers as { first_name: string; last_name: string } | null;
      const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
      const customerName = customer
        ? `${customer.first_name} ${customer.last_name}`.toLowerCase()
        : "";
      const vehicleStr = vehicle
        ? [vehicle.year, vehicle.make, vehicle.model]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        : "";
      return (
        customerName.includes(searchLower) ||
        vehicleStr.includes(searchLower) ||
        (job.category || "").toLowerCase().includes(searchLower) ||
        (job.notes || "").toLowerCase().includes(searchLower)
      );
    });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getJob(id: string) {
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
}

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

  // Auto-set date_finished when completing
  if (status === "complete") {
    updateData.date_finished = new Date().toISOString().split("T")[0];
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

export async function getJobCategories() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select("category")
    .not("category", "is", null)
    .order("category");

  const categories = [...new Set(data?.map((j) => j.category).filter(Boolean) as string[])];
  return categories;
}

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
