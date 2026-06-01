import type Stripe from "stripe";
import { getStripe } from "./index";
import { calculateTotals, type TotalsBreakdown } from "@/lib/utils/totals";
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

  if (!invoice.id) {
    throw new Error("Stripe did not return an invoice id");
  }

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
    stripeInvoiceId: finalizedInvoice.id ?? "",
    hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url || "",
    amountDue: finalizedInvoice.amount_due,
  };
}

export interface StripeInvoiceLineItem {
  type: "labor" | "part";
  description: string;
  quantity: number;
  unit_cost: number;
}

export async function addJobInvoiceItems(
  stripe: Stripe,
  invoiceId: string,
  stripeCustomerId: string,
  lineItems: StripeInvoiceLineItem[],
  totals: TotalsBreakdown
): Promise<void> {
  for (const item of lineItems) {
    const itemAmountCents = Math.round(item.quantity * item.unit_cost * 100);
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoiceId,
      description: `${item.description} (${item.quantity} x $${item.unit_cost.toFixed(2)})`,
      amount: itemAmountCents,
      currency: "usd",
    });
  }

  if (totals.shopSuppliesEnabled && totals.shopSupplies > 0) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoiceId,
      description: "Shop Supplies",
      amount: Math.round(totals.shopSupplies * 100),
      currency: "usd",
    });
  }

  if (totals.hazmatEnabled && totals.hazmat > 0) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoiceId,
      description: totals.hazmatLabel,
      amount: Math.round(totals.hazmat * 100),
      currency: "usd",
    });
  }

  if (totals.taxAmount > 0) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoiceId,
      description: `MA Sales Tax (${(totals.taxRate * 100).toFixed(2)}%)`,
      amount: Math.round(totals.taxAmount * 100),
      currency: "usd",
    });
  }
}

interface CreateStripeInvoiceParams {
  stripeCustomerId: string;
  lineItems: StripeInvoiceLineItem[];
  jobCategory?: string | null;
  settings?: ShopSettings | null;
  hasEmail?: boolean;
  // false → no sales tax on this invoice (the tax line item is suppressed
  // because totals.taxAmount becomes 0). Default true = existing behavior.
  chargeSalesTax?: boolean;
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
  chargeSalesTax = true,
}: CreateStripeInvoiceParams): Promise<CreateStripeInvoiceResult> {
  const stripe = getStripe();
  const totals = calculateTotals(lineItems, settings, chargeSalesTax);

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    // send_invoice requires email; use charge_automatically for SMS-only customers
    collection_method: hasEmail ? "send_invoice" : "charge_automatically",
    ...(hasEmail ? { days_until_due: 30 } : {}),
    description: jobCategory ? `Auto Repair - ${jobCategory}` : "Auto Repair Services",
    auto_advance: false,
  });

  if (!invoice.id) {
    throw new Error("Stripe did not return an invoice id");
  }

  await addJobInvoiceItems(stripe, invoice.id, stripeCustomerId, lineItems, totals);

  // Finalize (creates hosted payment URL) but don't send — staff sends manually
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  return {
    stripeInvoiceId: finalizedInvoice.id ?? "",
    hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url || "",
    amountDue: finalizedInvoice.amount_due, // in cents
  };
}
