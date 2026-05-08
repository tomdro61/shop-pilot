import type Stripe from "stripe";

export type CardBrand = Stripe.PaymentMethod.Card["brand"];

// Partial<Record<CardBrand, _>> so a typo in a known brand fails to compile,
// but `brandLabel` still accepts string at the runtime boundary for forward-
// compat with brands the SDK's union doesn't yet know about.
const BRAND_LABELS: Partial<Record<CardBrand, string>> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  link: "Link",
  eftpos_au: "Eftpos AU",
  unknown: "Card",
};

export function brandLabel(brand: string): string {
  return (
    BRAND_LABELS[brand.toLowerCase() as CardBrand] ||
    brand.charAt(0).toUpperCase() + brand.slice(1)
  );
}
