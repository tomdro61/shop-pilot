"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getShopSettings } from "@/lib/actions/settings";
import {
  lineItemSchema,
  prepareLineItemData,
  splitLineItemSchema,
  SPLIT_LINE_TOTAL_MSG,
  SPLIT_PART_INSPECTION_MSG,
  SPLIT_FEE_MSG,
  PART_INSPECTION_LOCKED_MSG,
} from "@/lib/validators/job";
import { getLineItemLock, LINE_ITEMS_LOCKED_MSG, MONEY_FIELDS } from "@/lib/jobs/line-item-lock";
import { isInspectionCategory } from "@/lib/utils/revenue";
import { calculateTotals } from "@/lib/utils/totals";
import { revalidatePath } from "next/cache";
import type { LineItemFormData, SplitLineItemInput } from "@/lib/validators/job";

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
    // The tax reports pair live non-inspection line totals with the frozen
    // taxable figure, so a taxed part filed under an inspection category
    // after payment shows a taxable base larger than the gross. Labor is
    // never in the taxable base, so a labor line can move freely.
    if (
      existing.type === "part" &&
      isInspectionCategory(existing.category) !== isInspectionCategory(payload.category)
    ) {
      return { error: PART_INSPECTION_LOCKED_MSG };
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

const toCents = (amount: number) => Math.round(amount * 100);

// Replaces one line with several that add up to the same amount, checked to
// the cent. The new lines keep the original's type, so the parts subtotal and
// the taxable base stay the same and the lines still agree with the frozen
// collected figure; that is why a settled job allows it. The write itself is
// one transaction (split_job_line_item), so a killed request can't leave
// both the original and the new lines behind. A part filed under an
// inspection category drops out of job revenue in the reports, which is the
// intended cleanup for a Quick Pay line that mixed an inspection with other
// work.
export async function splitLineItem(id: string, input: SplitLineItemInput) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = splitLineItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: line, error: lineError } = await supabase
    .from("job_line_items")
    .select("id, job_id, type, quantity, unit_cost, total, cost, category")
    .eq("id", id)
    .maybeSingle();
  if (lineError) return { error: lineError.message };
  if (!line) return { error: "Line item not found" };

  // The stored total is numeric(10,2); quantity × unit_cost in float can land
  // a cent away from it on fractional hours, and the page shows the stored one.
  const originalCents = toCents(
    line.total != null ? Number(line.total) : Number(line.quantity) * Number(line.unit_cost)
  );
  const parts = parsed.data.parts.map((part) => {
    const trimmed = part.category?.trim();
    return {
      description: part.description,
      cents: toCents(part.amount),
      category: trimmed && trimmed.length > 0 ? trimmed : null,
    };
  });
  const sumCents = parts.reduce((sum, part) => sum + part.cents, 0);
  if (sumCents !== originalCents) return { error: SPLIT_LINE_TOTAL_MSG };

  if (line.type === "part") {
    const originalInspection = isInspectionCategory(line.category);
    if (parts.some((part) => isInspectionCategory(part.category) !== originalInspection)) {
      return { error: SPLIT_PART_INSPECTION_MSG };
    }
  }

  // A part's wholesale cost is shared across the new lines in proportion to
  // their amounts, with the rounding remainder on the last one, so the job's
  // parts cost (and the profit reports) stay where they were.
  const costTotalCents =
    line.type === "part" && line.cost != null
      ? toCents(Number(line.cost) * Number(line.quantity))
      : null;
  let assignedCostCents = 0;
  const costs = parts.map((part, index) => {
    if (costTotalCents == null) return null;
    if (index === parts.length - 1) return (costTotalCents - assignedCostCents) / 100;
    const share = Math.round((costTotalCents * part.cents) / originalCents);
    assignedCostCents += share;
    return share / 100;
  });

  // Shop supplies and hazmat can be scoped to categories, so new categories
  // can switch a fee on or off and move the grand total the page and the
  // receipt recompute. Refused rather than allowed to drift.
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("charge_sales_tax, job_line_items(id, type, quantity, unit_cost, total, category)")
    .eq("id", line.job_id)
    .maybeSingle();
  if (jobError) return { error: jobError.message };
  if (!job) return { error: "Job not found" };

  const settings = await getShopSettings();
  if (!settings) {
    return { error: "Couldn't load shop settings — nothing was changed. Refresh and try again." };
  }

  const currentLines = job.job_line_items ?? [];
  const before = calculateTotals(currentLines, settings, job.charge_sales_tax).grandTotal;
  const after = calculateTotals(
    [
      ...currentLines.filter((li) => li.id !== id),
      ...parts.map((part) => ({
        type: line.type,
        quantity: 1,
        unit_cost: part.cents / 100,
        total: part.cents / 100,
        category: part.category,
      })),
    ],
    settings,
    job.charge_sales_tax
  ).grandTotal;
  if (toCents(before) !== toCents(after)) return { error: SPLIT_FEE_MSG };

  const { data: ids, error: rpcError } = await supabase.rpc("split_job_line_item", {
    p_line_id: id,
    p_parts: parts.map((part, index) => ({
      description: part.description,
      amount: part.cents / 100,
      category: part.category,
      cost: costs[index],
    })),
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath(`/jobs/${line.job_id}`);
  revalidatePath("/jobs");
  return { data: { ids: ids ?? [] } };
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
