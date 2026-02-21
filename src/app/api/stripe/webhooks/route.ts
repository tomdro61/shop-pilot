import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const stripeInvoice = event.data.object as Stripe.Invoice;
    await handleInvoicePaid(stripeInvoice);
  }

  return NextResponse.json({ received: true });
}

async function handleInvoicePaid(stripeInvoice: Stripe.Invoice) {
  const supabase = createAdminClient();

  // Find our invoice by Stripe invoice ID
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, job_id")
    .eq("stripe_invoice_id", stripeInvoice.id)
    .maybeSingle();

  if (error || !invoice) return;

  // Update invoice status
  await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: "stripe",
    })
    .eq("id", invoice.id);

  // Update job status to paid
  await supabase
    .from("jobs")
    .update({
      status: "paid",
      date_finished: new Date().toISOString().split("T")[0],
    })
    .eq("id", invoice.job_id);
}
