import { NextRequest, NextResponse } from "next/server";
import { getPaymentIntentStatus } from "@/lib/stripe/terminal";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const pi = request.nextUrl.searchParams.get("pi");

  if (!pi) {
    return NextResponse.json(
      { error: "pi query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const status = await getPaymentIntentStatus(pi);

    // When payment succeeds, update the job directly (belt-and-suspenders with webhook)
    if (status.status === "succeeded" && status.metadata?.job_id) {
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
      console.warn("[Terminal] Payment succeeded but no job_id in metadata:", pi);
    }

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
