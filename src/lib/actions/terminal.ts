"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const WALK_IN_CUSTOMER_ID = "00000000-0000-0000-0000-000000000000";

export async function createQuickPayJob(amountCents: number, note?: string, category?: string) {
  const supabase = await createClient();

  // Create skeleton job linked to walk-in customer
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: WALK_IN_CUSTOMER_ID,
      status: "complete",
      category: category || "Quick Pay",
      date_received: new Date().toISOString().split("T")[0],
      date_finished: new Date().toISOString().split("T")[0],
      notes: note || null,
      payment_status: "unpaid",
    })
    .select()
    .single();

  if (jobError || !job) {
    return { error: jobError?.message || "Failed to create job" };
  }

  // Add a single line item for the amount
  const amountDollars = amountCents / 100;
  const { error: lineItemError } = await supabase
    .from("job_line_items")
    .insert({
      job_id: job.id,
      type: "labor",
      description: note || "Quick Pay",
      quantity: 1,
      unit_cost: amountDollars,
    });

  if (lineItemError) {
    return { error: lineItemError.message };
  }

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return { data: { jobId: job.id } };
}

export async function linkQuickPayToCustomer(
  jobId: string,
  customerId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("jobs")
    .update({ customer_id: customerId })
    .eq("id", jobId);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
