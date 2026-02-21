import { getStripe } from "@/lib/stripe";

function getReaderId(): string {
  const readerId = process.env.STRIPE_TERMINAL_READER_ID;
  if (!readerId) {
    throw new Error("STRIPE_TERMINAL_READER_ID is not set");
  }
  return readerId;
}

export async function createTerminalPaymentIntent(
  amountCents: number,
  metadata: Record<string, string>
) {
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    metadata,
  });
  return paymentIntent;
}

export async function processReaderPayment(paymentIntentId: string) {
  const stripe = getStripe();
  const readerId = getReaderId();
  const reader = await stripe.terminal.readers.processPaymentIntent(readerId, {
    payment_intent: paymentIntentId,
  });
  return reader;
}

export async function getPaymentIntentStatus(paymentIntentId: string) {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return {
    status: pi.status,
    amount: pi.amount,
    metadata: pi.metadata,
  };
}

export async function cancelReaderAction() {
  const stripe = getStripe();
  const readerId = getReaderId();
  const reader = await stripe.terminal.readers.cancelAction(readerId);
  return reader;
}
