import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { EstimateStatus } from "@/types";

// Line items and the vehicle can change while the estimate is draft or sent.
// Once a customer has approved or declined, those fields are frozen — the
// manager duplicates the estimate to send a revised version. (Approval and
// convert-to-job still set job_id; declined estimates can still be deleted.)
export function isEditableStatus(status: EstimateStatus): boolean {
  return status === "draft" || status === "sent";
}

export const NOT_EDITABLE_MSG =
  "Only draft or sent estimates can be edited — duplicate this one to make changes";

// Stamp after a successful content write so the detail page can flag a sent
// estimate as "edited since last sent" and the manager knows to resend.
//
// The line-item write itself carries no status predicate, so a customer
// approval that lands between the status read and the write can leave an
// approved estimate holding an item the customer never saw. The stamp is
// scoped to draft/sent so that race at least surfaces as a warning instead
// of a green toast.
export async function stampEstimateEdited(
  supabase: SupabaseClient<Database>,
  estimateId: string
): Promise<string | null> {
  const { error, count } = await supabase
    .from("estimates")
    .update({ last_edited_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", estimateId)
    .in("status", ["draft", "sent"]);
  if (error) return error.message;
  if (count !== 1) {
    return "the estimate was approved or declined while you were editing — duplicate it to send a revised version";
  }
  return null;
}

export function isEditedSinceSent(row: {
  status: EstimateStatus;
  sent_at: string | null;
  last_sent_at: string | null;
  last_edited_at: string | null;
}): boolean {
  if (row.status !== "sent" || !row.last_edited_at) return false;
  const lastSent = row.last_sent_at ?? row.sent_at;
  if (!lastSent) return false;
  return new Date(row.last_edited_at) > new Date(lastSent);
}
