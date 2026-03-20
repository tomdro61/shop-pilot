import { getStripe } from "./index";
import { calculateTotals } from "@/lib/utils/totals";
import type { ShopSettings } from "@/types";

// ── Parking invoice (no tax/fees, shorter payment window) ───────────

interface ParkingLineItem {
  description: string;
  amount: number; // in dollars
}

interface CreateParkingStripeInvoiceParams {
  stripeCustomerId: string;
  lineItems: ParkingLineItem[];
  description?: string;
  hasEmail?: boolean;
}

export async function createParkingStripeInvoice({
  stripeCustomerId,
  lineItems,
  description,
  hasEmail = true,
}: CreateParkingStripeInvoiceParams): Promise<{
  stripeInvoiceId: string;
  hostedInvoiceUrl: string;
  amountDue: number;
}> {
  const stripe = getStripe();

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    // send_invoice requires email; use charge_automatically for SMS-only customers
    collection_method: hasEmail ? "send_invoice" : "charge_automatically",
    ...(hasEmail ? { days_until_due: 7 } : {}),
    description: description || "Parking Services",
    auto_advance: false,
  });

  for (const item of lineItems) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: item.description,
      amount: Math.round(item.amount * 100),
      currency: "usd",
    });
  }

  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  return {
    stripeInvoiceId: finalizedInvoice.id,
    hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url || "",
    amountDue: finalizedInvoice.amount_due,
  };
}

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
  settings?: ShopSettings | null;
  hasEmail?: boolean;
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
  settings,
  hasEmail = true,
}: CreateStripeInvoiceParams): Promise<CreateStripeInvoiceResult> {
  const stripe = getStripe();
  const totals = calculateTotals(lineItems, settings);

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    // send_invoice requires email; use charge_automatically for SMS-only customers
    collection_method: hasEmail ? "send_invoice" : "charge_automatically",
    ...(hasEmail ? { days_until_due: 30 } : {}),
    description: jobCategory ? `Auto Repair - ${jobCategory}` : "Auto Repair Services",
    auto_advance: false,
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

  // Shop supplies fee
  if (totals.shopSuppliesEnabled && totals.shopSupplies > 0) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: "Shop Supplies",
      amount: Math.round(totals.shopSupplies * 100),
      currency: "usd",
    });
  }

  // Hazmat / environmental fee
  if (totals.hazmatEnabled && totals.hazmat > 0) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: totals.hazmatLabel,
      amount: Math.round(totals.hazmat * 100),
      currency: "usd",
    });
  }

  // Tax (on parts only)
  if (totals.taxAmount > 0) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: `MA Sales Tax (${(totals.taxRate * 100).toFixed(2)}%)`,
      amount: Math.round(totals.taxAmount * 100),
      currency: "usd",
    });
  }

  // Finalize (creates hosted payment URL) but don't send — staff sends manually
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  return {
    stripeInvoiceId: finalizedInvoice.id,
    hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url || "",
    amountDue: finalizedInvoice.amount_due, // in cents
  };
}
