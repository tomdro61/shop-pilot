"use server";

import { createClient } from "@/lib/supabase/server";
import { lineItemSchema, prepareLineItemData } from "@/lib/validators/job";
import { revalidatePath } from "next/cache";
import type { LineItemFormData } from "@/lib/validators/job";

export async function createLineItem(formData: LineItemFormData) {
  const parsed = lineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_line_items")
    .insert(prepareLineItemData(parsed.data))
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${parsed.data.job_id}`);
  return { data };
}

export async function updateLineItem(id: string, formData: LineItemFormData) {
  const parsed = lineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_line_items")
    .update(prepareLineItemData(parsed.data))
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${parsed.data.job_id}`);
  return { data };
}

export async function deleteLineItem(id: string, jobId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("job_line_items")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}
