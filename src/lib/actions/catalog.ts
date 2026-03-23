"use server";

import { createClient } from "@/lib/supabase/server";
import { catalogItemSchema, type CatalogItemFormData } from "@/lib/validators/catalog";
import { revalidatePath } from "next/cache";

export async function searchCatalog(
  query?: string,
  category?: string,
  type?: "labor" | "part"
) {
  const supabase = await createClient();

  let q = supabase
    .from("catalog_items")
    .select("*")
    .eq("is_active", true)
    .order("usage_count", { ascending: false })
    .order("description", { ascending: true })
    .limit(30);

  if (query && query.trim()) {
    q = q.ilike("description", `%${query.trim()}%`);
  }
  if (category) {
    q = q.eq("category", category);
  }
  if (type) {
    q = q.eq("type", type);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function getCatalogItems(
  category?: string,
  type?: "labor" | "part"
) {
  const supabase = await createClient();

  let q = supabase
    .from("catalog_items")
    .select("*")
    .order("category", { ascending: true })
    .order("type", { ascending: true })
    .order("description", { ascending: true });

  if (category) {
    q = q.eq("category", category);
  }
  if (type) {
    q = q.eq("type", type);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function getCatalogItem(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createCatalogItem(formData: CatalogItemFormData) {
  const parsed = catalogItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .insert({
      type: parsed.data.type,
      description: parsed.data.description,
      default_quantity: parsed.data.default_quantity,
      default_unit_cost: parsed.data.default_unit_cost,
      default_cost:
        parsed.data.type === "part" ? (parsed.data.default_cost ?? null) : null,
      part_number: parsed.data.part_number || null,
      category: parsed.data.category || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/settings/catalog");
  revalidatePath("/jobs");
  return { data };
}

export async function updateCatalogItem(
  id: string,
  formData: CatalogItemFormData
) {
  const parsed = catalogItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .update({
      type: parsed.data.type,
      description: parsed.data.description,
      default_quantity: parsed.data.default_quantity,
      default_unit_cost: parsed.data.default_unit_cost,
      default_cost:
        parsed.data.type === "part" ? (parsed.data.default_cost ?? null) : null,
      part_number: parsed.data.part_number || null,
      category: parsed.data.category || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/settings/catalog");
  revalidatePath("/jobs");
  return { data };
}

export async function deactivateCatalogItem(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalog_items")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/settings/catalog");
  return { data };
}

export async function deleteCatalogItem(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("catalog_items")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/settings/catalog");
  return { success: true };
}

export async function saveToCatalog(lineItemData: {
  type: "labor" | "part";
  description: string;
  quantity: number;
  unit_cost: number;
  cost?: number | null;
  part_number?: string | null;
  category?: string | null;
}) {
  const supabase = await createClient();

  // Case-insensitive duplicate check by description + type
  const { data: existing } = await supabase
    .from("catalog_items")
    .select("id")
    .eq("type", lineItemData.type)
    .ilike("description", lineItemData.description.trim())
    .limit(1);

  if (existing && existing.length > 0) {
    return { duplicate: true, message: "Already in catalog" };
  }

  const { data, error } = await supabase
    .from("catalog_items")
    .insert({
      type: lineItemData.type,
      description: lineItemData.description.trim(),
      default_quantity: lineItemData.quantity,
      default_unit_cost: lineItemData.unit_cost,
      default_cost:
        lineItemData.type === "part" ? (lineItemData.cost ?? null) : null,
      part_number: lineItemData.part_number || null,
      category: lineItemData.category || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/settings/catalog");
  return { data };
}

export async function incrementUsageCount(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("catalog_items")
    .select("usage_count")
    .eq("id", id)
    .single();

  if (data) {
    await supabase
      .from("catalog_items")
      .update({ usage_count: (data.usage_count || 0) + 1 })
      .eq("id", id);
  }
}

export async function addCatalogItemsToJob(
  jobId: string,
  items: {
    catalog_item_id: string;
    quantity?: number;
    unit_cost?: number;
    category?: string;
  }[]
) {
  if (!items.length) return { success: true };

  const supabase = await createClient();

  // Fetch all catalog items
  const ids = items.map((i) => i.catalog_item_id);
  const { data: catalogItems, error: fetchError } = await supabase
    .from("catalog_items")
    .select("*")
    .in("id", ids);

  if (fetchError) return { error: fetchError.message };
  if (!catalogItems || catalogItems.length === 0) {
    return { error: "No catalog items found" };
  }

  // Map to line item rows
  const rows = items
    .map((item) => {
      const ci = catalogItems.find((c) => c.id === item.catalog_item_id);
      if (!ci) return null;
      return {
        job_id: jobId,
        type: ci.type as "labor" | "part",
        description: ci.description,
        quantity: item.quantity ?? ci.default_quantity,
        unit_cost: item.unit_cost ?? ci.default_unit_cost,
        cost: ci.type === "part" ? (ci.default_cost ?? null) : null,
        part_number: ci.part_number || null,
        category: item.category || ci.category || null,
      };
    })
    .filter(Boolean) as {
    job_id: string;
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
    cost: number | null;
    part_number: string | null;
    category: string | null;
  }[];

  const { error: insertError } = await supabase
    .from("job_line_items")
    .insert(rows);

  if (insertError) return { error: insertError.message };

  // Bump usage counts (fire and forget)
  for (const item of items) {
    incrementUsageCount(item.catalog_item_id);
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { success: true, count: rows.length };
}
