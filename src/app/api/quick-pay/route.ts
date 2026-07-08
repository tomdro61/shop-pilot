import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";
import { todayET } from "@/lib/utils";

const WALK_IN_CUSTOMER_ID = "00000000-0000-0000-0000-000000000000";

// Quick Pay job creation runs here (admin client) rather than in a server
// action so techs — who have no RLS INSERT on jobs/job_line_items — can still
// take counter payments. requireStaff() is the authorization gate.
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { amountCents, note, category } = await request.json();

  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "A positive amountCents is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: WALK_IN_CUSTOMER_ID,
      status: "complete",
      category: category || "Quick Pay",
      date_received: todayET(),
      date_finished: todayET(),
      notes: note || null,
      payment_status: "unpaid",
      // Quick Pay is a flat, tax-inclusive counter amount — nothing to tax on
      // top. Defaulting these jobs to tax-off keeps a later itemized
      // reconciliation (parts + labor) summing to exactly what was collected.
      charge_sales_tax: false,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || "Failed to create job" }, { status: 500 });
  }

  const { error: lineItemError } = await supabase.from("job_line_items").insert({
    job_id: job.id,
    type: "labor",
    description: note || "Quick Pay",
    quantity: 1,
    unit_cost: amountCents / 100,
    category: category || null,
  });

  if (lineItemError) {
    return NextResponse.json({ error: lineItemError.message }, { status: 500 });
  }

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return NextResponse.json({ jobId: job.id });
}
