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
      await supabase
        .from("jobs")
        .update({
          payment_status: "paid",
          payment_method: "terminal",
          stripe_payment_intent_id: pi,
          paid_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", status.metadata.job_id);
    }

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
