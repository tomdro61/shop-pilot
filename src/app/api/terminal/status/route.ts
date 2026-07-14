import { NextRequest, NextResponse } from "next/server";
import { getPaymentIntentStatus } from "@/lib/stripe/terminal";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";
import { recordQuickPayJob } from "@/lib/stripe/quick-pay";

export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const pi = request.nextUrl.searchParams.get("pi");

  if (!pi) {
    return NextResponse.json(
      { error: "pi query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const status = await getPaymentIntentStatus(pi);

    // On success, record the payment directly (belt-and-suspenders with the
    // webhook). Two recording paths land here, plus a no-metadata warn below.
    let jobId: string | null = null;
    if (status.status === "succeeded" && status.metadata?.quick_pay === "true") {
      // Deferred Quick Pay — idempotent backstop; see record_quick_pay_job.
      jobId = await recordQuickPayJob({
        paymentIntentId: pi,
        amountCents: status.amount,
        note: status.metadata.note ?? null,
        category: status.metadata.category ?? null,
        source: "terminal-status",
      });
    } else if (status.status === "succeeded" && status.metadata?.job_id) {
      // Regular terminal payment on an existing job — flip it to paid.
      const supabase = createAdminClient();
      const { error: updateError } = await supabase
        .from("jobs")
        .update({
          payment_status: "paid",
          payment_method: "terminal",
          stripe_payment_intent_id: pi,
          paid_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", status.metadata.job_id)
        .neq("payment_status", "paid");

      if (updateError) {
        console.error("[Terminal] Failed to update job payment status:", updateError);
      }
    } else if (status.status === "succeeded") {
      console.warn("[Terminal] Payment succeeded but no job_id/quick_pay in metadata:", pi);
    }

    return NextResponse.json({ ...status, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
