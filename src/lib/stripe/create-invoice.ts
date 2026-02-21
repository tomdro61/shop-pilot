import { getStripe } from "./index";
import { MA_SALES_TAX_RATE } from "@/lib/constants";

interface LineItem {
  type: "labor" | "part";
  description: string;
  quantity: number;
  unit_cost: number;
}

interface CreateStripeInvoiceParams {
  stripeCustomerId: string;
  lineItems: LineItem[];
  jobCategory?: string | null;
}

interface CreateStripeInvoiceResult {
  stripeInvoiceId: string;
  hostedInvoiceUrl: string;
  amountDue: number;
}

export async function createStripeInvoice({
  stripeCustomerId,
  lineItems,
  jobCategory,
}: CreateStripeInvoiceParams): Promise<CreateStripeInvoiceResult> {
  const stripe = getStripe();

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: 30,
    description: jobCategory ? `Auto Repair - ${jobCategory}` : "Auto Repair Services",
    auto_advance: true,
  });

  // Add line items
  for (const item of lineItems) {
    const itemAmountCents = Math.round(item.quantity * item.unit_cost * 100);
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: `${item.description} (${item.quantity} x $${item.unit_cost.toFixed(2)})`,
      amount: itemAmountCents,
      currency: "usd",
    });
  }

  // Calculate parts tax (MA 6.25% on parts only)
  const partsTotal = lineItems
    .filter((li) => li.type === "part")
    .reduce((sum, li) => sum + li.quantity * li.unit_cost, 0);

  if (partsTotal > 0) {
    const taxAmountCents = Math.round(partsTotal * MA_SALES_TAX_RATE * 100);
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: `MA Sales Tax (${(MA_SALES_TAX_RATE * 100).toFixed(2)}% on parts)`,
      amount: taxAmountCents,
      currency: "usd",
    });
  }

  // Finalize and send
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  return {
    stripeInvoiceId: finalizedInvoice.id,
    hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url || "",
    amountDue: finalizedInvoice.amount_due, // in cents
  };
}
