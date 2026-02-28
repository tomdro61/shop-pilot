"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { DailyInspectionCount } from "@/types";

export async function getInspectionCounts(
  date: string
): Promise<DailyInspectionCount | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_inspection_counts")
    .select("*")
    .eq("date", date)
    .maybeSingle();
  return data as DailyInspectionCount | null;
}

export async function upsertInspectionCounts(
  date: string,
  state_count: number,
  tnc_count: number
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_inspection_counts")
    .upsert(
      { date, state_count, tnc_count, updated_at: new Date().toISOString() },
      { onConflict: "date" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/inspections");
}

export async function getInspectionCountsRange(
  start: string,
  end: string
): Promise<{ state_count: number; tnc_count: number }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_inspection_counts")
    .select("state_count, tnc_count")
    .gte("date", start)
    .lte("date", end);

  const totals = (data || []).reduce(
    (acc, row) => ({
      state_count: acc.state_count + (row.state_count || 0),
      tnc_count: acc.tnc_count + (row.tnc_count || 0),
    }),
    { state_count: 0, tnc_count: 0 }
  );

  return totals;
}
