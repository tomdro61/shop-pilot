"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Types ────────────────────────────────────────────────────

export interface ManualIncomeEntry {
  id: string;
  date: string;
  amount: number;
  shop_keep_pct: number;
  label: string;
  category: string;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  customer_name?: string | null;
}

// ── Shared query helper for report integration ───────────────

export async function getManualIncomeForRange(
  startDate: string,
  endDate: string
): Promise<Array<{
  date: string;
  amount: number;
  shop_keep_pct: number;
  category: string;
  customer_id: string | null;
}>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("manual_income")
    .select("date, amount, shop_keep_pct, category, customer_id")
    .gte("date", startDate)
    .lte("date", endDate);
  return data || [];
}

// ── CRUD ─────────────────────────────────────────────────────

export async function getManualIncomeEntries(): Promise<ManualIncomeEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("manual_income")
    .select("*, customers(first_name, last_name)")
    .order("date", { ascending: false })
    .limit(500);

  if (error) return [];

  return (data || []).map((row) => {
    const customer = row.customers as { first_name: string; last_name: string } | null;
    return {
      id: row.id,
      date: row.date,
      amount: row.amount,
      shop_keep_pct: row.shop_keep_pct,
      label: row.label,
      category: row.category,
      customer_id: row.customer_id,
      notes: row.notes,
      created_at: row.created_at,
      customer_name: customer ? `${customer.first_name} ${customer.last_name}` : null,
    };
  });
}

export async function getManualIncomeCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("manual_income")
    .select("category")
    .limit(1000);

  const cats = new Set<string>();
  (data || []).forEach((row) => cats.add(row.category));
  return Array.from(cats).sort();
}

export async function createManualIncome(input: {
  date: string;
  amount: number;
  shop_keep_pct: number;
  label: string;
  category: string;
  customer_id?: string | null;
  notes?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("manual_income").insert({
    date: input.date,
    amount: input.amount,
    shop_keep_pct: input.shop_keep_pct,
    label: input.label,
    category: input.category,
    customer_id: input.customer_id || null,
    notes: input.notes || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}

export async function updateManualIncome(
  id: string,
  input: {
    date?: string;
    amount?: number;
    shop_keep_pct?: number;
    label?: string;
    category?: string;
    customer_id?: string | null;
    notes?: string | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("manual_income")
    .update(input)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}

export async function deleteManualIncome(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("manual_income")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}
