"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertComplete } from "@/lib/supabase/assert-complete";
import type { Tables } from "@/types/supabase";

export type InspectionCounts = Pick<
  Tables<"daily_inspection_counts">,
  "state_count" | "tnc_count"
>;

/**
 * Three outcomes the caller can tell apart: the counts, null for a date with
 * no row yet, or a throw. Null-for-no-row holds while the SELECT policy stays
 * `USING (true)` — an RLS-filtered read is also null with no error, which
 * would put a date that has counts back on the same screen as one that has
 * none.
 */
export async function getInspectionCounts(
  date: string
): Promise<InspectionCounts | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_inspection_counts")
    .select("state_count, tnc_count")
    .eq("date", date)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load inspection counts for ${date}: ${error.message}`);
  }
  return data;
}

// No requireManager() here: the "Managers can manage inspection counts" RLS
// policy (20260311100000_fix_rls_security.sql) gates writes on is_manager(),
// and the anon-key client this action uses is subject to it.
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

  if (error) {
    throw new Error(
      `Failed to save inspection counts for ${date} (${state_count}/${tnc_count}): ${error.message}`,
      { cause: error }
    );
  }
  revalidatePath("/inspections");
}

export async function getInspectionCountsRange(
  start: string,
  end: string
): Promise<{ state_count: number; tnc_count: number }> {
  const supabase = await createClient();
  // `error` used to be discarded, so a failed read returned zeros and every
  // consumer showed "0 inspections" — identical to a week the shop genuinely
  // inspected nothing, and it understates gross profit by the whole inspection
  // margin on the revenue report.
  //
  // Counted as well as error-checked: this table is one row per date, so the
  // "All Time" range crosses the 1000-row cap after ~2.7 years of daily
  // entries, and a truncated read arrives as a clean HTTP 200.
  const data = assertComplete(
    await supabase
      .from("daily_inspection_counts")
      .select("state_count, tnc_count", { count: "exact" })
      .gte("date", start)
      .lte("date", end),
    "inspection counts"
  );

  const totals = (data || []).reduce(
    (acc, row) => ({
      state_count: acc.state_count + (row.state_count || 0),
      tnc_count: acc.tnc_count + (row.tnc_count || 0),
    }),
    { state_count: 0, tnc_count: 0 }
  );

  return totals;
}
