import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type Client = SupabaseClient<Database>;

export const LINE_ITEMS_LOCKED_MSG =
  "This job is settled, so its line items can't change the amount. Mark it as unpaid first.";

export const MONEY_FIELDS = ["type", "quantity", "unit_cost"] as const;

export type LineItemLockResult =
  | { ok: true; locked: boolean }
  | { ok: false; error: string };

// Once a job is paid or waived, the amount is frozen: a paid job's collected
// figure has been snapshotted and reported. Adding or removing a line, or
// changing a line's type, quantity or unit cost, would make the lines disagree
// with that figure and the customer's receipt. Description, wholesale cost and
// part number stay editable; category stays editable except across the
// inspection boundary (updateLineItem), since category also scopes shop
// supplies / hazmat and the reports' inspection exclusion.
export async function getLineItemLock(
  supabase: Client,
  jobId: string
): Promise<LineItemLockResult> {
  const { data: job, error } = await supabase
    .from("jobs")
    .select("payment_status")
    .eq("id", jobId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!job) return { ok: false, error: "Job not found" };

  return {
    ok: true,
    locked: job.payment_status === "paid" || job.payment_status === "waived",
  };
}

export function isSettledPaymentStatus(status: string | null | undefined): boolean {
  return status === "paid" || status === "waived";
}
