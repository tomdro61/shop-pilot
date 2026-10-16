"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { assertComplete } from "@/lib/supabase/assert-complete";
import {
  manualIncomeSchema,
  manualIncomeUpdateSchema,
  type ManualIncomeInput,
  type ManualIncomeUpdateInput,
} from "@/lib/validators/manual-income";

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
  created_at: string | null;
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
  // Summed into revenue figures, so a failed or truncated read must throw
  // rather than understate them.
  return assertComplete(
    await supabase
      .from("manual_income")
      .select("date, amount, shop_keep_pct, category, customer_id", { count: "exact" })
      .gte("date", startDate)
      .lte("date", endDate)
      .order("id", { ascending: true }),
    "manual income"
  );
}

// ── CRUD ─────────────────────────────────────────────────────

export async function getManualIncomeEntries(): Promise<ManualIncomeEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("manual_income")
    .select("*, customers(first_name, last_name)")
    .order("date", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Failed to load manual income entries: ${error.message}`);

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
  const { data, error } = await supabase
    .from("manual_income")
    .select("category")
    .limit(1000);

  if (error) throw new Error(`Failed to load manual income categories: ${error.message}`);

  const cats = new Set<string>();
  (data || []).forEach((row) => cats.add(row.category));
  return Array.from(cats).sort();
}

export async function createManualIncome(input: ManualIncomeInput) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = manualIncomeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const valid = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("manual_income").insert({
    date: valid.date,
    amount: valid.amount,
    shop_keep_pct: valid.shop_keep_pct,
    label: valid.label,
    category: valid.category,
    customer_id: valid.customer_id || null,
    notes: valid.notes || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}

export async function updateManualIncome(id: string, input: ManualIncomeUpdateInput) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const parsed = manualIncomeUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("manual_income")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}

export async function deleteManualIncome(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("manual_income")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}
