"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { lineItemSchema, prepareLineItemData } from "@/lib/validators/job";
import { getLineItemLock, LINE_ITEMS_LOCKED_MSG, MONEY_FIELDS } from "@/lib/jobs/line-item-lock";
import { isInspectionCategory } from "@/lib/utils/revenue";
import { revalidatePath } from "next/cache";
import type { LineItemFormData } from "@/lib/validators/job";

export async function createLineItem(formData: LineItemFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = lineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const lock = await getLineItemLock(supabase, parsed.data.job_id);
  if (!lock.ok) return { error: lock.error };
  if (lock.locked) return { error: LINE_ITEMS_LOCKED_MSG };

  const { data, error } = await supabase
    .from("job_line_items")
    .insert(prepareLineItemData(parsed.data))
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${parsed.data.job_id}`);
  revalidatePath("/jobs");
  return { data };
}

export async function getLineItemById(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_line_items")
    .select("id, job_id, type, description, quantity, unit_cost, cost, part_number, category")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Line item not found" };
  return { data };
}

export async function updateLineItem(id: string, formData: LineItemFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = lineItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // The row's own job is the one that gets updated. The payload's job_id is
  // not trusted: it was previously written through, which could move a line
  // (and its revenue) onto another job.
  const { data: existing, error: existingError } = await supabase
    .from("job_line_items")
    .select("job_id, type, quantity, unit_cost, category")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (!existing) return { error: "Line item not found" };

  const lock = await getLineItemLock(supabase, existing.job_id);
  if (!lock.ok) return { error: lock.error };

  const payload = prepareLineItemData({ ...parsed.data, job_id: existing.job_id });

  if (lock.locked) {
    const moneyChanged = MONEY_FIELDS.some(
      (field) => Number(payload[field]) !== Number(existing[field]) && payload[field] !== existing[field]
    );
    if (moneyChanged) return { error: LINE_ITEMS_LOCKED_MSG };
    // Revenue reports drop inspection-category lines, so moving a settled line
    // across that boundary restates a closed period.
    if (isInspectionCategory(existing.category) !== isInspectionCategory(payload.category)) {
      return {
        error:
          "This job is settled, so a line can't move into or out of an inspection category. Mark it as unpaid first.",
      };
    }
  }

  const { data, error } = await supabase
    .from("job_line_items")
    .update(payload)
    .eq("id", id)
    .eq("job_id", existing.job_id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${existing.job_id}`);
  revalidatePath("/jobs");
  return { data };
}

export async function deleteLineItem(id: string, jobId: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const lock = await getLineItemLock(supabase, jobId);
  if (!lock.ok) return { error: lock.error };
  if (lock.locked) return { error: LINE_ITEMS_LOCKED_MSG };

  const { data: deleted, error } = await supabase
    .from("job_line_items")
    .delete()
    .eq("id", id)
    .eq("job_id", jobId)
    .select("id");

  if (error) return { error: error.message };
  if (!deleted || deleted.length === 0) {
    return { error: "Line item not found on this job" };
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { success: true };
}
