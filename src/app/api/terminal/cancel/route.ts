import { NextResponse } from "next/server";
import { cancelReaderAction } from "@/lib/stripe/terminal";
import { getStripe } from "@/lib/stripe";
import { requireStaff } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { paymentIntentId } = await request.json();

    // Cancel the reader action
    await cancelReaderAction();

    // Cancel the PaymentIntent if provided
    if (paymentIntentId) {
      const stripe = getStripe();
      await stripe.paymentIntents.cancel(paymentIntentId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
