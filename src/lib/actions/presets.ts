"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { PresetLineItem } from "@/types";

interface PresetFormData {
  name: string;
  category: string;
  line_items: PresetLineItem[];
  sort_order?: number;
}

export async function getPresets() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_presets")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getPreset(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_presets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createPreset(formData: PresetFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_presets")
    .insert({
      name: formData.name,
      category: formData.category || null,
      line_items: JSON.parse(JSON.stringify(formData.line_items)),
      sort_order: formData.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/presets");
  revalidatePath("/jobs/new");
  return { data };
}

export async function updatePreset(id: string, formData: PresetFormData) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_presets")
    .update({
      name: formData.name,
      category: formData.category || null,
      line_items: JSON.parse(JSON.stringify(formData.line_items)),
      sort_order: formData.sort_order ?? 0,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/presets");
  revalidatePath("/jobs/new");
  return { data };
}

export async function deletePreset(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { error } = await supabase.from("job_presets").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/presets");
  revalidatePath("/jobs/new");
  return { success: true };
}

export async function applyPresetToJob(jobId: string, presetId: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { data: preset, error: presetError } = await supabase
    .from("job_presets")
    .select("line_items, category")
    .eq("id", presetId)
    .single();

  if (presetError || !preset) {
    return { error: presetError?.message || "Preset not found" };
  }

  const lineItems = preset.line_items as PresetLineItem[];
  if (!lineItems || lineItems.length === 0) {
    // No write happened — caller renders an info toast on inserted === 0.
    // No revalidate needed since nothing changed in the DB.
    return { success: true, inserted: 0 };
  }

  const rows = lineItems.map((item) => ({
    job_id: jobId,
    type: item.type as "labor" | "part",
    description: item.description,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    cost: item.type === "part" && item.cost != null ? item.cost : null,
    part_number: item.part_number || null,
    category: item.category || preset.category || null,
  }));

  const { error } = await supabase.from("job_line_items").insert(rows);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return { success: true, inserted: rows.length };
}

export async function applyPresetToEstimate(estimateId: string, presetId: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  // Block on non-draft estimates so the audit trail of what the customer
  // saw at send time stays accurate.
  const { data: estimate, error: estimateError } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", estimateId)
    .single();
  if (estimateError) return { error: estimateError.message };
  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "draft") {
    return { error: "Can only add presets to draft estimates" };
  }

  const { data: preset, error: presetError } = await supabase
    .from("job_presets")
    .select("line_items, category")
    .eq("id", presetId)
    .single();

  if (presetError || !preset) {
    return { error: presetError?.message || "Preset not found" };
  }

  const lineItems = preset.line_items as PresetLineItem[];
  if (!lineItems || lineItems.length === 0) {
    // No write happened — caller renders an info toast on inserted === 0.
    // No revalidate needed since nothing changed in the DB.
    return { success: true, inserted: 0 };
  }

  // estimate_line_items has no `cost` column (cost-tracking is jobs-only).
  const rows = lineItems.map((item) => ({
    estimate_id: estimateId,
    type: item.type as "labor" | "part",
    description: item.description,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    part_number: item.part_number || null,
    category: item.category || preset.category || null,
  }));

  const { error } = await supabase.from("estimate_line_items").insert(rows);

  if (error) return { error: error.message };

  revalidatePath(`/estimates/${estimateId}`);
  return { success: true, inserted: rows.length };
}
